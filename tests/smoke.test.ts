import { describe, it, expect } from "vitest";
import {
  mintTestToken,
  mintAdminToken,
  mintCompanyAdminToken,
  mintMemberToken,
  mintPublicToken,
  authHeader,
} from "./helpers/auth";
import {
  makeSessionFixture,
  makeInsertSessionFixture,
} from "./fixtures/session";
import {
  makeMessageFixture,
  makeUserMessageFixture,
  makeAssistantMessageFixture,
} from "./fixtures/message";
import {
  makeAgentSettingsFixture,
  makeInsertAgentSettingsFixture,
} from "./fixtures/agentSettings";
import {
  resetOpenAIMocks,
  FIXTURE_CLASSIFIER_OUTPUT,
  FIXTURE_STREAMING_RESPONSE,
} from "./mocks/openai";
import {
  seedUser,
  seedSession,
  seedMessage,
  seedAgentSettings,
  clearChatTables,
  closeDatabaseConnection,
  getDbHelperFunctions,
} from "./helpers/db";

describe("Test infrastructure smoke test", () => {
  describe("Auth helper", () => {
    it("mints a valid JWT for admin role", () => {
      const token = mintAdminToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("mints tokens for all required roles", () => {
      const roles = ["admin", "company_admin", "member", "public"] as const;
      for (const role of roles) {
        const token = mintTestToken(role, `test-user-${role}`);
        expect(token).toBeTruthy();
        expect(token.split(".")).toHaveLength(3);
      }
    });

    it("mintMemberToken produces a valid JWT for member role", () => {
      const token = mintMemberToken("test-member-001", 42);
      expect(token.split(".")).toHaveLength(3);
    });

    it("produces Authorization header object", () => {
      const token = mintCompanyAdminToken();
      const header = authHeader(token);
      expect(header.Authorization).toMatch(/^Bearer /);
    });

    it("mintPublicToken produces a valid JWT", () => {
      const token = mintPublicToken();
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("Session fixture factory", () => {
    it("creates a valid session fixture with defaults", () => {
      const session = makeSessionFixture();
      expect(session.id).toBe(1);
      expect(session.userId).toBe("test-user-001");
      expect(session.title).toBe("Test Chat Session");
      expect(session.isPinned).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it("applies overrides to session fixture", () => {
      const session = makeSessionFixture({
        userId: "custom-user",
        title: "Custom Title",
      });
      expect(session.userId).toBe("custom-user");
      expect(session.title).toBe("Custom Title");
    });

    it("creates a valid insert session fixture", () => {
      const fixture = makeInsertSessionFixture({ userId: "user-123" });
      expect(fixture.userId).toBe("user-123");
      expect(fixture.title).toBeDefined();
    });
  });

  describe("Message fixture factory", () => {
    it("creates a user message fixture", () => {
      const msg = makeUserMessageFixture("Hello, I need a bolt.");
      expect(msg.content).toBe("Hello, I need a bolt.");
      expect(msg.isUser).toBe(true);
      expect(msg.status).toBe("complete");
    });

    it("creates an assistant message fixture", () => {
      const msg = makeAssistantMessageFixture("Here are some bolt options.");
      expect(msg.content).toBe("Here are some bolt options.");
      expect(msg.isUser).toBe(false);
    });

    it("creates a generic message fixture with defaults", () => {
      const msg = makeMessageFixture();
      expect(msg.id).toBe(1);
      expect(msg.sessionId).toBe(1);
      expect(msg.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("Agent settings fixture factory", () => {
    it("creates settings fixture with defaults", () => {
      const settings = makeAgentSettingsFixture();
      expect(settings.model).toBe("gpt-4o");
      expect(settings.webSearchEnabled).toBe(false);
      expect(settings.compactionThresholdPct).toBe(70);
      expect(settings.createdAt).toBeInstanceOf(Date);
    });

    it("applies overrides to agent settings", () => {
      const settings = makeAgentSettingsFixture({
        model: "gpt-4o-mini",
        webSearchEnabled: true,
      });
      expect(settings.model).toBe("gpt-4o-mini");
      expect(settings.webSearchEnabled).toBe(true);
    });

    it("creates insert fixture", () => {
      const fixture = makeInsertAgentSettingsFixture({ name: "Custom Agent" });
      expect(fixture.name).toBe("Custom Agent");
    });
  });

  describe("OpenAI mock fixtures", () => {
    it("exports valid classifier output fixture", () => {
      expect(FIXTURE_CLASSIFIER_OUTPUT.intent).toBe("product_search");
      expect(FIXTURE_CLASSIFIER_OUTPUT.confidence).toBeGreaterThan(0);
    });

    it("exports valid streaming response fixture", () => {
      expect(FIXTURE_STREAMING_RESPONSE.status).toBe("completed");
      expect(FIXTURE_STREAMING_RESPONSE.output).toHaveLength(1);
    });

    it("resetOpenAIMocks is callable without throwing", () => {
      expect(() => resetOpenAIMocks()).not.toThrow();
      expect(typeof resetOpenAIMocks).toBe("function");
    });
  });

  describe("DB helper wiring", () => {
    it("exports all required DB helper functions including seedUser", () => {
      expect(typeof seedUser).toBe("function");
      expect(typeof seedSession).toBe("function");
      expect(typeof seedMessage).toBe("function");
      expect(typeof seedAgentSettings).toBe("function");
      expect(typeof clearChatTables).toBe("function");
      expect(typeof closeDatabaseConnection).toBe("function");
    });

    it("getDbHelperFunctions returns all helpers as an object", () => {
      const helpers = getDbHelperFunctions();
      expect(typeof helpers.seedUser).toBe("function");
      expect(typeof helpers.seedSession).toBe("function");
      expect(typeof helpers.seedMessage).toBe("function");
      expect(typeof helpers.seedAgentSettings).toBe("function");
      expect(typeof helpers.clearChatTables).toBe("function");
      expect(typeof helpers.closeDatabaseConnection).toBe("function");
    });

    it("closeDatabaseConnection is safe to call when no connection is open", async () => {
      await expect(closeDatabaseConnection()).resolves.toBeUndefined();
    });
  });
});
