import { vi } from "vitest";

export const FIXTURE_NDJSON_CHUNK =
  JSON.stringify({
    type: "response.output_text.delta",
    delta: "Test AI response content.",
  }) + "\n";

export const FIXTURE_CLASSIFIER_OUTPUT = {
  intent: "product_search",
  domain: "industrial",
  isProductSearch: true,
  confidence: 0.95,
};

export const FIXTURE_STREAMING_RESPONSE = {
  id: "test-run-id",
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "Test AI response content." }],
    },
  ],
};

export function createMockStream(chunks: string[] = [FIXTURE_NDJSON_CHUNK]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield Buffer.from(chunk);
      }
    },
    on: vi.fn(),
    pipe: vi.fn(),
  };
}

export const mockOpenAIResponses = {
  responses: {
    create: vi.fn().mockResolvedValue(FIXTURE_STREAMING_RESPONSE),
    stream: vi.fn().mockReturnValue(createMockStream()),
  },
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        id: "test-completion-id",
        choices: [
          {
            message: { role: "assistant", content: "Test completion response." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    },
  },
};

export const mockAgentRunnerResult = {
  Runner: {
    run: vi.fn().mockResolvedValue(FIXTURE_STREAMING_RESPONSE),
    stream: vi.fn().mockReturnValue(createMockStream()),
  },
  run: vi.fn().mockResolvedValue(FIXTURE_STREAMING_RESPONSE),
  runSync: vi.fn().mockReturnValue(FIXTURE_STREAMING_RESPONSE),
};

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => mockOpenAIResponses),
  OpenAI: vi.fn().mockImplementation(() => mockOpenAIResponses),
}));

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    ...config,
    _isAgent: true,
  })),
  Runner: mockAgentRunnerResult.Runner,
  run: mockAgentRunnerResult.run,
  runSync: mockAgentRunnerResult.runSync,
  tool: vi.fn().mockImplementation((config: Record<string, unknown>) => config),
  webSearchTool: vi.fn().mockReturnValue({ type: "web_search", _isTool: true }),
}));

export function resetOpenAIMocks() {
  mockOpenAIResponses.responses.create.mockClear();
  mockOpenAIResponses.responses.stream.mockClear();
  mockOpenAIResponses.chat.completions.create.mockClear();
  mockAgentRunnerResult.Runner.run.mockClear();
  mockAgentRunnerResult.Runner.stream.mockClear();
  mockAgentRunnerResult.run.mockClear();
  mockAgentRunnerResult.runSync.mockClear();
}
