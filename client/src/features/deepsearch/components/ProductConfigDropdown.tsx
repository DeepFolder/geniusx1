import { useQuery } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings2, ChevronDown, FileText, Box, Link2 } from "lucide-react";

interface ProductConfigDropdownProps {
  productId: number;
  onSelectConfig: (config: any | null) => void;
}

export function ProductConfigDropdown({ productId, onSelectConfig }: ProductConfigDropdownProps) {
  const { data: configs } = useQuery<any[]>({
    queryKey: [`/api/products/${productId}/configurations`],
    enabled: !!productId,
  });

  if (!configs || configs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full">
          <Settings2 className="w-2.5 h-2.5" />
          {configs.length} variant{configs.length !== 1 ? 's' : ''}
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
        <DropdownMenuItem onSelect={() => onSelectConfig(null)}>
          <span className="text-xs font-medium">Base Product</span>
        </DropdownMenuItem>
        {configs.map((config: any) => (
          <DropdownMenuItem key={config.id} onSelect={() => onSelectConfig(config)}>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">{config.name}</span>
              <div className="flex items-center gap-2">
                {config.datasheetPath && (
                  <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
                    <FileText className="w-2.5 h-2.5" />
                    PDF
                  </span>
                )}
                {config.modelPath && (
                  <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                    <Box className="w-2.5 h-2.5" />
                    3D
                  </span>
                )}
                {config.webLink && (
                  <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                    <Link2 className="w-2.5 h-2.5" />
                    Web
                  </span>
                )}
                {!config.datasheetPath && !config.modelPath && !config.webLink && (
                  <span className="text-[10px] text-gray-400 italic">Uses base product files</span>
                )}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
