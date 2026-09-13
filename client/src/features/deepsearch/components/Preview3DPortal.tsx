import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Three3DViewer from "@/components/models/Three3DViewer";

interface Preview3DPortalProps {
  preview3DProduct: { id: number; modelPath: string; name: string; buttonRect: DOMRect } | null;
  onClose: () => void;
}

export function Preview3DPortal({ preview3DProduct, onClose }: Preview3DPortalProps) {
  if (!preview3DProduct) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={onClose}>
      <div
        className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{
          width: '320px',
          height: '280px',
          left: Math.min(preview3DProduct.buttonRect.left, window.innerWidth - 340),
          top: Math.max(20, preview3DProduct.buttonRect.top - 290),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="w-full h-full">
          <Three3DViewer
            modelPath={preview3DProduct.modelPath}
            fileName={preview3DProduct.name}
            minimal={true}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
