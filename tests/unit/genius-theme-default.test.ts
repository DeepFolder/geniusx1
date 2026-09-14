import { describe, expect, it } from "vitest";
import { getInitialTheme } from "../../client/src/features/genius/useTheme";

describe("Genius X1 theme default", () => {
  it("starts in dark mode when the user has not saved a preference", () => {
    expect(getInitialTheme()).toBe("dark");
  });
});
