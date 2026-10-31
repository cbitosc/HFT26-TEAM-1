"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser, AuthResponse } from "../types";
import {
  getAuthToken,
  setAuthToken,
  loginApi,
  signupApi,
  forgotPasswordApi,
  resetPasswordApi,
  fetchCurrentUserApi,
  updateProfileApi,
  logoutApi
} from "../lib/api";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthResponse>;
  signup: (fullName: string, email: string, password: string, confirmPassword?: string) => Promise<AuthResponse>;
  forgotPassword: (email: string) => Promise<{ status: string; message: string; reset_token?: string }>;
  resetPassword: (accessToken: string, newPassword: string) => Promise<{ status: string; message: string }>;
  logout: () => Promise<void>;
  updateProfile: (fullName?: string, institution?: string) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize session from storage
  useEffect(() => {
    const existingToken = getAuthToken();
    if (!existingToken) {
      setLoading(false);
      return;
    }

    setTokenState(existingToken);
    fetchCurrentUserApi()
      .then((currUser) => {
        setUser(currUser);
      })
      .catch((err) => {
        console.warn("Session expired or invalid, logging out:", err);
        setAuthToken(null);
        setTokenState(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<AuthResponse> => {
    const res = await loginApi({ email, password, remember_me: rememberMe });
    setAuthToken(res.access_token, rememberMe);
    setTokenState(res.access_token);
    setUser(res.user);
    return res;
  };

  const signup = async (
    fullName: string,
    email: string,
    password: string,
    confirmPassword?: string
  ): Promise<AuthResponse> => {
    const res = await signupApi({
      full_name: fullName,
      email,
      password,
      confirm_password: confirmPassword
    });
    setAuthToken(res.access_token, true);
    setTokenState(res.access_token);
    setUser(res.user);
    return res;
  };

  const forgotPassword = async (email: string) => {
    return await forgotPasswordApi(email);
  };

  const resetPassword = async (accessToken: string, newPassword: string) => {
    return await resetPasswordApi({ access_token: accessToken, new_password: newPassword });
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      setAuthToken(null);
      setTokenState(null);
      setUser(null);
    }
  };

  const updateProfile = async (fullName?: string, institution?: string): Promise<AuthUser> => {
    const updated = await updateProfileApi({ full_name: fullName, institution });
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        signup,
        forgotPassword,
        resetPassword,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
