export type WebSearchEngineId =
  | 'google'
  | 'bing'
  | 'duckduckgo'
  | 'brave'
  | 'yahoo'
  | 'ecosia'
  | 'startpage'
  | 'baidu'
  | 'yandex';

export interface WebSearchEngine {
  id: WebSearchEngineId;
  name: string;
  colorClass: string;
  buildUrl: (query: string) => string;
}

export const WEB_SEARCH_ENGINES: Record<WebSearchEngineId, WebSearchEngine> = {
  google: {
    id: 'google',
    name: 'Google',
    colorClass: 'text-[#4285F4]',
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  bing: {
    id: 'bing',
    name: 'Bing',
    colorClass: 'text-teal-600 dark:text-teal-400',
    buildUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    colorClass: 'text-orange-500 dark:text-orange-400',
    buildUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
  brave: {
    id: 'brave',
    name: 'Brave',
    colorClass: 'text-orange-600 dark:text-orange-400',
    buildUrl: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo',
    colorClass: 'text-purple-600 dark:text-purple-400',
    buildUrl: (q) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`,
  },
  ecosia: {
    id: 'ecosia',
    name: 'Ecosia',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    buildUrl: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`,
  },
  startpage: {
    id: 'startpage',
    name: 'Startpage',
    colorClass: 'text-blue-700 dark:text-blue-400',
    buildUrl: (q) => `https://www.startpage.com/do/search?q=${encodeURIComponent(q)}`,
  },
  baidu: {
    id: 'baidu',
    name: 'Baidu',
    colorClass: 'text-blue-600 dark:text-blue-400',
    buildUrl: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
  },
  yandex: {
    id: 'yandex',
    name: 'Yandex',
    colorClass: 'text-red-600 dark:text-red-400',
    buildUrl: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`,
  },
};

export const WEB_SEARCH_ENGINE_LIST: WebSearchEngine[] = [
  WEB_SEARCH_ENGINES.google,
  WEB_SEARCH_ENGINES.bing,
  WEB_SEARCH_ENGINES.duckduckgo,
  WEB_SEARCH_ENGINES.brave,
  WEB_SEARCH_ENGINES.yahoo,
  WEB_SEARCH_ENGINES.ecosia,
  WEB_SEARCH_ENGINES.startpage,
  WEB_SEARCH_ENGINES.baidu,
  WEB_SEARCH_ENGINES.yandex,
];

export const WEB_SEARCH_STORAGE_KEY = 'deepfolder.webSearchEngine';
export const WEB_SEARCH_CHANGE_EVENT = 'deepfolder:webSearchEngineChange';

interface UADataBrand { brand: string; version: string }
interface UAData { brands?: UADataBrand[] }

export function detectBrowserDefaultEngine(): WebSearchEngineId {
  if (typeof navigator === 'undefined') return 'google';

  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (uaData?.brands?.length) {
    const brands = uaData.brands.map((b) => b.brand.toLowerCase());
    if (brands.some((b) => b.includes('edge'))) return 'bing';
    if (brands.some((b) => b.includes('brave'))) return 'brave';
    if (brands.some((b) => b.includes('opera') || b.includes('opr'))) return 'google';
    if (brands.some((b) => b.includes('yandex'))) return 'yandex';
    if (brands.some((b) => b.includes('samsung'))) return 'bing';
  }

  const ua = navigator.userAgent || '';
  if (/Edg\//i.test(ua)) return 'bing';
  if (/YaBrowser|Yandex/i.test(ua)) return 'yandex';
  if (/SamsungBrowser/i.test(ua)) return 'bing';
  if (/OPR\/|Opera/i.test(ua)) return 'google';
  if (/Firefox\//i.test(ua)) return 'google';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'google';

  return 'google';
}

export function isValidEngineId(id: string | null | undefined): id is WebSearchEngineId {
  return !!id && Object.prototype.hasOwnProperty.call(WEB_SEARCH_ENGINES, id);
}

export function readStoredEngineId(): WebSearchEngineId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
    return isValidEngineId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredEngineId(id: WebSearchEngineId | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) {
      window.localStorage.removeItem(WEB_SEARCH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(WEB_SEARCH_STORAGE_KEY, id);
    }
    window.dispatchEvent(new Event(WEB_SEARCH_CHANGE_EVENT));
  } catch {
    // localStorage may be unavailable; in that case the override simply won't persist.
  }
}
