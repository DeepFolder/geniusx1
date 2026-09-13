interface AnimatedBusyLabelProps {
  label: string;
}

/**
 * Renders a status label's existing trailing ellipsis as one staggered,
 * animated three-dot sequence. It never adds a second ellipsis.
 */
export function AnimatedBusyLabel({ label }: AnimatedBusyLabelProps) {
  const ellipsisMatch = label.match(/(?:…|\.{3})$/);
  const text = ellipsisMatch ? label.slice(0, -ellipsisMatch[0].length) : label;

  return (
    <>
      {text}
      {ellipsisMatch && (
        <span className="ml-0.5 inline-flex gap-px" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="busy-status-dot"
              style={{ animationDelay: `${dot * 160}ms` }}
            >
              .
            </span>
          ))}
        </span>
      )}
    </>
  );
}