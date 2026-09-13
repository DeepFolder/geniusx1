import type { ReactNode } from "react";
import { Menu, Sun, Moon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/features/genius/useTheme";
import { GeniusLogo } from "./GeniusLogo";

interface Props {
  onToggleSidebar: () => void;
  right?: ReactNode;
  /** Called when user clicks the wordmark on the root page (starts a new calc). */
  onLogoClick?: () => void;
}

// Global DeepFolder-style top navigation: glass-morphism header with a
// hamburger (opens the sidebar drawer), the DeepFolder logo, a switch-style
// theme toggle, and an optional right-hand actions slot. Fixed at 80px tall to
// match the global `body { padding-top: 80px }` offset.
export function TopBar({ onToggleSidebar, right, onLogoClick }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const [location] = useLocation();
  const isRoot = location === "/";

  const logoInner = <GeniusLogo className="h-4 w-auto transition-opacity group-hover:opacity-80" />;

  return (
    <div data-print-hide="true" className="fixed top-0 left-0 right-0 z-[9999]">
      <div className="h-20 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-white/20 dark:border-gray-800/30 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label="Toggle sidebar"
              data-testid="button-toggle-sidebar"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {isRoot ? (
              <button
                type="button"
                onClick={onLogoClick}
                className="flex items-center gap-2 group cursor-pointer"
                aria-label="New calculation"
                title="New calculation"
              >
                {logoInner}
              </button>
            ) : (
              <Link href="/" className="flex items-center gap-2 group">
                {logoInner}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {right}

            {/* Theme toggle — DeepFolder switch style */}
            <div className="relative bg-gray-100/50 dark:bg-gray-800/50 rounded-full p-0.5 sm:p-1 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-0 relative">
                <button
                  onClick={() => isDark && toggle()}
                  type="button"
                  aria-label="Switch to light mode"
                  data-testid="button-theme-light"
                  className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all duration-300 ${
                    !isDark ? "bg-white text-yellow-500 shadow-md" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
                </button>
                <button
                  onClick={() => !isDark && toggle()}
                  type="button"
                  aria-label="Switch to dark mode"
                  data-testid="button-theme-dark"
                  className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all duration-300 ${
                    isDark ? "bg-gray-700 text-blue-400 shadow-md" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
    </div>
  );
}
