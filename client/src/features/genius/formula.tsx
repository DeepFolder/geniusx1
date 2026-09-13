import { RichTextRenderer } from "@/components/chat/RichTextRenderer";

// Genius step formulas/substitutions are raw LaTeX (no delimiters). Wrap them in
// display-math delimiters and force \displaystyle so fractions, integrals, and
// exponents render at full, clearly-visible size — matching the DeepFolder
// calculation section.
function toDisplayLatex(latex: string): string {
  const t = latex.trim();
  if (/\\\(|\\\[|\$\$/.test(t)) {
    return t
      .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => `\\[\\displaystyle ${inner.trim()}\\]`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => `\\(\\displaystyle ${inner.trim()}\\)`)
      .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => `\\[\\displaystyle ${inner.trim()}\\]`);
  }
  return `\\[\\displaystyle ${t}\\]`;
}

export function FormulaBlock({ latex, subtle }: { latex?: string | null; subtle?: boolean }) {
  if (!latex || !latex.trim()) return null;
  return (
    <div className={subtle ? "genius-formula genius-formula--subtle" : "genius-formula"}>
      <RichTextRenderer content={toDisplayLatex(latex)} hideReferences />
    </div>
  );
}
