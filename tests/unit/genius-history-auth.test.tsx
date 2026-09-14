// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, isAuthenticated: false }));
vi.mock("../../client/src/contexts/AuthContext", () => ({ useAuth: () => auth }));
import { useGenius } from "../../client/src/features/genius/useGenius";

afterEach(() => {
  cleanup();
  localStorage.clear();
  auth.user = null;
  auth.isAuthenticated = false;
});

describe("Genius history authentication", () => {
  it("waits for sign-in and never reuses another account's history", async () => {
    const queryFn = vi.fn(async () => [{ id: auth.user?.id }]);
    const client = new QueryClient({ defaultOptions: { queries: { queryFn, retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender, unmount } = renderHook(() => useGenius(), { wrapper });
    await act(async () => {});
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current.history).toEqual([]);

    auth.user = { id: "alice" };
    auth.isAuthenticated = true;
    rerender();
    await waitFor(() => expect(result.current.history).toEqual([{ id: "alice" }]));

    auth.user = null;
    auth.isAuthenticated = false;
    rerender();
    expect(result.current.history).toEqual([]);
    expect(queryFn).toHaveBeenCalledTimes(1);

    auth.user = { id: "bob" };
    auth.isAuthenticated = true;
    rerender();
    expect(result.current.history).toEqual([]);
    await waitFor(() => expect(result.current.history).toEqual([{ id: "bob" }]));
    unmount();
    client.clear();
  });
});
