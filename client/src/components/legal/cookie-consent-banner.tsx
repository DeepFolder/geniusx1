import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Cookie, X } from "lucide-react";

export default function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setTimeout(() => setShow(true), 1000);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setShow(false);
  };

  const handleDecline = () => {
    localStorage.setItem("cookieConsent", "declined");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="bg-gray-900 dark:bg-gray-950 border-t border-gray-800 dark:border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Cookie className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 leading-tight">
                  We use essential cookies for authentication and functionality.{" "}
                  <span className="hidden sm:inline text-gray-400">
                    No tracking or ads.
                  </span>
                  <Link 
                    href="/cookie-policy" 
                    className="text-blue-400 hover:text-blue-300 hover:underline ml-1"
                    data-testid="link-cookie-policy"
                  >
                    Learn more
                  </Link>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                onClick={handleAccept}
                size="sm"
                className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white text-xs px-4"
                data-testid="button-accept-cookies"
              >
                Accept
              </Button>
              <Button 
                variant="ghost"
                size="sm"
                onClick={handleDecline}
                className="flex-1 sm:flex-initial text-gray-400 hover:text-white hover:bg-gray-800 text-xs px-4"
                data-testid="button-decline-cookies"
              >
                Decline
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-500 hover:text-white hover:bg-gray-800 flex-shrink-0"
                onClick={handleDecline}
                data-testid="button-close-cookie-banner"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
