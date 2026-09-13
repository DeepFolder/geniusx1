import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: Props) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Auto-close once the auth query confirms the user is logged in
  useEffect(() => {
    if (isAuthenticated && open) {
      onOpenChange(false);
    }
  }, [isAuthenticated, open, onOpenChange]);

  const mutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Login failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      // Invalidate + refetch so AuthContext flips isAuthenticated → true,
      // which triggers the useEffect above to close the dialog.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: any) => {
      toast({
        title: "Sign in failed",
        description: err.message || "Incorrect email or password.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            Sign in to{" "}
            <span className="text-blue-500">GeniusX1</span>
          </DialogTitle>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to run your calculation
          </p>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4 pt-1"
        >
          <div>
            <Label htmlFor="modal-email" className="font-medium">
              Email
            </Label>
            <Input
              id="modal-email"
              type="email"
              placeholder="Enter your email"
              {...form.register("email")}
              className="mt-1.5 h-11"
            />
            {form.formState.errors.email && (
              <p className="text-red-500 text-sm mt-1">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="modal-password" className="font-medium">
              Password
            </Label>
            <Input
              id="modal-password"
              type="password"
              placeholder="Enter your password"
              {...form.register("password")}
              className="mt-1.5 h-11"
            />
            {form.formState.errors.password && (
              <p className="text-red-500 text-sm mt-1">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-md"
          >
            {mutation.isPending ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <div className="space-y-2 pt-1 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Don't have an account?{" "}
            <Link
              href="/auth?tab=register"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              onClick={() => onOpenChange(false)}
            >
              Register
            </Link>
          </p>
          <p>
            <Link
              href="/auth"
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Forgot password?
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
