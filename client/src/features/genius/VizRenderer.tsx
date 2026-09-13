import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { canonicalUnit } from "@shared/unit-canonical";
import { getUnitFamily, convertUnitValue, formatConvertedValue } from "@shared/unit-families";
import { formatGeniusNumber } from "@shared/genius-number-format";
import { SymbolMath } from "@/components/chat/MathHelpers";
import type { GeniusVisualization } from "./types";

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777"];

/**
 * Displays an axis label with an optional unit-conversion dropdown.
 * When the unit belongs to a known family the unit text becomes a small
 * dropdown trigger; selecting a new unit fires onUnitChange.
 */
function AxisUnitSelector({
  label,
  unit,
  onUnitChange,
}: {
  label: string;
  unit: string;
  onUnitChange: (newUnit: string) => void;
}) {
  const family = unit ? getUnitFamily(unit) : null;
  const current = unit ? canonicalUnit(unit) : "";

  const labelText = label && unit ? `${label} (${unit})` : label || unit || "";

  if (!family || !current) {
    return (
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {labelText}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-[11px] text-[color:var(--chart-axis)] hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none cursor-pointer"
        >
          {label && <span>{label}</span>}
          {label && unit && <span>&nbsp;</span>}
          {unit && <span>({unit})</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[4rem]">
        {family.units.map((u) => (
          <DropdownMenuItem
            key={u.unit}
            className={`text-xs ${u.unit === current ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}
            onSelect={() => {
              if (u.unit !== current) onUnitChange(u.unit);
            }}
          >
            {u.unit}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Convert all numeric values for a given data key from one unit to another. */
function convertDataAxis(
  data: Record<string, string | number>[],
  key: string,
  fromUnit: string,
  toUnit: string,
): Record<string, string | number>[] {
  return data.map((row) => {
    const val = row[key];
    const numeric = typeof val === "number" ? val : parseFloat(String(val));
    if (!Number.isFinite(numeric)) return row;
    const converted = convertUnitValue(numeric, fromUnit, toUnit);
    if (converted == null) return row;
    return { ...row, [key]: parseFloat(formatConvertedValue(converted)) };
  });
}

/**
 * ChartViz renders a header stack followed by the chart:
 * X-axis selector, chart title, then the Y-axis selector aligned to the plot.
 */
function ChartViz({
  viz,
  displayDecimals,
}: {
  viz: GeniusVisualization;
  displayDecimals?: number;
}) {
  const rawData = viz.data || [];
  const series = viz.series || [];

  const [xUnit, setXUnit] = useState(viz.xUnit || "");
  const [yUnit, setYUnit] = useState(viz.yUnit || "");
  const [data, setData] = useState(rawData);

  if (!rawData.length || !series.length || !viz.xKey) return null;

  const Chart = viz.chartType === "bar" ? BarChart : LineChart;

  const handleXUnitChange = (newUnit: string) => {
    if (!viz.xKey || !xUnit) return;
    setData((prev) => convertDataAxis(prev, viz.xKey!, xUnit, newUnit) as Record<string, string | number>[]);
    setXUnit(newUnit);
  };

  const handleYUnitChange = (newUnit: string) => {
    if (!yUnit) return;
    setData((prev) => {
      let d = prev;
      for (const s of series) {
        d = convertDataAxis(d, s.key, yUnit, newUnit) as Record<string, string | number>[];
      }
      return d;
    });
    setYUnit(newUnit);
  };

  const tooltipFormatter = (value: number | string, name: string) => {
    const unit = yUnit || "";
    const seriesName = series.length > 1 && name ? ` — ${name}` : "";
    return [`${formatGeniusNumber(value, displayDecimals)}${unit ? " " + unit : ""}`, `${yLabelText || "Y value"}${seriesName}`];
  };

  const xLabelText = viz.xLabel || "";
  const yLabelText = viz.yLabel || "";
  const hasXLabel = !!(xLabelText || xUnit);
  const hasYLabel = !!(yLabelText || yUnit);
  const tooltipLabelFormatter = (value: number | string) => {
    const xName = xLabelText || viz.xKey || "X value";
    return `${xName}: ${formatGeniusNumber(value, displayDecimals)}${xUnit ? ` ${xUnit}` : ""}`;
  };

  return (
    <div>
      {/* Chart title and Y label sit above the plotted Y axis. */}
      <div className="mb-1.5">
        {viz.title && (
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {viz.title}
          </h4>
        )}
        {hasYLabel && (
          <div className="mt-0.5 pl-[58px]">
            <AxisUnitSelector
              label={yLabelText}
              unit={yUnit}
              onUnitChange={handleYUnitChange}
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <Chart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey={viz.xKey}
            stroke="var(--chart-axis)"
            fontSize={12}
            tickFormatter={(value) => formatGeniusNumber(value, displayDecimals)}
          />
          <YAxis
            stroke="var(--chart-axis)"
            fontSize={12}
            width={50}
            tickFormatter={(value) => formatGeniusNumber(value, displayDecimals)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip-bg)",
              border: "1px solid var(--chart-tooltip-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--chart-tooltip-label)" }}
            itemStyle={{ color: "var(--chart-tooltip-label)" }}
            labelFormatter={tooltipLabelFormatter}
            formatter={tooltipFormatter}
          />
          {series.map((s, i) =>
            viz.chartType === "bar" ? (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>

      {/* Standard X-axis title placement: centred directly below the horizontal axis. */}
      {hasXLabel && (
        <div className="flex justify-center mt-0.5">
          <AxisUnitSelector
            label={xLabelText}
            unit={xUnit}
            onUnitChange={handleXUnitChange}
          />
        </div>
      )}

    </div>
  );
}

function TableViz({
  viz,
  displayDecimals,
}: {
  viz: GeniusVisualization;
  displayDecimals?: number;
}) {
  const columns = viz.columns || [];
  const rows = viz.rows || [];
  const symbolColumns = new Set(
    columns
      .map((column, index) => ({ column: column.trim().toLowerCase(), index }))
      .filter(({ column }) => column === "symbol" || column === "sym.")
      .map(({ index }) => index),
  );
  if (!columns.length || !rows.length) return null;
  return (
    <div className="scrollbar-x-thin overflow-x-auto -mx-0.5 px-0.5">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 dark:border-gray-600">
            {columns.map((c) => (
              <th key={c} className="text-left py-1.5 px-3 font-semibold text-gray-600 dark:text-gray-300">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 px-3 text-gray-700 dark:text-gray-300 tabular-nums">
                  {symbolColumns.has(ci) && typeof cell === "string"
                    ? <SymbolMath content={cell} />
                    : formatGeniusNumber(cell, displayDecimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VizRenderer({
  visualizations,
  displayDecimals,
}: {
  visualizations: GeniusVisualization[];
  displayDecimals?: number;
}) {
  if (!visualizations?.length) return null;
  return (
    <div className="space-y-5 py-1">
      {visualizations.map((viz) => (
        <div key={viz.id}>
          {/* For charts, title is rendered inside ChartViz alongside the Y-axis selector.
              For tables, render the title here as before. */}
          {viz.type === "chart" ? (
            <ChartViz viz={viz} displayDecimals={displayDecimals} />
          ) : (
            <>
              {viz.title && (
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{viz.title}</h4>
              )}
              <TableViz viz={viz} displayDecimals={displayDecimals} />
            </>
          )}
          {viz.caption && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{viz.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}
