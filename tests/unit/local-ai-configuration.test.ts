import { afterEach, describe, expect, it, vi } from "vitest";
import { createLazyOpenAI } from "../../server/services/openai-client";
import { requireAI } from "../../server/middleware/require-ai";

afterEach(() => vi.unstubAllEnvs());

describe("starting before an AI key is configured", () => {
  it("allows service imports but fails before making a provider call", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const client = createLazyOpenAI();
    expect(() => client.chat).toThrow();
  });

  it("constructs the real SDK lazily when a key is configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "local-test-key");
    const client = createLazyOpenAI();
    expect(client.chat).toBe(client.chat);
    expect(typeof client.chat.completions.create).toBe("function");
  });

  it("rejects generation with an actionable error before downstream work", () => {
    vi.stubEnv("OPENAI_API_KEY", " ");
    vi.stubEnv("NODE_ENV", "development");
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireAI({} as any, response as any, next);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_NOT_CONFIGURED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("allows configured requests through without changing authentication", () => {
    vi.stubEnv("OPENAI_API_KEY", "local-test-key");
    const next = vi.fn();
    requireAI({} as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
