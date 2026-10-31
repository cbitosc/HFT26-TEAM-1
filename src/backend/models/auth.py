"""
VERITAS — Authentication & User Profile Models
Defines Pydantic schemas for authentication requests, tokens, and user contexts.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SignUpRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="User full name")
    email: str = Field(..., min_length=5, max_length=255, description="Registered email address")
    password: str = Field(..., min_length=8, description="Password (at least 8 characters)")
    confirm_password: Optional[str] = Field(None, description="Password confirmation")


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255, description="User email address")
    password: str = Field(..., description="User password")
    remember_me: bool = Field(True, description="Persist session securely")


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255, description="Email address for password reset")


class ResetPasswordRequest(BaseModel):
    access_token: str = Field(..., description="Password reset verification token")
    new_password: str = Field(..., min_length=8, description="New password (at least 8 characters)")


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    institution: Optional[str] = Field(None, max_length=150)


class AuthUser(BaseModel):
    id: str = Field(..., description="Unique UUID of user")
    email: str = Field(..., description="User email address")
    full_name: str = Field(..., description="User full name")
    institution: Optional[str] = None
    created_at: str = Field(..., description="ISO 8601 registration timestamp")


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser
    message: Optional[str] = None
