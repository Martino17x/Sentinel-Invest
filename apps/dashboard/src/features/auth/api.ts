/**
 * Feature `auth` — fuente única para authApi + profileApi + connectionsApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C6).
 * Mover, no duplicar. Importa apiFetch + token helpers desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch, setAccessToken } from "@/lib/api-client";
import type { AuthResponse, User } from "@/lib/api-client";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  loginMethod: "google" | "password";
  createdAt: string;
}

export const profileApi = {
  async get(): Promise<{ profile: UserProfile }> {
    return apiFetch("/profile");
  },

  async update(fullName: string): Promise<{ profile: UserProfile }> {
    return apiFetch("/profile", {
      method: "PATCH",
      body: JSON.stringify({ fullName }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return apiFetch("/profile/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

export const authApi = {
  async register(email: string, password: string, fullName?: string): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
    setAccessToken(data.accessToken);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
    }
  },

  async me(): Promise<{ user: User | null; accessToken?: string }> {
    return apiFetch("/auth/me");
  },
};

export type BrokerType = "iol" | "ppi";

export interface IolConnectionState {
  connected: boolean;
  connection: {
    id: string;
    iolUsername: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  connections?: {
    id: string;
    brokerType: BrokerType;
    username: string;
    iolUsername: string;
    isActive: boolean;
    createdAt: string;
  }[];
  accounts: {
    id: string;
    iolAccountNumber: string;
    brokerAccountNumber?: string;
    brokerType?: BrokerType;
    name: string;
    currency: string;
  }[];
}

export const connectionsApi = {
  async getState(broker?: BrokerType): Promise<IolConnectionState> {
    const qs = broker ? `?broker=${broker}` : "";
    return apiFetch(`/connections${qs}`);
  },

  async connect(input: {
    brokerType?: BrokerType;
    username?: string;
    password?: string;
    brokerAccountNumber?: string;
    iolUsername: string;
    iolPassword: string;
    iolAccountNumber: string;
  }): Promise<{
    connection: { id: string; iolUsername: string; brokerType?: BrokerType };
    accounts: { id: string; iolAccountNumber: string; brokerAccountNumber?: string; brokerType?: BrokerType; name: string }[];
  }> {
    return apiFetch("/connections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async disconnect(broker?: BrokerType): Promise<{ ok: boolean; brokerType?: BrokerType }> {
    const qs = broker ? `?broker=${broker}` : "";
    return apiFetch(`/connections${qs}`, { method: "DELETE" });
  },
};
