import { Link } from "wouter";
import { GeniusLogo } from "@/components/layout/GeniusLogo";
import { COOKIE_SETTINGS_EVENT } from "./cookie-consent-banner";

const links = [
  { href: "/about", label: "About" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms-of-service", label: "Terms" },
  { href: "/legal", label: "Legal" },
  { href: "/cookie-policy", label: "Cookies" },
];

export default function LegalFooter() {
  const openCookieSettings = () => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));

  return (
    <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <GeniusLogo className="h-4 w-auto" />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-500 dark:text-slate-400">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
              {link.label}
            </Link>
          ))}
          <button type="button" onClick={openCookieSettings} className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            Cookie settings
          </button>
          <span className="text-slate-400 dark:text-slate-600">© {new Date().getFullYear()} DeepFolder</span>
        </div>
      </div>
    </footer>
  );
}
