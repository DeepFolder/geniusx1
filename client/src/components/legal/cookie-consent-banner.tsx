import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Cookie } from "lucide-react";

export const COOKIE_SETTINGS_EVENT = "genius:open-cookie-settings";
const CONSENT_KEY = "genius-cookie-choice";
const CONSENT_VERSION = 1;

type StoredChoice = {
  version: number;
  necessary: true;
  optional: false;
  savedAt: string;
};

function hasCurrentChoice() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null") as StoredChoice | null;
    return parsed?.version === CONSENT_VERSION && parsed.necessary === true;
  } catch {
    return false;
  }
}

export default function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasCurrentChoice()) setShow(true);
    const open = () => setShow(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
  }, []);

  const acknowledge = () => {
    const choice: StoredChoice = {
      version: CONSENT_VERSION,
      necessary: true,
      optional: false,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
    setShow(false);
  };

  if (!show) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[10020] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 sm:bottom-5 sm:p-5" aria-label="Cookie notice" role="dialog" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Cookie className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Essential storage only</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Genius X1 uses necessary cookies and local storage for sign-in, security, preferences, and calculation continuity. We currently use no advertising or third-party analytics cookies. <Link href="/cookie-policy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Cookie policy</Link>
            </p>
          </div>
        </div>
        <button type="button" onClick={acknowledge} className="inline-flex flex-none items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700" data-testid="button-accept-cookies">
          Accept
        </button>
      </div>
    </aside>
  );
}
