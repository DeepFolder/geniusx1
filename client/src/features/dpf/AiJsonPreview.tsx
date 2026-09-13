import { useState } from "react";
import { ChevronDown, ChevronRight, Code2 } from "lucide-react";

interface AiJsonPreviewProps {
  data: object;
}

export default function AiJsonPreview({ data }: AiJsonPreviewProps) {
  const [open, setOpen] = useState(true);
  const json = JSON.stringify(data, null, 2);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <Code2 className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          AI Intelligence Layer — JSON Preview
        </span>
        <span className="ml-auto text-xs text-gray-400">{json.length.toLocaleString()} chars</span>
      </button>
      {open && (
        <pre className="p-4 text-xs bg-gray-950 text-green-400 overflow-auto max-h-80 leading-relaxed font-mono">
          {json}
        </pre>
      )}
    </div>
  );
}
