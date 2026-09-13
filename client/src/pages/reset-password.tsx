import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { GeniusLogo } from "@/components/layout/GeniusLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => setLocation("/auth?reset=success"), 2000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    resetMutation.mutate();
  };

  return (
    <div className="min-h-screen modern-4k-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2">
            <GeniusLogo className="h-7 w-auto" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
          {done ? (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
                <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Password updated!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Redirecting you to sign in…</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Set new password</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Enter a new password for your account</p>
              </div>
              {!token && (
                <p className="text-sm text-red-600 dark:text-red-400 text-center">
                  Invalid or missing reset token. Please request a new reset link.
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-gray-700 dark:text-gray-300 font-medium">New password</Label>
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={!token}
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white h-11"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 dark:text-gray-300 font-medium">Confirm password</Label>
                  <Input
                    type="password"
                    placeholder="Repeat your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={!token}
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white h-11"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!token || resetMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11"
                >
                  {resetMutation.isPending ? "Updating…" : "Update password"}
                </Button>
              </form>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setLocation("/auth")}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
