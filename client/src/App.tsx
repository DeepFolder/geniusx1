import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "@/pages/auth";
import NotFound from "@/pages/not-found";
import ResetPassword from "@/pages/reset-password";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import CookiePolicy from "@/pages/cookie-policy";
import GeniusPage from "@/pages/genius";
import { AppShell } from "@/components/layout/AppShell";
import AgentAdminPage from "@/features/hybrid-search/agent-admin";
import { useEffect } from "react";

function AdminRoute() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = !isLoading && !!user && (user as any).role === "admin";
  const shouldRedirect = !isLoading && !isAdmin;

  useEffect(() => {
    if (shouldRedirect) {
      setLocation("/");
    }
  }, [shouldRedirect, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="text-gray-500 text-xl">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AppShell>
      <AgentAdminPage />
    </AppShell>
  );
}

// "/" is intentionally public — the workspace renders for guests and gates
// submission internally via a login modal (see GeniusChatBar).
const PUBLIC_PATHS = ["/", "/auth", "/login", "/reset-password", "/privacy-policy", "/terms-of-service", "/cookie-policy"];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={GeniusPage} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/auth" component={Auth} />
      <Route path="/login" component={Auth} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/cookie-policy" component={CookiePolicy} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Gates the entire app behind authentication.
// While loading → blank screen. Not authenticated + non-public path → Auth page.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const currentPath = window.location.pathname;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-500 text-xl">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath(currentPath)) {
    return <Auth />;
  }

  return <>{children}</>;
}

function App() {
  // Theme is applied pre-paint in index.html and owned by useTheme (header
  // toggle). Nothing to initialize here.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AuthGate>
            <Routes />
          </AuthGate>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
