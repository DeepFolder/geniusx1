import { describe, expect, it, vi, afterEach } from "vitest";
import { apiRequest, isNetworkError } from "@/lib/queryClient";

describe("apiRequest connection interruption handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });
  }

  it("marks an interrupted response body as a network error so calculation recovery runs", async () => {
    stubStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    }));

    await expect(apiRequest("/api/genius/generate")).rejects.toSatisfy(isNetworkError);
  });

  it("keeps a valid HTTP error as an ordinary error", async () => {
    stubStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValue("Calculation failed"),
    }));

    await expect(apiRequest("/api/genius/generate")).rejects.not.toSatisfy(isNetworkError);
  });

  it("marks the server's 400 request-aborted response as recoverable", async () => {
    stubStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("request aborted"),
    }));

    await expect(apiRequest("/api/genius/generate")).rejects.toSatisfy(isNetworkError);
  });
});