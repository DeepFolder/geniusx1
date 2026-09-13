import { BookOpen, SlidersHorizontal, Target, Loader2, ExternalLink } from "lucide-react";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { TypingContent } from "../TypingContent";
import type { AISearchMessage } from "../../types";

interface Section {
  key: "Overview" | "Specifications" | "Fit";
  content: string;
}

function parseSections(content: string): Section[] {
  const sectionOrder: Section["key"][] = ["Overview", "Specifications", "Fit"];
  const results: Section[] = [];

  for (let i = 0; i < sectionOrder.length; i++) {
    const key = sectionOrder[i];
    const nextKey = sectionOrder[i + 1];
    const startRe = new RegExp(`##\\s*${key}`, "i");
    const startMatch = content.match(startRe);
    if (!startMatch || startMatch.index === undefined) continue;

    const bodyStart = startMatch.index + startMatch[0].length;
    let bodyEnd = content.length;
    if (nextKey) {
      const endRe = new RegExp(`##\\s*${nextKey}`, "i");
      const endMatch = content.slice(bodyStart).match(endRe);
      if (endMatch && endMatch.index !== undefined) {
        bodyEnd = bodyStart + endMatch.index;
      }
    }

    results.push({ key, content: content.slice(bodyStart, bodyEnd).trim() });
  }

  return results;
}

const SECTION_META: Record<
  Section["key"],
  { icon: React.ElementType; label: string; color: string; border: string; iconColor: string }
> = {
  Overview: {
    icon: BookOpen,
    label: "Overview",
    color: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800/50",
    iconColor: "text-blue-500 dark:text-blue-400",
  },
  Specifications: {
    icon: SlidersHorizontal,
    label: "Specifications",
    color: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800/50",
    iconColor: "text-purple-500 dark:text-purple-400",
  },
  Fit: {
    icon: Target,
    label: "Fit",
    color: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/50",
    iconColor: "text-emerald-500 dark:text-emerald-400",
  },
};

/** Extract bare reference URLs from content, returning { body, refs }. */
function extractRefs(content: string): { body: string; refs: string[] } {
  const refs: string[] = [];
  const body = content
    .split("\n")
    .filter((line) => {
      const m = line.match(/^Reference:\s*(https?:\/\/\S+)/i);
      if (m) { refs.push(m[1]); return false; }
      return true;
    })
    .join("\n")
    .trim();
  return { body, refs };
}

const typedIds = new Set<string>();

interface ExploreMessageProps {
  message: AISearchMessage;
}

export function ExploreMessage({ message }: ExploreMessageProps) {
  const content = message.content || "";
  const sections = parseSections(content);
  const alreadyTyped = typedIds.has(message.id);

  if (message.isStreaming) {
    if (sections.length > 0) {
      return <ExploreLayout sections={sections} streaming partial={content} />;
    }
    return (
      <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">
        <TypingContent content={content} isLiveStreaming={true} />
        <span className="inline-block w-1.5 h-4 bg-blue-500 dark:bg-blue-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      </div>
    );
  }

  if (sections.length > 0) {
    if (!alreadyTyped) typedIds.add(message.id);
    return <ExploreLayout sections={sections} streaming={false} partial={content} />;
  }

  return (
    <div className="text-xs md:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
      <RichTextRenderer content={content} />
    </div>
  );
}

function ExploreLayout({
  sections,
  streaming,
  partial,
}: {
  sections: Section[];
  streaming: boolean;
  partial: string;
}) {
  const renderedKeys = new Set(sections.map((s) => s.key));
  const allKeys: Section["key"][] = ["Overview", "Specifications", "Fit"];

  return (
    <div className="space-y-3">
      {allKeys.map((key) => {
        const meta = SECTION_META[key];
        const Icon = meta.icon;
        const section = sections.find((s) => s.key === key);
        const isPending = streaming && !renderedKeys.has(key);
        const isActive = streaming && renderedKeys.has(key) && sections[sections.length - 1]?.key === key;

        const { body, refs } =
          section && key === "Specifications"
            ? extractRefs(section.content)
            : { body: section?.content ?? "", refs: [] };

        return (
          <div
            key={key}
            className={`rounded-lg border ${meta.border} overflow-hidden`}
          >
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${meta.border}`}>
              <Icon className={`w-3.5 h-3.5 ${meta.iconColor} flex-shrink-0`} />
              <span className={`text-[11px] font-bold uppercase tracking-wider ${meta.color}`}>
                {meta.label}
              </span>
              {isActive && (
                <Loader2 className="w-3 h-3 ml-auto animate-spin text-gray-400" />
              )}
            </div>
            <div className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300">
              {isPending ? (
                <span className="text-gray-400 dark:text-gray-500 italic text-[11px]">Generating…</span>
              ) : section ? (
                <>
                  <RichTextRenderer content={key === "Specifications" ? body : section.content} />
                  {refs.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {refs.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:underline break-all"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
