import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { X, Calculator, Home, Shield, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { GeniusLogo } from "./GeniusLogo";

interface Props {
  open: boolean;
  onClose: () => void;
  extra?: ReactNode;
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  localStorage.removeItem("authToken");
  sessionStorage.removeItem("authToken");
  window.location.href = "/auth";
}

// Global slide-out navigation drawer (DeepFolder concept). Moves between the
// calculation workspace and the admin area; admin link is gated to admins.
// `extra` is rendered between the nav links and the account footer — used by
// the genius page to inject the history / new-calculation controls.
export function AppSidebar({ open, onClose, extra }: Props) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const items = [
    { href: "/", label: "Home", description: "About Genius X1", icon: Home, show: true },
    { href: "/workspace", label: "Calculations", description: "Engineering workspace", icon: Calculator, show: true },
    { href: "/admin", label: "Admin", description: "Settings & analytics", icon: Shield, show: isAdmin },
  ].filter((i) => i.show);

  return (
    <>
      <div
        data-print-hide="true"
        className={`fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        data-print-hide="true"
        className={`fixed top-0 left-0 z-[10001] flex h-full w-72 flex-col border-r border-gray-200/80 bg-white/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 dark:border-gray-800/80 dark:bg-gray-950/95 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        data-testid="app-sidebar"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-5 dark:border-gray-800/70">
          <GeniusLogo className="h-[18px] w-auto" />
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {items.map(({ href, label, description, icon: Icon }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active
                    ? "bg-gradient-to-r from-blue-600/10 to-blue-500/5 ring-1 ring-blue-200/60 dark:from-blue-500/15 dark:to-blue-500/5 dark:ring-blue-800/40"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                }`}
                data-testid={`link-nav-${label.toLowerCase()}`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? "bg-gradient-to-br from-blue-600 to-blue-700 shadow-md shadow-blue-500/30"
                      : "bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-white" : "text-gray-500 dark:text-gray-400"}`} />
                </div>
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-semibold leading-tight ${
                      active ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {label}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-gray-400 dark:text-gray-500">{description}</p>
                </div>
              </Link>
            );
          })}
        </nav>

        {extra && (
          <div className="flex-1 overflow-y-auto border-t border-gray-100 dark:border-gray-800/70">
            {extra}
          </div>
        )}

        <div className="border-t border-gray-100 p-3 dark:border-gray-800/70">
          {user ? (
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          ) : (
            <Link
              href="/auth"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              data-testid="button-login"
            >
              <LogIn className="h-4 w-4" /> Log in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
