import { getGeniusConfidenceLevel } from "@shared/schema";
import type { GeniusCalculationDoc } from "./types";

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Render a calculation document to a clean Markdown report for download.
export function docToMarkdown(doc: GeniusCalculationDoc): string {
  const lines: string[] = [];
  lines.push(`# ${doc.projectTitle}`, "");

  // Version history metadata block
  if (doc.versions && doc.versions.length > 0) {
    const created = doc.versions[0];
    lines.push(`**Generated:** ${fmtDate(created.date)}`);
    lines.push("**Version history:**");
    for (const v of doc.versions) {
      lines.push(`- Version ${v.version} — ${fmtDate(v.date)}${v.version > 1 ? " (updated)" : ""}`);
    }
    lines.push("");
  }

  if (doc.problemStatement) lines.push(doc.problemStatement, "");

  if (doc.inputs.length) {
    lines.push("## Inputs", "", "| Symbol | Quantity | Value | Unit |", "| --- | --- | --- | --- |");
    for (const i of doc.inputs) lines.push(`| ${i.symbol} | ${i.label} | ${i.value} | ${i.unit} |`);
    lines.push("");
  }

  if (doc.assumptions.length) {
    lines.push("## Assumptions", "", "| Quantity | Value | Unit | Rationale |", "| --- | --- | --- | --- |");
    for (const a of doc.assumptions) lines.push(`| ${a.label} | ${a.value} | ${a.unit} | ${a.rationale || ""} |`);
    lines.push("");
  }

  if (doc.steps.length) {
    lines.push("## Calculation Steps", "");
    doc.steps.forEach((s, idx) => {
      lines.push(`### ${idx + 1}. ${s.title}`);
      if (s.description) lines.push(s.description);
      if (s.formula) lines.push(`Formula: $$${s.formula}$$`);
      if (s.calculation) lines.push(`Substitution: $$${s.calculation}$$`);
      lines.push(`Result: **${s.result} ${s.unit}**`);
      if (s.sources?.length) lines.push(`Sources: ${s.sources.map((n) => `[${n}]`).join(" ")}`);
      for (const w of s.warnings || []) lines.push(`> ⚠️ ${w}`);
      lines.push("");
    });
  }

  if (doc.results.length) {
    lines.push("## Results", "", "| Quantity | Value | Unit |", "| --- | --- | --- |");
    for (const r of doc.results) lines.push(`| ${r.label} | ${r.value} | ${r.unit} |`);
    lines.push("");
  }

  if (doc.confidence) {
    lines.push("## Confidence", "", `**${getGeniusConfidenceLevel(doc.confidence.score)} Confidence** — ${doc.confidence.explanation}`, "");
    for (const f of doc.confidence.factors || []) lines.push(`- ${f}`);
    lines.push("");
  }

  if (doc.references.length) {
    lines.push("## References", "");
    for (const r of doc.references) lines.push(`${r.id}. ${r.title}${r.url ? ` — ${r.url}` : ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(doc: GeniusCalculationDoc): void {
  const md = docToMarkdown(doc);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.projectTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "calculation"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
