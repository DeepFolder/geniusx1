// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Worksheet } from "../../client/src/features/genius/Worksheet";
import type { GeniusCalculationDoc } from "../../shared/schema";

const BASE_DOC: GeniusCalculationDoc = {
  projectTitle: "Autosave check",
  problemStatement: "",
  inputs: [],
  assumptions: [],
  steps: [],
  results: [],
  references: [],
  confidence: { score: 0, explanation: "", factors: [] },
  visualizations: [],
  expertSummary: "",
  recommendations: [],
  versions: [],
};

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderWorksheet(saveDetails: (details: NonNullable<GeniusCalculationDoc["details"]>, calculationId: number) => Promise<unknown>, calculationId = 1, doc = BASE_DOC) {
  return render(
    <Worksheet
      doc={doc}
      calculationId={calculationId}
      onSaveDetails={saveDetails}
      onChange={() => {}}
      onRecalc={() => {}}
      isRecalculating={false}
      onExplainStep={() => {}}
      isExplaining={false}
    />,
  );
}

afterEach(() => vi.useRealTimers());

describe("Genius calculation details autosave", () => {
  it("debounces rapid edits and saves only the newest values", async () => {
    vi.useFakeTimers();
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    renderWorksheet(saveDetails);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "First" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Latest" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(saveDetails).toHaveBeenCalledTimes(1);
    expect(saveDetails).toHaveBeenCalledWith(
      { authorName: "Latest", projectNameNumber: "", notes: "" },
      1,
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("keeps a failed draft available and retries its latest values", async () => {
    vi.useFakeTimers();
    const saveDetails = vi.fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(undefined);
    renderWorksheet(saveDetails);

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Keep this note" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(screen.getByRole("alert").textContent).toContain("Network unavailable");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Keep this note");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {});

    expect(saveDetails).toHaveBeenLastCalledWith(
      { authorName: "", projectNameNumber: "", notes: "Keep this note" },
      1,
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("drops queued and completed autosaves when the worksheet changes calculation", async () => {
    vi.useFakeTimers();
    let resolveFirstSave: (() => void) | undefined;
    const saveDetails = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveFirstSave = resolve; }));
    const { rerender } = renderWorksheet(saveDetails);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Calculation A" } });
    rerender(
      <Worksheet doc={{ ...BASE_DOC, details: { authorName: "Calculation B", projectNameNumber: "", notes: "" } }} calculationId={2} onSaveDetails={saveDetails} onChange={() => {}} onRecalc={() => {}} isRecalculating={false} onExplainStep={() => {}} isExplaining={false} />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(saveDetails).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Calculation B");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Calculation B updated" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(saveDetails).toHaveBeenLastCalledWith(expect.anything(), 2);

    rerender(
      <Worksheet doc={{ ...BASE_DOC, details: { authorName: "Calculation C", projectNameNumber: "", notes: "" } }} calculationId={3} onSaveDetails={saveDetails} onChange={() => {}} onRecalc={() => {}} isRecalculating={false} onExplainStep={() => {}} isExplaining={false} />,
    );
    await act(async () => { resolveFirstSave?.(); });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Calculation C");
  });
});