import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Extended user type with company information from API
export interface AuthUser extends User {
  company?: {
    id: number;
    name: string;
    industry: string;
    logoPath?: string | null;
  } | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      // Add cache-busting timestamp to prevent browser HTTP caching
      const cacheBuster = Date.now();
      const response = await fetch(`/api/auth/me?v=${cacheBuster}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return null;
        }
        throw new Error("Authentication check failed");
      }

      const data = await response.json();
      console.log("🔍 Auth data received:", { 
        role: data?.role, 
        hasCompany: !!data?.company,
        companyName: data?.company?.name 
      });
      return data;
    },
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't keep old data in cache
  });

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user,
        error: error as Error | null,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
