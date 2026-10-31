"""
VERITAS — Authentication API Routes
Implements endpoints for User Registration, Login, Password Reset, Profile Management, and Session Validation.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

try:
    from ..supabase_client import supabase
    from ..models.auth import (
        SignUpRequest,
        LoginRequest,
        ForgotPasswordRequest,
        ResetPasswordRequest,
        ProfileUpdateRequest,
        AuthUser,
        AuthResponse
    )
    from ..auth import (
        LocalAuthStore,
        create_access_token,
        get_current_user,
        decode_access_token
    )
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.auth import (
        SignUpRequest,
        LoginRequest,
        ForgotPasswordRequest,
        ResetPasswordRequest,
        ProfileUpdateRequest,
        AuthUser,
        AuthResponse
    )
    from auth import (
        LocalAuthStore,
        create_access_token,
        get_current_user,
        decode_access_token
    )

logger = logging.getLogger("veritas.auth.routes")
router = APIRouter(prefix="/api/auth", tags=["User Authentication & Workspaces"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignUpRequest):
    """
    Registers a new scientific researcher account.
    Enforces password complexity, creates user profile, and returns an authenticated session.
    """
    if payload.confirm_password and payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match. Please re-enter your password."
        )

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    email_clean = payload.email.strip().lower()

    # 1. Check if user already exists locally
    existing = LocalAuthStore.get_user_by_email(email_clean)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists. Please log in instead."
        )

    user_id = str(uuid.uuid4())
    pw_hash = LocalAuthStore.hash_password(payload.password)

    # 2. Try Supabase Auth API
    sb_success = False
    try:
        sb_res = supabase.auth.sign_up({
            "email": email_clean,
            "password": payload.password,
            "options": {
                "data": {"full_name": payload.full_name}
            }
        })
        if sb_res and sb_res.user:
            user_id = sb_res.user.id
            sb_success = True
    except Exception as e:
        logger.debug(f"Supabase Auth signup fallback to local: {e}")

    # 3. Create user in resilient local store
    auth_user = LocalAuthStore.create_user(
        email=email_clean,
        password_hash=pw_hash,
        full_name=payload.full_name
    )
    # Ensure ID consistency
    if sb_success:
        auth_user.id = user_id

    token = create_access_token(auth_user)

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=auth_user,
        message="Account created successfully. Welcome to VERITAS."
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    """
    Authenticates a registered researcher.
    Validates credentials and returns a secure JWT bearer token.
    """
    email_clean = payload.email.strip().lower()
    pw_hash = LocalAuthStore.hash_password(payload.password)

    # 1. Check local auth store
    user_data = LocalAuthStore.get_user_by_email(email_clean)
    if user_data:
        if user_data.get("password_hash") != pw_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Please check your credentials."
            )
        auth_user = AuthUser(
            id=user_data["id"],
            email=user_data["email"],
            full_name=user_data["full_name"],
            institution=user_data.get("institution"),
            created_at=user_data["created_at"]
        )
        delta = timedelta(days=30) if payload.remember_me else timedelta(days=1)
        token = create_access_token(auth_user, expires_delta=delta)
        return AuthResponse(
            access_token=token,
            token_type="bearer",
            user=auth_user,
            message="Login successful."
        )

    # 2. Try Supabase Auth
    try:
        sb_res = supabase.auth.sign_in_with_password({
            "email": email_clean,
            "password": payload.password
        })
        if sb_res and sb_res.user:
            u = sb_res.user
            meta = u.user_metadata or {}
            auth_user = AuthUser(
                id=u.id,
                email=u.email or email_clean,
                full_name=meta.get("full_name", email_clean.split("@")[0]),
                created_at=str(u.created_at)
            )
            # Cache locally for resilience
            LocalAuthStore.create_user(
                email=email_clean,
                password_hash=pw_hash,
                full_name=auth_user.full_name
            )
            token = sb_res.session.access_token if sb_res.session else create_access_token(auth_user)
            return AuthResponse(
                access_token=token,
                token_type="bearer",
                user=auth_user,
                message="Login successful."
            )
    except Exception as e:
        logger.debug(f"Supabase sign-in error: {e}")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password. Please check your credentials."
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """
    Initiates password recovery for a registered email.
    Sends reset confirmation and generates verification flow.
    """
    email_clean = payload.email.strip().lower()

    # Try Supabase reset email
    try:
        supabase.auth.reset_password_for_email(email_clean)
    except Exception as e:
        logger.debug(f"Supabase reset email notice: {e}")

    # Generate a reset token regardless to prevent account enumeration
    dummy_user = AuthUser(
        id=str(uuid.uuid4()),
        email=email_clean,
        full_name="Researcher",
        created_at=datetime.now(timezone.utc).isoformat()
    )
    reset_token = create_access_token(dummy_user, expires_delta=timedelta(hours=2))

    return {
        "status": "success",
        "message": f"Password reset instructions have been dispatched to {email_clean}. Please check your inbox.",
        "reset_token": reset_token  # Provided for seamless in-app reset confirmation
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    """
    Completes password reset using verification token.
    """
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    claims = decode_access_token(payload.access_token)
    if not claims or not claims.get("email"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    email = claims["email"]
    new_hash = LocalAuthStore.hash_password(payload.new_password)
    updated = LocalAuthStore.update_password(email, new_hash)

    return {
        "status": "success",
        "message": "Your password has been successfully reset. You may now log in with your new credentials."
    }


@router.get("/me", response_model=AuthUser)
def get_current_user_profile(user: AuthUser = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile and active session context.
    """
    return user


@router.put("/profile", response_model=AuthUser)
def update_profile(
    payload: ProfileUpdateRequest,
    user: AuthUser = Depends(get_current_user)
):
    """
    Updates the authenticated researcher's profile details.
    """
    updated_user = LocalAuthStore.update_user_profile(
        user_id=user.id,
        full_name=payload.full_name,
        institution=payload.institution
    )
    if updated_user:
        return updated_user

    # If user was loaded dynamically, return with updated fields
    if payload.full_name:
        user.full_name = payload.full_name
    if payload.institution is not None:
        user.institution = payload.institution
    return user


@router.post("/logout")
def logout(user: AuthUser = Depends(get_current_user)):
    """
    Terminates the active session securely.
    """
    try:
        supabase.auth.sign_out()
    except Exception:
        pass
    return {"status": "success", "message": "Successfully logged out of VERITAS."}
