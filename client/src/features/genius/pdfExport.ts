const CSS_PIXELS_PER_MM = 96 / 25.4;
const PRINT_MATH_BASE_SIZE_EM = 0.88;
const PRINT_MATH_AVAILABLE_WIDTH_MM = 145;

export function calculationPdfTitle(calculationName: string): string {
  const cleaned = calculationName
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim();

  return cleaned || "Genius X1 Calculation";
}

export function fittedPrintMathSize(
  naturalWidth: number,
  availableWidth = PRINT_MATH_AVAILABLE_WIDTH_MM * CSS_PIXELS_PER_MM,
): number {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0 || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return PRINT_MATH_BASE_SIZE_EM;
  }

  return Math.min(
    PRINT_MATH_BASE_SIZE_EM,
    PRINT_MATH_BASE_SIZE_EM * (availableWidth / naturalWidth),
  );
}

/**
 * KaTeX equations do not line-wrap automatically. Measure the print-only
 * equation at its normal print size and reduce only equations that would cross
 * the A4 formula column. Each formula keeps its own largest possible size.
 */
export function fitPrintFormulas(root: ParentNode = document): void {
  const ownerDocument = root instanceof Document ? root : root.ownerDocument;
  if (!ownerDocument?.body) return;

  const formulaBlocks = Array.from(
    root.querySelectorAll<HTMLElement>(".step-math-print .katex-block"),
  );
  for (const block of formulaBlocks) {
    block.style.removeProperty("--step-print-math-size");

    const probe = block.cloneNode(true) as HTMLElement;
    probe.setAttribute("aria-hidden", "true");
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    probe.style.top = "0";
    probe.style.display = "block";
    probe.style.visibility = "hidden";
    probe.style.width = "max-content";
    probe.style.maxWidth = "none";
    probe.style.margin = "0";
    probe.style.padding = "0";
    probe.style.fontSize = "0.875rem";

    const probeKatex = probe.querySelector<HTMLElement>(".katex");
    if (!probeKatex) continue;
    probeKatex.style.setProperty("font-size", `${PRINT_MATH_BASE_SIZE_EM}em`, "important");

    ownerDocument.body.appendChild(probe);
    const naturalWidth = Math.max(
      probeKatex.getBoundingClientRect().width,
      probeKatex.scrollWidth,
    );
    probe.remove();

    const fittedSize = fittedPrintMathSize(naturalWidth);
    block.style.setProperty("--step-print-math-size", `${fittedSize.toFixed(4)}em`);
  }
}

export function printCalculationPdf(
  calculationName: string,
  print: () => void = () => window.print(),
): void {
  fitPrintFormulas(document);

  const previousTitle = document.title;
  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  document.title = calculationPdfTitle(calculationName);
  window.addEventListener("afterprint", restoreTitle, { once: true });

  try {
    print();
    // window.print() is blocking in the browsers used for PDF export. Restore
    // the application title once the print dialog has closed.
    window.setTimeout(restoreTitle, 0);
  } catch (error) {
    restoreTitle();
    throw error;
  }
}