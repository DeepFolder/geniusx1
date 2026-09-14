import { useState } from "react";
import { useLocation } from "wouter";
import { TopBar } from "@/components/layout/TopBar";
import { AppSidebar } from "@/components/layout/AppSidebar";

// Public pages intentionally reuse the application chrome so the product has
// one header, one wordmark, and one navigation pattern everywhere.
export function PublicSiteHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setLocation] = useLocation();
  const close = () => setSidebarOpen(false);

  return (
    <>
      <TopBar
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onLogoClick={() => setLocation("/workspace")}
      />
      <AppSidebar open={sidebarOpen} onClose={close} />
    </>
  );
}
