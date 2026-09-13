import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Thrown when the request never produced an HTTP response (connection drop,
 * abort, offline). Distinct from server 4xx/5xx errors so callers can decide
 * whether the operation might still have completed on the server.
 */
export class NetworkError extends Error {
  constructor(message = "Network connection was interrupted") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Express emits exactly this body when the socket closes mid-request
    // (raw-body BadRequestError). Treat only that specific response as a
    // connection interruption — never ordinary validation/business errors.
    if (isAbortedRequestBody(text)) {
      throw new NetworkError(text);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

function isAbortedRequestBody(text: string): boolean {
  const t = text.trim();
  if (/^"?request aborted"?$/i.test(t)) return true;
  try {
    const parsed = JSON.parse(t);
    const msg = parsed?.error ?? parsed?.message;
    return typeof msg === "string" && /^request aborted$/i.test(msg.trim());
  } catch {
    return false;
  }
}

function isConnectionInterruption(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b(abort(?:ed)?|network|failed to fetch|fetch failed|connection reset|econnreset|socket hang up|unexpected end)\b/i.test(message);
}

export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  // Mirror the same auth token that getQueryFn sends so mutations and queries
  // always use the same credentials regardless of whether cookies are set.
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
      credentials: "include",
    });
  } catch (err: any) {
    // fetch() itself rejecting means no HTTP response was received —
    // a network drop, abort, or offline condition, not a server error.
    throw new NetworkError(err?.message);
  }

  try {
    // Handle 401 errors
    if (res.status === 401) {
      console.error("Authentication failed");
      throw new Error("Authentication required");
    }

    await throwIfResNotOk(res);

    // Handle empty responses gracefully
    const text = await res.text();
    if (!text || text.trim() === '') {
      return {};
    }

    // Detect HTML responses early (e.g. Vite fallback during server restart)
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error('Server is unavailable — please try again in a moment.');
    }

    return JSON.parse(text);
  } catch (error) {
    if (isConnectionInterruption(error)) {
      throw new NetworkError(error instanceof Error ? error.message : undefined);
    }
    console.error('JSON Parse Error:', error);
    throw new Error('Unexpected response from server — please try again.');
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers: {
        ...(token && { "Authorization": `Bearer ${token}` }),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Enable refetch on window focus for cross-tab sync
      staleTime: 5 * 60 * 1000, // 5 minutes stale time
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error.message.includes('401')) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
