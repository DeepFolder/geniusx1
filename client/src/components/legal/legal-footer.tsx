import { useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown } from "lucide-react";

const mainLinks = [
  { href: "/about", label: "About" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms-of-service", label: "Terms" },
];

const legalDropdownLinks = [
  { href: "/legal/dpa", label: "DPA" },
  { href: "/legal/acceptable-use", label: "Acceptable Use" },
  { href: "/legal/copyright", label: "Copyright" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
  { href: "/legal/security", label: "Security" },
  { href: "/cookie-policy", label: "Cookies" },
];

function Dot() {
  return <span className="text-gray-300 dark:text-gray-700 select-none">·</span>;
}

function LegalDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors focus:outline-none"
        aria-expanded={open}
        aria-haspopup="true"
      >
        Legal
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
          {legalDropdownLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LegalFooter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isAuthenticated || isLoading) {
    return (
      <footer className="border-t border-gray-100 dark:border-gray-800/60 bg-white dark:bg-gray-950 mt-auto">
        <div className="container mx-auto px-6 py-5 max-w-7xl">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="text-gray-400 dark:text-gray-500">
              © {new Date().getFullYear()} DeepFolder
            </span>
            <Dot />
            <a
              href="/terms-of-service"
              className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Terms of Service
            </a>
            <Dot />
            <a
              href="/privacy-policy"
              className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-gray-100 dark:border-gray-800/60 bg-white dark:bg-gray-950 mt-auto">
      <div className="container mx-auto px-6 py-5 max-w-7xl">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <span className="text-gray-400 dark:text-gray-500">
            © {new Date().getFullYear()} DeepFolder
          </span>
          <Dot />
          {mainLinks.map((link, i) => (
            <span key={link.href} className="flex items-center gap-4">
              {i > 0 && <Dot />}
              <Link
                href={link.href}
                className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {link.label}
              </Link>
            </span>
          ))}
          <Dot />
          <LegalDropdown />
        </div>
      </div>
    </footer>
  );
}
