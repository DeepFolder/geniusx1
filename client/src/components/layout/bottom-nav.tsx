import { useState, useEffect, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { GeniusLogo } from "./GeniusLogo";
import { 
  Sun, 
  Moon,
  TrendingUp,
  Search,
  Menu,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Create context for global sidebar state
export const SidebarContext = createContext<{
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}>({
  isSidebarOpen: false,
  setIsSidebarOpen: () => {},
  toggleSidebar: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export default function TopNav() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : true;
  });
  const { toggleSidebar } = useSidebar();

  const navItems: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }[] = [];

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9999]">
        {/* Modern Glass Morphism Header */}
        <div className="bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-white/20 dark:border-gray-800/30 px-3 sm:px-6 py-2 md:py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            {/* Hamburger Menu & Logo - Grouped Together */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Hamburger Menu Button */}
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* Logo & Brand - Modern Floating Design */}
              <a href="/deepsearch?new=true" onClick={() => { try { window.localStorage.removeItem("ds_active_session_id"); } catch {} }} className="flex items-center group">
                <GeniusLogo className="h-8 w-auto transition-transform duration-300 group-hover:scale-105" />
              </a>

              {/* Navigation - Modern Floating Pills */}
              <nav className="hidden md:flex items-center space-x-2 bg-gray-100/50 dark:bg-gray-800/30 rounded-2xl p-1 backdrop-blur-sm">
                {navItems.map(({ href, icon: Icon, label }) => {
                  const isActive = location === href || (href !== "/" && location.startsWith(href));
                  
                  return (
                    <a 
                      key={href} 
                      href={href} 
                      className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-300 min-h-[40px] ${
                        isActive 
                          ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/10" 
                          : "text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden lg:inline">{label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>
            
            {/* Mobile Navigation Pills - More compact */}
            <nav className="md:hidden flex items-center space-x-0.5 bg-gray-100/50 dark:bg-gray-800/30 rounded-xl p-0.5 backdrop-blur-sm">
              {navItems.map(({ href, icon: Icon, label }) => {
                const isActive = location === href || (href !== "/" && location.startsWith(href));
                
                return (
                  <a 
                    key={href} 
                    href={href} 
                    className={`flex items-center justify-center p-2 text-sm font-medium rounded-lg transition-all duration-300 min-h-[40px] min-w-[40px] ${
                      isActive 
                        ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/10" 
                        : "text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                    }`}
                    title={label}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </a>
                );
              })}
            </nav>

            {/* Right Section - Modern Actions */}
            <div className="flex items-center space-x-1.5 sm:space-x-3">

              {/* Theme Toggle - Switch Style - Compact on mobile */}
              <div className="relative bg-gray-100/50 dark:bg-gray-800/50 rounded-full p-0.5 sm:p-1 backdrop-blur-sm shadow-sm z-10">
                <div className="flex items-center gap-0 relative z-10">
                  {/* Light Mode Option */}
                  <button
                    onClick={() => {
                      localStorage.setItem('darkMode', JSON.stringify(false));
                      document.documentElement.classList.remove('dark');
                      setIsDarkMode(false);
                    }}
                    data-testid="button-theme-light"
                    type="button"
                    aria-label="Switch to light mode"
                    className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 md:w-7 md:h-7 rounded-full transition-all duration-300 cursor-pointer z-20 relative ${
                      !isDarkMode
                        ? 'bg-white text-yellow-500 shadow-md' 
                        : 'text-gray-400 hover:text-gray-200 dark:hover:text-gray-300'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
                  </button>
                  
                  {/* Dark Mode Option */}
                  <button
                    onClick={() => {
                      localStorage.setItem('darkMode', JSON.stringify(true));
                      document.documentElement.classList.add('dark');
                      setIsDarkMode(true);
                    }}
                    data-testid="button-theme-dark"
                    type="button"
                    aria-label="Switch to dark mode"
                    className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 md:w-7 md:h-7 rounded-full transition-all duration-300 cursor-pointer z-20 relative ${
                      isDarkMode
                        ? 'bg-gray-700 text-blue-400 shadow-md' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        {/* Subtle gradient border */}
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
      </div>

      {/* AI Chat Assistant Modal */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Personal Assistant</h3>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-gray-600 dark:text-gray-400">AI chat assistant feature has been disabled.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}