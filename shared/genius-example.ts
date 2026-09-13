import type { GeniusCalculationDoc } from "./schema";

// Preloaded example shown on first load: a ball-screw actuator sizing problem.
// Step `expr` fields are evaluated server-side; values below are pre-filled to
// match so the worksheet renders instantly without a round-trip.
//
// Symbol conventions demonstrated here (teach-by-example for the AI):
//   F, v      — uppercase/lowercase for force and velocity
//   s, l      — lowercase for geometry (stroke, lead/pitch)
//   eta       — spelled Greek for efficiency (rendered as η)
//   SF        — short uppercase for safety factor
//   n, T      — standard engineering notation for speed and torque
//   P_m, P_d, P_r — uppercase power with ≤3-char subscripts (mechanical, drive, rated)
export const BALL_SCREW_EXAMPLE: GeniusCalculationDoc = {
  projectTitle: "Ball Screw Actuator — Motor Sizing",
  problemStatement:
    "Size the drive motor for a ball screw actuator that must deliver 30 kN of axial force at 150 mm/s over a 300 mm stroke, using a 10 mm/rev screw lead.",
  inputs: [
    { id: "in-F", symbol: "F", label: "Axial force", value: 30000, unit: "N", editable: true, description: "Required axial thrust force at the load. Sets the torque and power demand on the motor." },
    { id: "in-v", symbol: "v", label: "Linear speed", value: 150, unit: "mm/s", editable: true, description: "Required translation speed of the load. Determines the screw rotational speed." },
    { id: "in-s", symbol: "s", label: "Stroke", value: 300, unit: "mm", editable: true, description: "Total travel distance of the actuator. Used to verify duty cycle but not directly in power sizing." },
    { id: "in-l", symbol: "l", label: "Screw lead", value: 10, unit: "mm/rev", editable: true, description: "Linear advance per revolution of the screw. Governs the speed and torque trade-off." },
  ],
  assumptions: [
    { id: "as-eta", symbol: "eta", label: "Mechanical efficiency", value: 0.9, unit: "", rationale: "Typical for a preloaded ball screw.", editable: true },
    { id: "as-sf", symbol: "SF", label: "Safety factor", value: 2, unit: "", rationale: "Standard margin for continuous-duty sizing.", editable: true },
  ],
  steps: [
    {
      id: "s1",
      symbol: "n",
      title: "Rotational speed",
      description: "The screw must turn fast enough to convert lead into the required linear speed.",
      formula: "\\frac{v}{l} \\times 60",
      expr: "(v / l) * 60",
      calculation: "\\frac{150}{10} \\times 60",
      result: "900",
      unit: "rpm",
      sources: [1],
      warnings: [],
    },
    {
      id: "s2",
      symbol: "T",
      title: "Drive torque",
      description: "Torque needed at the screw to overcome the axial load, accounting for efficiency.",
      formula: "\\frac{F \\cdot l}{2\\pi\\,\\eta}",
      expr: "F * (l/1000) / (2*pi*eta)",
      calculation: "\\frac{30000 \\cdot 0.01}{2\\pi \\cdot 0.9}",
      result: "53.05",
      unit: "N·m",
      sources: [1, 2],
      warnings: [],
    },
    {
      id: "s3",
      symbol: "P_m",
      title: "Mechanical power",
      description: "Useful output power delivered to the load.",
      formula: "F \\cdot v",
      expr: "F * (v/1000)",
      calculation: "30000 \\cdot 0.15",
      result: "4500",
      unit: "W",
      sources: [2],
      warnings: [],
    },
    {
      id: "s4",
      symbol: "P_d",
      title: "Drive power",
      description: "Input power the motor must supply after efficiency losses.",
      formula: "\\frac{P_m}{\\eta}",
      expr: "P_m / eta",
      calculation: "\\frac{4500}{0.9}",
      result: "5000",
      unit: "W",
      sources: [2, 3],
      warnings: [],
    },
    {
      id: "s5",
      symbol: "P_r",
      title: "Rated motor power",
      description: "Applying the safety factor gives the minimum continuous motor rating.",
      formula: "P_d \\cdot SF",
      expr: "P_d * SF",
      calculation: "5000 \\cdot 2",
      result: "10000",
      unit: "W",
      sources: [3],
      warnings: ["Required rating includes a 2× safety factor — verify the motor's continuous-duty and thermal limits."],
    },
  ],
  results: [
    { id: "r1", label: "Rotational speed", symbol: "n", value: "900", unit: "rpm", sources: [1], description: "Screw rotational speed needed to achieve the commanded linear velocity." },
    { id: "r2", label: "Drive torque", symbol: "T", value: "53.05", unit: "N·m", sources: [1, 2], description: "Torque the motor must deliver at the screw interface, accounting for efficiency." },
    { id: "r3", label: "Mechanical power", symbol: "P_m", value: "4500", unit: "W", sources: [2], description: "Net output power delivered to the load at the specified force and speed." },
    { id: "r4", label: "Drive power", symbol: "P_d", value: "5000", unit: "W", sources: [2, 3], description: "Motor input power after efficiency losses — the actual electrical demand." },
    { id: "r5", label: "Rated motor power", symbol: "P_r", value: "10000", unit: "W", sources: [3], description: "Minimum continuous motor rating with safety factor applied. Select a motor at or above this value." },
  ],
  references: [
    { id: 1, title: "Manufacturer ball screw engineering guide (placeholder)", url: "https://example.com/ball-screw-guide" },
    { id: 2, title: "Shigley's Mechanical Engineering Design (placeholder)", url: "https://example.com/machine-design" },
    { id: 3, title: "Motor sizing & selection standard (placeholder)", url: "https://example.com/motor-sizing" },
  ],
  confidence: {
    score: 82,
    explanation:
      "Standard, well-established ball screw equations with complete input data. Confidence is limited by the assumed efficiency and safety factor rather than the method itself.",
    factors: [
      "Well-established formulas (high reliability)",
      "All required inputs provided",
      "Two engineering assumptions (efficiency, safety factor)",
      "Placeholder references pending verification",
    ],
  },
  visualizations: [
    {
      id: "v1",
      type: "chart",
      title: "Motor power vs. linear speed",
      caption: "Required motor input power scales linearly with commanded speed at constant force.",
      chartType: "line",
      xKey: "speed",
      xLabel: "Linear speed",
      xUnit: "mm/s",
      yLabel: "Drive power",
      yUnit: "W",
      series: [{ key: "power", label: "Drive power", unit: "W" }],
      data: [
        { speed: 50, power: 1667 },
        { speed: 100, power: 3333 },
        { speed: 150, power: 5000 },
        { speed: 200, power: 6667 },
        { speed: 250, power: 8333 },
        { speed: 300, power: 10000 },
      ],
    },
    {
      id: "v2",
      type: "table",
      title: "Results summary",
      caption: "",
      columns: ["Quantity", "Symbol", "Value", "Unit"],
      rows: [
        ["Rotational speed", "n", "900", "rpm"],
        ["Drive torque", "T", "53.05", "N·m"],
        ["Mechanical power", "P_m", "4500", "W"],
        ["Drive power", "P_d", "5000", "W"],
        ["Rated motor power", "P_r", "10000", "W"],
      ],
    },
  ],
  expertSummary: "",
  recommendations: [],
};
