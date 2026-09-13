import { useState, type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { AppSidebar } from "./AppSidebar";

interface Props {
  children: ReactNode;
  right?: ReactNode;
  /** Render prop: receives the sidebar's onClose so content can close it. */
  sidebarExtra?: (onClose: () => void) => ReactNode;
  /** Called when the user clicks the logo/wordmark on the root page. */
  onLogoClick?: () => void;
}

// Global DeepFolder shell: fixed top nav + slide-out sidebar drawer wrapped
// around page content. The global `body { padding-top: 80px }` reserves space
// for the fixed 80px TopBar, so children render directly below it.
export function AppShell({ children, right, sidebarExtra, onLogoClick }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = () => setSidebarOpen(false);
  return (
    <>
      <TopBar onToggleSidebar={() => setSidebarOpen((o) => !o)} right={right} onLogoClick={onLogoClick} />
      <AppSidebar
        open={sidebarOpen}
        onClose={close}
        extra={sidebarExtra ? sidebarExtra(close) : undefined}
      />
      {children}
    </>
  );
}
