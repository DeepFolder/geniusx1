import { Package, BadgeCheck, AlertTriangle, MapPin, X, Heart, ChevronDown, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { cn, formatExternalUrl } from "@/lib/utils";
import { STRONG_MATCH_THRESHOLD, productGradients } from "../constants";
import { ProductConfigDropdown } from "./ProductConfigDropdown";
import type { Company, Product } from "../types";

interface ProductCardProps {
  product: Product;
  index: number;
  matchThreshold: number;
  companyMap: Map<number, Company>;
  selectedConfigs: Record<number, any>;
  setSelectedConfigs: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  favoriteProductIds: Set<number>;
  webSearchEngine: { name: string; colorClass: string };
  buildWebSearchUrl: (q: string) => string;
  onDismiss: (e: React.MouseEvent, productId: number) => void;
  onFavorite: (e: React.MouseEvent, productId: number, productName: string, product?: Product) => void;
  onPreview3D: (product: Product, modelPath: string, buttonRect: DOMRect) => void;
  onExplore?: (productName: string, companyName: string, info?: { attributes?: { label: string; value: string; unit?: string }[]; catalogPath?: string; productWebLink?: string; dbProductId?: number }) => void;
}

export function ProductCard({
  product,
  index,
  matchThreshold,
  companyMap,
  selectedConfigs,
  setSelectedConfigs,
  favoriteProductIds,
  webSearchEngine,
  buildWebSearchUrl,
  onDismiss,
  onFavorite,
  onPreview3D,
  onExplore,
}: ProductCardProps) {
  const googleFallback = buildWebSearchUrl((product.name || '') + ' ' + (product.companyName || companyMap.get(product.companyId)?.name || ''));
  const hasVerifiedLink = product.isExternal && product.productWebLink && (product.linkStatus === 'verified' || product.linkStatus === 'recovered');
  const cardProductUrl = product.isExternal
    ? (hasVerifiedLink ? formatExternalUrl(product.productWebLink!) : googleFallback)
    : (product.productWebLink ? formatExternalUrl(product.productWebLink) : '');

  const effectiveModelPath = selectedConfigs[product.id]?.modelPath || product.modelPath;
  const effectiveWebLink = selectedConfigs[product.id]?.webLink || product.productWebLink;
  const datasheetLink = selectedConfigs[product.id]?.datasheetPath || product.catalogPath;
  const docs = product.documentPaths || [];
  const hasDownloads = !!effectiveModelPath || docs.length > 0;
  const isPatent = product.partType?.toLowerCase() === 'patent';
  const configWebLink = selectedConfigs[product.id]?.webLink;
  const webUrl = effectiveWebLink ? formatExternalUrl(effectiveWebLink) : googleFallback;
  const companyEntry = companyMap.get(product.companyId);

  return (
    <div
      className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200 relative animate-in fade-in slide-in-from-bottom-3 duration-400 ease-out"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
    >
      <button
        onClick={(e) => onDismiss(e, product.id)}
        className="absolute top-2 left-2 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        title="Remove from results"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-start p-3 gap-3">
        <div className="w-24 h-24 rounded-lg flex-shrink-0 relative overflow-hidden">
          {product.imagePath ? (
            <img
              src={product.imagePath}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = 'none';
                const parent = el.parentElement;
                if (parent && !parent.querySelector('.img-fallback')) {
                  const fb = document.createElement('div');
                  fb.className = `img-fallback w-full h-full flex items-center justify-center bg-gradient-to-r ${productGradients[product.id % productGradients.length]}`;
                  fb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
                  parent.appendChild(fb);
                }
              }}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center bg-gradient-to-r ${productGradients[product.id % productGradients.length]}`}>
              <Package className="w-8 h-8 text-white/80" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {(!product.isExternal && !cardProductUrl) ? (
              <h5 className="font-semibold text-sm text-gray-400 dark:text-gray-500 line-clamp-1 inline-flex items-center gap-1">
                {product.name}
                {selectedConfigs[product.id] && <span className="text-purple-600 dark:text-purple-400"> — {selectedConfigs[product.id].name}</span>}
              </h5>
            ) : (
              <a href={cardProductUrl} target="_blank" rel="noopener noreferrer">
                <h5 className="font-semibold text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer line-clamp-1 inline-flex items-center gap-1">
                  {product.name}
                  {hasVerifiedLink && <BadgeCheck className="w-3 h-3 text-green-500 flex-shrink-0" />}
                  {selectedConfigs[product.id] && <span className="text-purple-600 dark:text-purple-400"> — {selectedConfigs[product.id].name}</span>}
                </h5>
              </a>
            )}
            <ProductConfigDropdown productId={product.id} onSelectConfig={(config) => setSelectedConfigs(prev => ({ ...prev, [product.id]: config }))} />
            {selectedConfigs[product.id] && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedConfigs(prev => { const next = { ...prev }; delete next[product.id]; return next; }); }}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Clear variant selection"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {(companyEntry || product.companyName) && (
            <div className="mb-1 flex flex-col">
              <div className="flex items-baseline gap-1 mb-0.5">
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Brand:</span>
                {product.isExternal ? (
                  product.companyWebsite ? (
                    <a href={formatExternalUrl(product.companyWebsite)} target="_blank" rel="noopener noreferrer">
                      <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate">
                        {product.companyName || companyEntry?.name}
                      </span>
                    </a>
                  ) : (
                    <span className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
                      {product.companyName || companyEntry?.name}
                    </span>
                  )
                ) : (
                  <Link href={`/company/${product.companyId}`}>
                    <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate">
                      {companyEntry?.name}
                    </span>
                  </Link>
                )}
              </div>
              {companyEntry?.location && (
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="truncate">{companyEntry.location}</span>
                </div>
              )}
            </div>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2 cursor-default">{product.description}</p>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" sideOffset={2} avoidCollisions={true} collisionPadding={16} className="max-w-[300px] z-[9999]">
                <p className="text-xs">{product.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">{product.category}</span>
          </div>

          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-[11px] font-medium transition-colors text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(webUrl, '_blank'); }}>
                    Web{configWebLink ? ` (${selectedConfigs[product.id].name})` : ''}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" sideOffset={8} className="max-w-xs z-[9999]" collisionPadding={16}>
                  <p className="text-xs break-all">{effectiveWebLink ? effectiveWebLink : `${webSearchEngine.name} search (no direct link)`}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`text-[11px] font-medium transition-colors ${datasheetLink ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer' : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (datasheetLink) window.open(datasheetLink, '_blank'); }}
                    disabled={!datasheetLink}
                  >
                    {isPatent ? 'Patent PDF' : 'Datasheet'}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{datasheetLink ? (isPatent ? 'Open patent PDF' : 'Download product technical specifications PDF') : (isPatent ? 'No patent PDF available' : 'No datasheet available')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {hasDownloads && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors cursor-pointer">
                    Downloads <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
                  {effectiveModelPath && (
                    <DropdownMenuItem onSelect={() => window.open(effectiveModelPath, '_blank')} className="cursor-pointer">
                      <Package className="w-4 h-4 mr-2 text-purple-500" />
                      <span>3D Model (download)</span>
                    </DropdownMenuItem>
                  )}
                  {docs.map((docPath: string, docIndex: number) => (
                    <DropdownMenuItem key={docIndex} onSelect={() => window.open(docPath, '_blank')} className="cursor-pointer">
                      <FileText className="w-4 h-4 mr-2 text-green-500" />
                      <span className="truncate">{docPath.split('/').pop() || `Document ${docIndex + 1}`}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {effectiveModelPath && (
              <button
                type="button"
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview3D(product, effectiveModelPath, e.currentTarget.getBoundingClientRect()); }}
              >
                3D Preview
              </button>
            )}

            {onExplore && (
              <button
                type="button"
                className="text-[11px] font-medium transition-colors text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExplore(product.name, product.companyName || companyMap.get(product.companyId)?.name || '', { attributes: product.attributes, catalogPath: product.catalogPath, productWebLink: product.productWebLink, dbProductId: product.dbProductId }); }}
              >
                Explore
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-3 pt-0">
        <div className="flex items-center gap-2">
          {product.fitScore !== undefined && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border cursor-help ${product.fitScore >= STRONG_MATCH_THRESHOLD ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/50' : product.fitScore >= matchThreshold ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50'}`}>
                    <span className={`text-[9px] font-bold ${product.fitScore >= STRONG_MATCH_THRESHOLD ? 'text-green-700 dark:text-green-400' : product.fitScore >= matchThreshold ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                      Match {product.fitScore}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[280px]">
                  <p className="text-xs">{product.scoreReason || product.fitReason || 'Match score based on requirements match'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {product.isExternal ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-md cursor-help">
                    <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                    <span className="text-[9px] font-semibold text-red-700 dark:text-red-400">Unverified</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left"><p className="text-xs">Web search, Product is not verified by DeepFolder</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                    <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">DeepFolder Verified</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left"><p className="text-xs">This product is verified in the DeepFolder catalog</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <button onClick={(e) => onFavorite(e, product.id, product.name, product)}>
          <Heart className={cn("w-4 h-4 cursor-pointer transition-colors", favoriteProductIds.has(product.id) ? "text-red-500 fill-red-500" : "text-gray-400 hover:text-red-500")} />
        </button>
      </div>
    </div>
  );
}
