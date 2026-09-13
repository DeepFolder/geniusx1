import { useCallback, useEffect, useState } from 'react';
import {
  WEB_SEARCH_CHANGE_EVENT,
  WEB_SEARCH_ENGINES,
  WEB_SEARCH_STORAGE_KEY,
  WebSearchEngine,
  WebSearchEngineId,
  detectBrowserDefaultEngine,
  readStoredEngineId,
  writeStoredEngineId,
} from '@/lib/web-search-engines';

interface UseWebSearchEngineResult {
  engine: WebSearchEngine;
  resolvedId: WebSearchEngineId;
  override: WebSearchEngineId | null;
  autoDetectedId: WebSearchEngineId;
  setOverride: (id: WebSearchEngineId | null) => void;
  buildSearchUrl: (query: string) => string;
}

export function useWebSearchEngine(): UseWebSearchEngineResult {
  const [override, setOverrideState] = useState<WebSearchEngineId | null>(() => readStoredEngineId());
  const [autoDetectedId] = useState<WebSearchEngineId>(() => detectBrowserDefaultEngine());

  useEffect(() => {
    const sync = () => setOverrideState(readStoredEngineId());

    const onStorage = (e: StorageEvent) => {
      if (e.key === WEB_SEARCH_STORAGE_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(WEB_SEARCH_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WEB_SEARCH_CHANGE_EVENT, sync);
    };
  }, []);

  const setOverride = useCallback((id: WebSearchEngineId | null) => {
    writeStoredEngineId(id);
    setOverrideState(id);
  }, []);

  const resolvedId: WebSearchEngineId = override ?? autoDetectedId;
  const engine = WEB_SEARCH_ENGINES[resolvedId];
  const buildSearchUrl = useCallback((query: string) => engine.buildUrl(query), [engine]);

  return { engine, resolvedId, override, autoDetectedId, setOverride, buildSearchUrl };
}
