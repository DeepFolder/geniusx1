import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, User, LogOut, Settings, Brain, Upload, Shield } from "lucide-react";
import { GeniusLogo } from "./GeniusLogo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export default function Navbar() {
  const [location] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();

  const navItems = [
    { href: "/", label: "Home", active: location === "/" },
    { href: "/companies", label: "Companies", active: location === "/companies" },
    { href: "/products", label: "Products", active: location === "/products" },
    { href: "/ai-insights", label: "AI Insights", active: location === "/ai-insights" },
    { href: "/advanced-features", label: "Advanced", active: location === "/advanced-features" },
  ];

  return (
    <nav className="bg-white dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 md:h-16">
          <div className="flex items-center">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <GeniusLogo className="h-6 w-auto" />
            </Link>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8 ml-10">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`font-medium text-sm transition-colors duration-200 ${
                    item.active
                      ? "text-transparent bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text"
                      : "text-gray-700 hover:text-transparent hover:bg-gradient-to-r hover:from-blue-600 hover:to-teal-600 hover:bg-clip-text"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* User Profile */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                        <AvatarFallback>
                          {user?.firstName?.charAt(0) || user?.email?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user?.role === 'company_admin' && user?.company?.name
                            ? user.company.name
                            : user?.firstName && user?.lastName 
                            ? `${user.firstName} ${user.lastName}`
                            : user?.email
                          }
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/myspace" className="flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        <span>MySpace</span>
                      </Link>
                    </DropdownMenuItem>
                    {user?.role === 'admin' && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center">
                          <Shield className="mr-2 h-4 w-4" />
                          <span>Admin</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {user?.role === 'company_admin' && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/product-management" className="flex items-center">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Product Management</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/company-admin/files" className="flex items-center">
                            <Upload className="mr-2 h-4 w-4" />
                            <span>File Management</span>
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                      localStorage.removeItem('token');
                      localStorage.removeItem('demoUser');
                      localStorage.removeItem('authMode');
                      window.location.href = '/auth';
                    }}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild>
                <Link href="/auth">Sign In</Link>
              </Button>
            )}

            {/* Mobile menu button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="lg"
                className="h-12 w-12 p-0"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-4 pt-4 pb-6 space-y-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 rounded-lg text-lg font-medium transition-colors min-h-[48px] flex items-center ${
                    item.active
                      ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              
              {!isAuthenticated && (
                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button asChild className="w-full h-12 text-lg">
                    <Link href="/auth">Sign In</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}