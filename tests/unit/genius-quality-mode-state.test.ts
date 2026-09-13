// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readInitialQualityModes, toggleQualityMode } from "../../client/src/features/genius/useGenius";

afterEach(() => localStorage.clear());

describe("Genius quality-mode persistence", () => {
  it("restores the selected quality mode after a browser restart", () => {
    localStorage.setItem("genius-phd-mode", "1");

    expect(readInitialQualityModes()).toEqual({ expertMode: false, phdMode: true });
  });

  it("normalizes an old invalid saved selection so Expert and PhD are never both active", () => {
    localStorage.setItem("genius-expert-mode", "1");
    localStorage.setItem("genius-phd-mode", "1");

    expect(readInitialQualityModes()).toEqual({ expertMode: false, phdMode: true });
    expect(localStorage.getItem("genius-expert-mode")).toBe("0");
  });

  it("turns the other quality mode off atomically whenever either mode is selected", () => {
    const phd = toggleQualityMode("phd", { expertMode: true, phdMode: false });
    expect(phd).toEqual({ expertMode: false, phdMode: true });
    expect(localStorage.getItem("genius-expert-mode")).toBe("0");
    expect(localStorage.getItem("genius-phd-mode")).toBe("1");

    const expert = toggleQualityMode("expert", phd);
    expect(expert).toEqual({ expertMode: true, phdMode: false });
    expect(localStorage.getItem("genius-expert-mode")).toBe("1");
    expect(localStorage.getItem("genius-phd-mode")).toBe("0");
  });
});