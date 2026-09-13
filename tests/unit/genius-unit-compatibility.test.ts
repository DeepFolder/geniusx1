import { describe, expect, it } from "vitest";
import type { GeniusCalculationDoc } from "../../shared/schema.js";
import { parseUnit, recomputeDoc } from "../../server/services/genius-eval.js";
import { convertUnitValue } from "../../shared/unit-families.js";

function doc(overrides: Partial<GeniusCalculationDoc>): GeniusCalculationDoc {
  return {
    projectTitle: "Unit checks",
    problemStatement: "",
    inputs: [],
    assumptions: [],
    steps: [],
    results: [],
    references: [],
    confidence: { score: 90, explanation: "", factors: [] },
    visualizations: [],
    expertSummary: "",
    recommendations: [],
    versions: [],
    ...overrides,
  };
}

function physicalValue(value: string | number, unit: string): number {
  const parsed = parseUnit(unit);
  if (!parsed.known) throw new Error(`Unsupported test unit: ${unit}`);
  return Number(value) * parsed.scale + (parsed.offset ?? 0);
}

describe("dimensional unit checks", () => {
  it("parses scaled and compound SI units into compatible families", () => {
    const pressure = parseUnit("MPa");
    const compound = parseUnit("N·m/s²");
    expect(pressure.known && pressure.scale).toBe(1e6);
    expect(compound.known).toBe(true);
    expect(parseUnit("widget").known).toBe(false);
  });

  it("formats bearing rating life as Mrev without changing generic dimensionless values", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "rating", symbol: "C", label: "Dynamic load rating", value: 45000, unit: "N", editable: true, description: "" },
        { id: "load", symbol: "P", label: "Equivalent dynamic load", value: 15000, unit: "N", editable: true, description: "" },
        { id: "speed", symbol: "n", label: "Rotational speed", value: 1200, unit: "RPM", editable: true, description: "" },
      ],
      assumptions: [{ id: "exponent", symbol: "p", label: "Life exponent", value: 3, unit: "1", editable: true, rationale: "" }],
      steps: [
        { id: "life-rev", symbol: "L10", title: "Basic rating life", description: "", formula: "", expr: "1000000*(C/P)^p", calculation: "", result: "", unit: "million revolutions", sources: [], warnings: [] },
        { id: "life-hours", symbol: "L10h", title: "Basic rating life in hours", description: "", formula: "", expr: "L10*2*pi/n", calculation: "", result: "", unit: "h", sources: [], warnings: [] },
        { id: "ratio", symbol: "R", title: "Load ratio", description: "", formula: "", expr: "C/P", calculation: "", result: "", unit: "1", sources: [], warnings: [] },
      ],
      results: [
        { id: "life-rev-result", label: "Basic rating life", symbol: "L10", value: "", unit: "Mrev", sources: [], description: "" },
        { id: "life-hours-result", label: "Basic rating life in hours", symbol: "L10h", value: "", unit: "h", sources: [], description: "" },
        { id: "ratio-result", label: "Load ratio", symbol: "R", value: "", unit: "1", sources: [], description: "" },
      ],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "27", unit: "Mrev", reviewNeeded: false });
    expect(computed.steps[1]).toMatchObject({ result: "375", unit: "h", reviewNeeded: false });
    expect(computed.steps[2]).toMatchObject({ result: "3", unit: "", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "27", unit: "Mrev", reviewNeeded: false });
    expect(computed.results[1]).toMatchObject({ value: "375", unit: "h", reviewNeeded: false });
    expect(computed.results[2]).toMatchObject({ value: "3", unit: "", reviewNeeded: false });
  });

  it("normalizes AI-written dimensionless units so bearing-life hours do not lose L10", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "rating", symbol: "C", label: "Dynamic load rating", value: 45000, unit: "N", editable: true, description: "" },
        { id: "load", symbol: "P", label: "Equivalent dynamic load", value: 15000, unit: "N", editable: true, description: "" },
        { id: "speed", symbol: "n", label: "Rotational speed", value: 1200, unit: "RPM", editable: true, description: "" },
      ],
      assumptions: [{ id: "exponent", symbol: "p", label: "Life exponent", value: 3, unit: "dimensionless", editable: true, rationale: "" }],
      steps: [
        // This mirrors the common model output that formerly failed the first
        // step and consequently left the following L10 reference undefined.
        { id: "life-rev", symbol: "L10", title: "Basic rating life", description: "", formula: "", expr: "1000000*(C/P)^p", calculation: "", result: "", unit: "dimensionless", sources: [], warnings: [] },
        { id: "life-hours", symbol: "L10h", title: "Basic rating life in hours", description: "", formula: "", expr: "L10*2*pi/n", calculation: "", result: "", unit: "h", sources: [], warnings: [] },
      ],
      results: [{ id: "life-hours-result", label: "Basic rating life in hours", symbol: "L10h", value: "", unit: "h", sources: [], description: "" }],
    }));

    expect(computed.steps[0]).toMatchObject({ result: "27000000", unit: "", reviewNeeded: false });
    expect(computed.steps[1]).toMatchObject({ result: "375", unit: "h", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "375", unit: "h", reviewNeeded: false });
  });

  it("converts compatible metre and millimetre inputs before addition", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "a", symbol: "a", label: "Length A", value: 1, unit: "m", editable: true, description: "" },
        { id: "b", symbol: "b", label: "Length B", value: 250, unit: "mm", editable: true, description: "" },
      ],
      steps: [{ id: "sum", symbol: "c", title: "Total length", description: "", formula: "", expr: "a+b", calculation: "", result: "", unit: "m", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Total length", symbol: "c", value: "", unit: "m", sources: [], description: "" }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "1.25", unit: "m", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "1.25", unit: "m", reviewNeeded: false });
  });

  it("names the invalid input when a calculation cannot be verified", () => {
    const computed = recomputeDoc(doc({
      inputs: [{ id: "mass", symbol: "m", label: "Mass", value: "", unit: "kg", editable: true, description: "" }],
      assumptions: [{ id: "accel", symbol: "a", label: "Acceleration", value: 2, unit: "m/s²", editable: true, rationale: "" }],
      steps: [{ id: "force", symbol: "F", title: "Force", description: "", formula: "F = ma", expr: "m*a", calculation: "", result: "", unit: "N", sources: [], warnings: [] }],
      results: [{ id: "force-result", label: "Force", symbol: "F", value: "", unit: "N", sources: [], description: "" }],
    }));

    expect(computed.steps[0]).toMatchObject({ result: "—", reviewNeeded: true });
    expect(computed.steps[0].warnings).toContain('Unit review: missing or invalid numeric input "Mass" (m).');
  });

  it("uses an uppercase E worksheet symbol as elastic modulus in Euler buckling", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "modulus", symbol: "E", label: "Modulus of Elasticity", value: 210000, unit: "MPa", editable: true, description: "" },
        { id: "inertia", symbol: "I", label: "Moment of Inertia", value: 0.000008, unit: "m^4", editable: true, description: "" },
        { id: "length", symbol: "l_e", label: "Effective Length", value: 10, unit: "m", editable: true, description: "" },
      ],
      steps: [
        { id: "buckling", symbol: "P_cr", title: "Euler Critical Buckling Load", description: "", formula: "", expr: "pi^2*E*I/(l_e^2)", calculation: "", result: "", unit: "N", sources: [], warnings: [] },
      ],
      results: [
        { id: "buckling-result", label: "Critical Buckling Load", symbol: "P_cr", value: "", unit: "N", sources: [], description: "" },
      ],
    }));

    expect(computed.steps[0]).toMatchObject({ result: "165.81", unit: "kN", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "165.81", unit: "kN", reviewNeeded: false });
  });

  it("accepts every unit family exposed by the editable input picker", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "pressure", symbol: "p", label: "Pressure", value: 1, unit: "bar", editable: true, description: "" },
        { id: "temperature", symbol: "temp", label: "Temperature", value: 20, unit: "°C", editable: true, description: "" },
      ],
      steps: [
        { id: "pascal", symbol: "p_pa", title: "Pressure", description: "", formula: "", expr: "p", calculation: "", result: "", unit: "Pa", sources: [], warnings: [] },
        { id: "celsius", symbol: "temp_c", title: "Temperature", description: "", formula: "", expr: "temp", calculation: "", result: "", unit: "°C", sources: [], warnings: [] },
      ],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "100", unit: "kPa", reviewNeeded: false });
    expect(computed.steps[1]).toMatchObject({ result: "20", unit: "°C", reviewNeeded: false });
  });

  it("keeps RPM, Hz, and rad/s interchangeable after an input unit conversion", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "speed", symbol: "omega", label: "Angular speed", value: 100 * Math.PI, unit: "rad/s", editable: true, description: "" },
        { id: "torque", symbol: "tau", label: "Torque", value: 10, unit: "N·m", editable: true, description: "" },
      ],
      steps: [
        { id: "rpm", symbol: "n", title: "Speed", description: "", formula: "", expr: "omega", calculation: "", result: "", unit: "RPM", sources: [], warnings: [] },
        { id: "power", symbol: "power", title: "Power", description: "", formula: "", expr: "tau*omega", calculation: "", result: "", unit: "W", sources: [], warnings: [] },
      ],
      results: [
        { id: "speed-result", label: "Speed", symbol: "n", value: "", unit: "Hz", sources: [], description: "" },
        { id: "power-result", label: "Power", symbol: "power", value: "", unit: "W", sources: [], description: "" },
      ],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "3000", unit: "RPM", reviewNeeded: false });
    expect(computed.steps[1]).toMatchObject({ result: "3.14", unit: "kW", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "50", unit: "Hz", reviewNeeded: false });
    expect(computed.results[1].reviewNeeded).toBe(false);
  });

  it("preserves legacy mm-to-m ball-screw formulas after compatible input conversion", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        // 150 mm/s edited through the picker becomes 0.15 m/s.
        { id: "speed", symbol: "v", label: "Linear speed", value: 0.15, unit: "m/s", editable: true, description: "" },
        { id: "lead", symbol: "l", label: "Screw lead", value: 10, unit: "mm", editable: true, description: "" },
      ],
      steps: [{ id: "rpm", symbol: "n", title: "Screw speed", description: "", formula: "", expr: "(v/(l/1000))*60", calculation: "", result: "", unit: "RPM", sources: [], warnings: [] }],
      results: [{ id: "rpm-result", label: "Screw speed", symbol: "n", value: "", unit: "RPM", sources: [], description: "" }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "900", unit: "RPM", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "900", unit: "RPM", reviewNeeded: false });
  });

  it("preserves legacy formula results after an input switches units", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        // 80 km/h is shown as 22.222… m/s after the picker conversion. The
        // existing expression still expects km/h and must not divide twice.
        { id: "speed", symbol: "v", label: "Vehicle speed", value: 80 / 3.6, unit: "m/s", evaluationUnit: "km/h", editable: true, description: "" },
      ],
      steps: [{ id: "convert", symbol: "speed", title: "Convert speed", description: "", formula: "", expr: "v/3.6", calculation: "", result: "", unit: "m/s", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Converted speed", symbol: "speed", value: "", unit: "m/s", sources: [], description: "" }],
    }));
    expect(Number(computed.steps[0].result)).toBeCloseTo(80 / 3.6, 2);
    expect(Number(computed.results[0].value)).toBeCloseTo(80 / 3.6, 2);
  });

  it("repairs an already-converted legacy speed input on recalculation", () => {
    const computed = recomputeDoc(doc({
      // This represents a document saved by the earlier bug: its input label
      // has already changed to m/s, but the formula still encodes km/h → m/s.
      inputs: [{ id: "speed", symbol: "v", label: "Vehicle speed", value: 80 / 3.6, unit: "m/s", editable: true, description: "" }],
      steps: [{ id: "convert", symbol: "speed", title: "Convert speed", description: "", formula: "", expr: "v/3.6", calculation: "", result: "", unit: "m/s", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Converted speed", symbol: "speed", value: "", unit: "m/s", sources: [], description: "" }],
    }));
    expect(Number(computed.steps[0].result)).toBeCloseTo(80 / 3.6, 2);
    expect(Number(computed.results[0].value)).toBeCloseTo(80 / 3.6, 2);
  });

  it("keeps SI-native formulas correct when an input changes display units", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        // No evaluationUnit: new formulas receive canonical SI values.
        { id: "speed", symbol: "v", label: "Vehicle speed", value: 80 / 3.6, unit: "m/s", editable: true, description: "" },
      ],
      steps: [{ id: "speed", symbol: "speed", title: "Speed", description: "", formula: "", expr: "v", calculation: "", result: "", unit: "m/s", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Speed", symbol: "speed", value: "", unit: "m/s", sources: [], description: "" }],
    }));
    expect(Number(computed.steps[0].result)).toBeCloseTo(80 / 3.6, 2);
    expect(Number(computed.results[0].value)).toBeCloseTo(80 / 3.6, 2);
  });

  it.each([
    ["length", 250, "mm", "m", "m"],
    ["area", 10_000, "mm²", "m²", "m²"],
    ["volume", 1, "L", "m³", "m³"],
    ["force", 5, "kN", "N", "N"],
    ["pressure", 2, "MPa", "bar", "Pa"],
    ["moment", 1_000, "N·mm", "N·m", "N·m"],
    ["mass", 500, "g", "kg", "kg"],
    ["speed", 72, "km/h", "m/s", "m/s"],
    ["rotational speed", 3_000, "RPM", "rad/s", "rad/s"],
    ["flow rate", 60, "L/min", "m³/s", "m³/s"],
    ["time", 2, "h", "min", "s"],
    ["energy", 1, "kWh", "J", "J"],
    ["voltage", 1_000, "mV", "V", "V"],
    ["current", 2_000, "mA", "A", "A"],
  ] as const)("keeps a %s result physically equivalent after a compatible input-unit change", (
    _family,
    inputValue,
    originalUnit,
    changedUnit,
    resultUnit,
  ) => {
    const changedValue = convertUnitValue(inputValue, originalUnit, changedUnit);
    expect(changedValue).not.toBeNull();
    const makeDoc = (value: number, unit: string) => doc({
      inputs: [{ id: "input", symbol: "x", label: "Input", value, unit, editable: true, description: "" }],
      steps: [{ id: "step", symbol: "y", title: "Result", description: "", formula: "", expr: "x", calculation: "", result: "", unit: resultUnit, sources: [], warnings: [] }],
      results: [{ id: "result", label: "Result", symbol: "y", value: "", unit: resultUnit, sources: [], description: "" }],
    });

    const before = recomputeDoc(makeDoc(inputValue, originalUnit));
    const after = recomputeDoc(makeDoc(changedValue!, changedUnit));

    expect(physicalValue(after.steps[0].result, after.steps[0].unit))
      .toBeCloseTo(physicalValue(before.steps[0].result, before.steps[0].unit), 9);
    expect(physicalValue(after.results[0].value, after.results[0].unit))
      .toBeCloseTo(physicalValue(before.results[0].value, before.results[0].unit), 9);
    expect(after.steps[0].reviewNeeded).toBe(false);
    expect(after.results[0].reviewNeeded).toBe(false);
  });

  it("uses a legacy millimetre convention exactly once after a picker conversion", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "length", symbol: "l", label: "Length", value: 0.25, unit: "m", evaluationUnit: "mm", editable: true, description: "" },
      ],
      steps: [{ id: "convert", symbol: "length", title: "Convert length", description: "", formula: "", expr: "l/1000", calculation: "", result: "", unit: "m", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Length", symbol: "length", value: "", unit: "m", sources: [], description: "" }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "250", unit: "mm", reviewNeeded: false });
    expect(computed.results[0]).toMatchObject({ value: "250", unit: "mm", reviewNeeded: false });
  });

  it("does not convert bearing life to hours twice when the expression already uses 3600", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "speed", symbol: "n", label: "Rotational speed", value: 1200, unit: "RPM", editable: true, description: "" },
      ],
      steps: [
        { id: "life", symbol: "t_mr", title: "Hours per million revolutions", description: "", formula: "", expr: "1000000*2*pi/(3600*n)", calculation: "", result: "", unit: "h", sources: [], warnings: [] },
        { id: "total", symbol: "L10", title: "Basic rating life", description: "", formula: "", expr: "27*t_mr", calculation: "", result: "", unit: "h", sources: [], warnings: [] },
      ],
      results: [{ id: "result", label: "Basic rating life", symbol: "L10", value: "", unit: "h", sources: [], description: "" }],
    }));
    expect(Number(computed.steps[0].result)).toBeCloseTo(13.8889, 2);
    expect(Number(computed.steps[1].result)).toBeCloseTo(375, 3);
    expect(Number(computed.results[0].value)).toBeCloseTo(375, 3);
  });

  it("preserves the legacy RPM bearing-life formula in hours", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "speed", symbol: "n", label: "Rotational speed", value: 1200, unit: "RPM", editable: true, description: "" },
      ],
      steps: [{ id: "life", symbol: "L10", title: "Basic rating life", description: "", formula: "", expr: "27*1000000/(60*n)", calculation: "", result: "", unit: "h", sources: [], warnings: [] }],
      results: [{ id: "result", label: "Basic rating life", symbol: "L10", value: "", unit: "h", sources: [], description: "" }],
    }));
    expect(Number(computed.steps[0].result)).toBeCloseTo(375, 3);
    expect(Number(computed.results[0].value)).toBeCloseTo(375, 3);
  });

  it("flags addition of incompatible physical quantities", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "length", symbol: "l", label: "Length", value: 2, unit: "m", editable: true, description: "" },
        { id: "time", symbol: "t", label: "Time", value: 3, unit: "s", editable: true, description: "" },
      ],
      steps: [{ id: "bad", symbol: "x", title: "Invalid addition", description: "", formula: "", expr: "l+t", calculation: "", result: "", unit: "m", sources: [], warnings: [] }],
    }));
    expect(computed.steps[0].result).toBe("—");
    expect(computed.steps[0].reviewNeeded).toBe(true);
    expect(computed.steps[0].warnings.join(" ")).toMatch(/cannot add length and time/);
  });

  it("flags an incorrect result label and an unknown unit", () => {
    const computed = recomputeDoc(doc({
      inputs: [{ id: "f", symbol: "F", label: "Force", value: 10, unit: "N", editable: true, description: "" }],
      steps: [{ id: "force", symbol: "F_out", title: "Force", description: "", formula: "", expr: "F", calculation: "", result: "", unit: "N", sources: [], warnings: [] }],
      results: [
        { id: "wrong", label: "Wrong label", symbol: "F_out", value: "", unit: "m", sources: [], description: "" },
        { id: "unknown", label: "Unknown label", symbol: "F_out", value: "", unit: "furlongish", sources: [], description: "" },
      ],
    }));
    expect(computed.results.every((result) => result.reviewNeeded)).toBe(true);
    expect(computed.results[0].warnings?.join(" ")).toMatch(/expects force/);
    expect(computed.results[1].warnings?.join(" ")).toMatch(/Unknown or unsupported/);
  });

  it("handles degrees as angles and returns a dimensionless trig result", () => {
    const computed = recomputeDoc(doc({
      inputs: [{ id: "angle", symbol: "theta", label: "Angle", value: 90, unit: "deg", editable: true, description: "" }],
      steps: [{ id: "sin", symbol: "s", title: "Sine", description: "", formula: "", expr: "sin(theta)", calculation: "", result: "", unit: "", sources: [], warnings: [] }],
      results: [{ id: "sin-result", label: "Sine", symbol: "s", value: "", unit: "", sources: [], description: "" }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "1", reviewNeeded: false });
  });

  it("keeps canonical angle values correct through conversion helpers", () => {
    const computed = recomputeDoc(doc({
      inputs: [{ id: "angle", symbol: "theta", label: "Angle", value: 90, unit: "deg", editable: true, description: "" }],
      steps: [{ id: "convert", symbol: "r", title: "Radians", description: "", formula: "", expr: "deg2rad(theta)", calculation: "", result: "", unit: "rad", sources: [], warnings: [] }],
    }));
    expect(computed.steps[0].result).toBe("1.57");
    expect(computed.steps[0].reviewNeeded).toBe(false);
  });

  it("preserves dimensions for supported functions and validates atan2 arguments", () => {
    const base = doc({
      inputs: [
        { id: "a", symbol: "a", label: "Length A", value: -3, unit: "m", editable: true, description: "" },
        { id: "b", symbol: "b", label: "Length B", value: 4, unit: "m", editable: true, description: "" },
      ],
      steps: [
        { id: "abs", symbol: "length", title: "Absolute length", description: "", formula: "", expr: "abs(a)", calculation: "", result: "", unit: "m", sources: [], warnings: [] },
        { id: "pow", symbol: "area", title: "Area", description: "", formula: "", expr: "pow(b,2)", calculation: "", result: "", unit: "m²", sources: [], warnings: [] },
        { id: "angle", symbol: "theta", title: "Angle", description: "", formula: "", expr: "atan2(a,b)", calculation: "", result: "", unit: "rad", sources: [], warnings: [] },
      ],
    });
    expect(recomputeDoc(base).steps.every((step) => !step.reviewNeeded)).toBe(true);
    base.inputs[1].unit = "s";
    expect(recomputeDoc(base).steps[2].reviewNeeded).toBe(true);
  });

  it("uses each pow call's own exponent in compound expressions", () => {
    const computed = recomputeDoc(doc({
      inputs: [{ id: "length", symbol: "l", label: "Length", value: 2, unit: "m", editable: true, description: "" }],
      steps: [{ id: "volume", symbol: "v", title: "Combined power", description: "", formula: "", expr: "pow(l,2)*pow(l,3)", calculation: "", result: "", unit: "m⁵", sources: [], warnings: [] }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "32", reviewNeeded: false });
  });

  it("marks unknown no-expression steps and outputs sourced from failed steps for review", () => {
    const computed = recomputeDoc(doc({
      steps: [{ id: "missing", symbol: "x", title: "Missing", description: "", formula: "", expr: "", calculation: "", result: "", unit: "mystery", sources: [], warnings: [] }],
      results: [{ id: "output", label: "Output", symbol: "x", value: "123", unit: "m", sources: [], description: "" }],
    }));
    expect(computed.steps[0]).toMatchObject({ result: "—", reviewNeeded: true });
    expect(computed.steps[0].warnings.join(" ")).toMatch(/Unknown or unsupported/);
    expect(computed.results[0]).toMatchObject({ value: "—", reviewNeeded: true });
  });

  it("does not reuse a stale symbol after a failed step overwrites it", () => {
    const computed = recomputeDoc(doc({
      inputs: [
        { id: "force", symbol: "F", label: "Force", value: 10, unit: "N", editable: true, description: "" },
        { id: "length", symbol: "l", label: "Length", value: 2, unit: "m", editable: true, description: "" },
        { id: "time", symbol: "t", label: "Time", value: 1, unit: "s", editable: true, description: "" },
      ],
      steps: [
        { id: "invalid", symbol: "F", title: "Broken force", description: "", formula: "", expr: "F+t", calculation: "", result: "", unit: "N", sources: [], warnings: [] },
        { id: "energy", symbol: "E", title: "Energy", description: "", formula: "", expr: "F*l", calculation: "", result: "", unit: "J", sources: [], warnings: [] },
      ],
      results: [
        { id: "force-result", label: "Force", symbol: "F", value: "", unit: "N", sources: [], description: "" },
        { id: "energy-result", label: "Energy", symbol: "E", value: "", unit: "J", sources: [], description: "" },
      ],
    }));
    expect(computed.steps.map((step) => step.result)).toEqual(["—", "—"]);
    expect(computed.results.every((result) => result.reviewNeeded && result.value === "—")).toBe(true);
  });
});