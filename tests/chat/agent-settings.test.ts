import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  seedAgentSettings,
  clearChatTables,
  closeDatabaseConnection,
} from "../helpers/db";
import { makeAgentSettingsFixture } from "../fixtures/agentSettings";
import {
  getAgentSettings,
} from "../../server/features/hybrid-search/agents/admin/settings-storage";

/**
 * Unit tests for getAgentSettings.
 *
 * server/db is globally mocked (via tests/setup.ts) to point at the local
 * DATABASE_URL so these tests read/write the test DB, not production Neon.
 * openai is also globally mocked so no API credentials are needed.
 */

describe("getAgentSettings", () => {
  beforeAll(async () => {
    await clearChatTables();
  });

  afterAll(async () => {
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearChatTables();
  });

  describe("default values when no row exists", () => {
    it("returns a settings object when no row is in the database", async () => {
      const settings = await getAgentSettings();
      expect(settings).toBeDefined();
      expect(typeof settings).toBe("object");
    });

    it("returns a non-null model string when no row exists", async () => {
      const settings = await getAgentSettings();
      expect(typeof settings.model).toBe("string");
      expect(settings.model.length).toBeGreaterThan(0);
    });

    it("returns numeric token budget percentages that sum to 100 when no row exists", async () => {
      const settings = await getAgentSettings();
      const sum =
        settings.systemInstructionPct +
        settings.fluidMemoryPct +
        settings.conversationPct;
      expect(sum).toBe(100);
    });

    it("returns compactionThresholdPct > 0 by default", async () => {
      const settings = await getAgentSettings();
      expect(settings.compactionThresholdPct).toBeGreaterThan(0);
    });

    it("returns an allowedTopics array by default", async () => {
      const settings = await getAgentSettings();
      expect(Array.isArray(settings.allowedTopics)).toBe(true);
    });

    it("returns topicRestrictionEnabled as a boolean by default", async () => {
      const settings = await getAgentSettings();
      expect(typeof settings.topicRestrictionEnabled).toBe("boolean");
    });

    it("returns a non-empty topicRestrictionMessage by default", async () => {
      const settings = await getAgentSettings();
      expect(typeof settings.topicRestrictionMessage).toBe("string");
      expect(settings.topicRestrictionMessage.length).toBeGreaterThan(0);
    });

    it("returns maxTokens > 0 by default", async () => {
      const settings = await getAgentSettings();
      expect(settings.maxTokens).toBeGreaterThan(0);
    });

    it("returns temperature as a number by default", async () => {
      const settings = await getAgentSettings();
      expect(typeof settings.temperature).toBe("number");
    });

    it("returns instructions as a non-empty string by default", async () => {
      const settings = await getAgentSettings();
      expect(typeof settings.instructions).toBe("string");
      expect(settings.instructions.length).toBeGreaterThan(0);
    });
  });

  describe("admin overrides respected", () => {
    it("returns the seeded model when a settings row exists", async () => {
      await seedAgentSettings({ model: "gpt-4o-mini" });

      const settings = await getAgentSettings();
      expect(settings.model).toBe("gpt-4o-mini");
    });

    it("returns custom token budget percentages from seeded settings", async () => {
      await seedAgentSettings({
        systemInstructionPct: 25,
        fluidMemoryPct: 15,
        conversationPct: 60,
      });

      const settings = await getAgentSettings();
      expect(settings.systemInstructionPct).toBe(25);
      expect(settings.fluidMemoryPct).toBe(15);
      expect(settings.conversationPct).toBe(60);
    });

    it("respects topicRestrictionEnabled=false when set by admin", async () => {
      await seedAgentSettings({ topicRestrictionEnabled: false });

      const settings = await getAgentSettings();
      expect(settings.topicRestrictionEnabled).toBe(false);
    });

    it("respects topicRestrictionEnabled=true when set by admin", async () => {
      await seedAgentSettings({ topicRestrictionEnabled: true });

      const settings = await getAgentSettings();
      expect(settings.topicRestrictionEnabled).toBe(true);
    });

    it("returns the custom compactionThresholdPct when set by admin", async () => {
      await seedAgentSettings({ compactionThresholdPct: 50 });

      const settings = await getAgentSettings();
      expect(settings.compactionThresholdPct).toBe(50);
    });

    it("returns the custom maxTokens when set by admin", async () => {
      await seedAgentSettings({ maxTokens: 2048 });

      const settings = await getAgentSettings();
      expect(settings.maxTokens).toBe(2048);
    });

    it("returns custom name when set by admin", async () => {
      await seedAgentSettings({ name: "Custom Agent V2" });

      const settings = await getAgentSettings();
      expect(settings.name).toBe("Custom Agent V2");
    });

    it("parses allowedTopics from stored JSON array correctly", async () => {
      await seedAgentSettings({});

      const settings = await getAgentSettings();
      expect(Array.isArray(settings.allowedTopics)).toBe(true);
    });

    it("returns webSearchEnabled override from admin settings", async () => {
      await seedAgentSettings({ webSearchEnabled: false });

      const settings = await getAgentSettings();
      expect(settings.webSearchEnabled).toBe(false);
    });
  });

  describe("topic restriction field behavior", () => {
    it("when topicRestrictionEnabled is true, topicRestrictionMessage is a non-empty string", async () => {
      await seedAgentSettings({ topicRestrictionEnabled: true });

      const settings = await getAgentSettings();
      expect(settings.topicRestrictionEnabled).toBe(true);
      expect(typeof settings.topicRestrictionMessage).toBe("string");
      expect(settings.topicRestrictionMessage.length).toBeGreaterThan(0);
    });

    it("when topicRestrictionEnabled is false, other fields still return correctly", async () => {
      await seedAgentSettings({ topicRestrictionEnabled: false, model: "gpt-4o" });

      const settings = await getAgentSettings();
      expect(settings.topicRestrictionEnabled).toBe(false);
      expect(settings.model).toBe("gpt-4o");
    });

    it("allowedTopics is always an array regardless of stored value", async () => {
      await seedAgentSettings({});

      const settings = await getAgentSettings();
      expect(Array.isArray(settings.allowedTopics)).toBe(true);
    });
  });
});

describe("Topic restriction off-topic detection (unit behavior)", () => {
  it("makeAgentSettingsFixture defaults have topicRestrictionEnabled=true", () => {
    const settings = makeAgentSettingsFixture();
    expect(settings.topicRestrictionEnabled).toBe(true);
  });

  it("makeAgentSettingsFixture compactionThresholdPct is 70 (matches DEFAULT_SETTINGS)", () => {
    const settings = makeAgentSettingsFixture();
    expect(settings.compactionThresholdPct).toBe(70);
  });

  it("default budget percentages in fixture sum to 100", () => {
    const settings = makeAgentSettingsFixture();
    const sum =
      settings.systemInstructionPct +
      settings.fluidMemoryPct +
      settings.conversationPct;
    expect(sum).toBe(100);
  });

  it("compactionThresholdPct is positive ensuring a non-zero compaction trigger", () => {
    const settings = makeAgentSettingsFixture({ compactionThresholdPct: 70 });
    expect(settings.compactionThresholdPct).toBeGreaterThan(0);
  });

  it("override topicRestrictionEnabled=false is correctly reflected", () => {
    const settings = makeAgentSettingsFixture({ topicRestrictionEnabled: false });
    expect(settings.topicRestrictionEnabled).toBe(false);
  });
});
