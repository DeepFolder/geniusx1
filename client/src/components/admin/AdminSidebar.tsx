import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Settings,
  Brain,
  BarChart3,
  Users,
  TrendingUp,
  MessageSquare,
  UserCog,
  UserCheck,
  ChevronRight,
} from "lucide-react";

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin: boolean;
  newUserCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  testId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "settings", label: "Settings", description: "Agent configuration", icon: Settings },
  { id: "memory", label: "Memory & Context", description: "Context window budgets", icon: Brain, testId: "tab-memory" },
  { id: "usage", label: "Usage Analytics", description: "Tokens & cost overview", icon: BarChart3 },
  { id: "per-user", label: "Per-User Analytics", description: "Individual usage drill-down", icon: Users, testId: "tab-per-user" },
  { id: "benchmarks", label: "Benchmarks", description: "Quality evaluation runs", icon: TrendingUp },
  { id: "feedback", label: "Feedback", description: "User-submitted feedback", icon: MessageSquare, adminOnly: true, testId: "tab-feedback" },
  { id: "platform", label: "Platform Admin", description: "User management & roles", icon: UserCog, adminOnly: true, testId: "tab-platform" },
  { id: "access-requests", label: "Access Requests", description: "Pending approvals", icon: UserCheck, adminOnly: true, testId: "tab-access-requests" },
];

export default function AdminSidebar({ activeTab, onTabChange, isAdmin, newUserCount = 0 }: AdminSidebarProps) {
  const [, setLocation] = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-white dark:bg-gray-900/95 border-r border-gray-200/80 dark:border-gray-800/80 shadow-sm">

        {/* Logo + Admin Panel header */}
        <div className="px-5 pt-6 pb-5 border-b border-gray-100 dark:border-gray-800/70 bg-gradient-to-b from-violet-50/60 to-transparent dark:from-violet-950/20 dark:to-transparent">
          {/* Admin Panel label */}
          <div className="flex items-center gap-2 mb-4 mt-1">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-sm">
              <Settings className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-widest">
              Admin Panel
            </span>
          </div>

          {/* Back button */}
          <button
            onClick={() => setLocation("/")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-800/70 transition-all group border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform shrink-0" />
            Back to Genius<span className="text-blue-500">X1</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === "platform" && newUserCount > 0;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                data-testid={item.testId}
                className={cn(
                  "w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
                  isActive
                    ? "bg-gradient-to-r from-violet-600/10 to-blue-600/5 dark:from-violet-500/15 dark:to-blue-500/8 shadow-sm ring-1 ring-violet-200/50 dark:ring-violet-800/30"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                )}
              >
                <div
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150",
                    isActive
                      ? "bg-gradient-to-br from-violet-600 to-blue-600 shadow-md shadow-violet-500/30"
                      : "bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-colors",
                      isActive
                        ? "text-white"
                        : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-semibold truncate transition-colors leading-tight",
                    isActive
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white"
                  )}>
                    {item.label}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5 leading-tight">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {showBadge && (
                    <span className="inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] leading-none">
                      {newUserCount > 99 ? "99+" : newUserCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-violet-400 dark:text-violet-500" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800/70">
          <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
            © 2026 Genius<span className="text-blue-500">X1</span> · Admin Panel
          </p>
        </div>
      </aside>

      {/* ── Mobile horizontal tab strip (below lg) ── */}
      <nav className="lg:hidden flex items-center gap-1 px-2 py-2 bg-white dark:bg-gray-900/95 border-b border-gray-200/80 dark:border-gray-800/80 overflow-x-auto shrink-0 shadow-sm">
        {/* Back button — icon only */}
        <button
          onClick={() => setLocation("/")}
          aria-label="Back to GeniusX1"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all mr-1 border border-gray-200 dark:border-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Divider */}
        <span className="w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0 mr-1" />

        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const showBadge = item.id === "platform" && newUserCount > 0;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              data-testid={item.testId}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 relative whitespace-nowrap",
                isActive
                  ? "bg-gradient-to-r from-violet-600/10 to-blue-600/5 dark:from-violet-500/15 dark:to-blue-500/8 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200/50 dark:ring-violet-800/30 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-violet-600 dark:text-violet-400" : "")} />
              <span className="text-xs">{item.label}</span>
              {showBadge && (
                <span className="inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1 min-w-[15px] h-[15px] leading-none">
                  {newUserCount > 99 ? "99+" : newUserCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
