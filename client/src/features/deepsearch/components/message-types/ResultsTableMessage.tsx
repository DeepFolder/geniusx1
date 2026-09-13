import { useState } from "react";
import { Package, Loader2, CheckCircle2, XCircle, HelpCircle, AlertTriangle, BadgeCheck, Lightbulb, Settings2, Compass, SlidersHorizontal, Calculator, Building2, MapPin, Globe, Heart, Download, ChevronDown, ThumbsDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { cn, formatExternalUrl } from "@/lib/utils";
import { MaybeMath, UnitMath } from "@/components/chat/MathHelpers";
import { CalcCard } from "@/components/chat/CalcCard";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { EngineeringNotes } from "../EngineeringNotes";
import { ComparisonTableRows } from "../ComparisonTableRows";
import { Preview3DPortal } from "../Preview3DPortal";
import { STRONG_MATCH_THRESHOLD } from "../../constants";
import { normalizeSpecStatus, groupProductsByPartType } from "../../utils/productAdapters";
import { getMatchThreshold } from "../../utils/thresholds";
import type { AISearchMessage, Company, Product } from "../../types";

interface ResultsTableMessageProps {
  message: AISearchMessage;
  companyMap: Map<number, Company>;
  userFollows: { id: number; companyId: number }[];
  webSearchEngine: { name: string; colorClass: string };
  buildWebSearchUrl: (q: string) => string;
  onFollowCompany: (e: React.MouseEvent, companyId: number, companyName: string) => void;
  renderUserMessageContent: (content: string) => React.ReactNode;
  onRegenerateCalc?: (messageId: string, overrides: Record<string, string>) => void | Promise<void>;
  onExplore?: (productName: string, companyName: string, info?: { attributes?: import('../../types').ProductAttribute[]; catalogPath?: string; productWebLink?: string; dbProductId?: number }) => void;
  onExtendSearch?: () => void;
}

export function ResultsTableMessage({
  message,
  companyMap,
  userFollows,
  webSearchEngine,
  buildWebSearchUrl,
  onFollowCompany,
  renderUserMessageContent,
  onRegenerateCalc,
  onExplore,
  onExtendSearch,
}: ResultsTableMessageProps) {
  const [preview3DProduct, setPreview3DProduct] = useState<{ id: number; modelPath: string; name: string; buttonRect: DOMRect } | null>(null);
  const [dislikeActive, setDislikeActive] = useState(false);

  const regenerateProps = onRegenerateCalc
    ? {
        onRegenerate: (overrides: Record<string, string>) => onRegenerateCalc(message.id, overrides),
        isRegenerating: message.isRegeneratingCalc,
        regenerateError: message.regenerateCalcError,
        calculationMode: message.calculationMode,
        referenceProductName: message.searchResults?.products?.[0]?.name,
      }
    : {};
  // Trust backend tier filtering as the single source of truth for what to show.
  // Match badge colors (green/amber/red vs matchThreshold) communicate quality on a row-by-row
  // basis, so we should not also hide candidates with a stricter client-side threshold.
  const matchThreshold = getMatchThreshold(message.requirements);
  const sortedFilteredProducts = [...message.searchResults!.products]
    .filter(p => (p.fitScore ?? 0) > 0)
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));

  const hasComparisonData = !!(message.comparisonTable?.products.length && message.comparisonTable.products.length >= 1 && message.comparisonTable.rows.length >= 1);

  const isSizeThenSearch = message.calculationMode === 'size_then_search';
  const hasCalcSection = !!message.calculationSection;

  const calcCardBlock = message.calculationSection ? (
    <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Step 1 — Calculation</span>
      </div>
      <CalcCard calculationSection={message.calculationSection} {...regenerateProps} />
    </div>
  ) : null;

  return (
    <div>
      {isSizeThenSearch && calcCardBlock}
      <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        <Package className="w-3.5 h-3.5 mr-2" />
        {hasCalcSection
          ? isSizeThenSearch
            ? `Step 2 — Search Results (${sortedFilteredProducts.length})`
            : `Step 1 — Search Results (${sortedFilteredProducts.length})`
          : `Search Results (${sortedFilteredProducts.length})`}
        {message.isStreaming && <Loader2 className="w-3 h-3 ml-2 animate-spin text-purple-500" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th className="text-left py-1.5 pr-2 font-semibold text-gray-600 dark:text-gray-300 w-6">#</th>
              <th className="text-left py-1.5 pr-2 font-semibold text-gray-600 dark:text-gray-300">Product</th>
              <th className="text-left py-1.5 pr-2 font-semibold text-gray-600 dark:text-gray-300 hidden sm:table-cell max-w-[150px] truncate">Brand</th>
              <th className="text-left py-1.5 pr-2 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell whitespace-nowrap">Key Specs</th>
              <th className="text-right py-1.5 font-semibold text-gray-600 dark:text-gray-300 w-16 whitespace-nowrap">Match</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const partTypeGroups = groupProductsByPartType(sortedFilteredProducts);
              const showHeaders = partTypeGroups.length > 1;
              let rowIndex = 0;
              return partTypeGroups.flatMap((grp) => {
                const headerNode = showHeaders ? (
                  <tr key={`hdr-${grp.partType ?? 'other'}`} className="bg-gray-50 dark:bg-gray-800/60">
                    <td colSpan={5} className="py-1.5 pr-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      {grp.partType ? `${grp.partType} (${grp.products.length})` : `Other (${grp.products.length})`}
                    </td>
                  </tr>
                ) : null;

                const rowNodes = grp.products.map((product) => {
                  const i = rowIndex++;
                  const score = product.fitScore ?? 0;
                  const scoreColor = score >= STRONG_MATCH_THRESHOLD
                    ? 'text-green-600 dark:text-green-400'
                    : score >= matchThreshold
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400';
                  const scoreBg = score >= STRONG_MATCH_THRESHOLD
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : score >= matchThreshold
                      ? 'bg-amber-100 dark:bg-amber-900/30'
                      : 'bg-red-100 dark:bg-red-900/30';
                  const companyName = product.companyName || companyMap.get(product.companyId)?.name || '';
                  const hasVerifiedLink = product.isExternal && product.productWebLink && (product.linkStatus === 'verified' || product.linkStatus === 'recovered');
                  const hasDirectLink = product.isExternal && (product.productWebLink || product.catalogPath);
                  const refLink = product.isExternal && hasDirectLink ? (product.productWebLink || product.catalogPath!) : '';
                  const googleSearchUrl = buildWebSearchUrl(product.name + ' ' + companyName);
                  const topAttrs = (product.attributes || []).slice(0, 4);

                  return (
                    <tr key={product.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors result-row-reveal" style={{ animationDelay: `${i * 120}ms` }}>
                      <td className="py-2 pr-2 text-gray-400 align-top">{i + 1}</td>
                      <td className="py-2 pr-2 align-top">
                        <div className="inline-flex items-center gap-1">
                          {product.isExternal ? (
                            hasVerifiedLink ? (
                              <a href={formatExternalUrl(refLink)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                                {product.name}
                              </a>
                            ) : (
                              <span className="font-medium">{product.name}</span>
                            )
                          ) : (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {product.productWebLink ? (
                                    <a href={formatExternalUrl(product.productWebLink)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                                      {product.name}
                                      <BadgeCheck className="w-3 h-3 text-green-500 flex-shrink-0" />
                                    </a>
                                  ) : product.id && product.id < 200000 ? (
                                    <Link href={`/product/${product.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                                      {product.name}
                                      <BadgeCheck className="w-3 h-3 text-green-500 flex-shrink-0" />
                                    </Link>
                                  ) : (
                                    <span className="font-medium text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
                                      {product.name}
                                      <BadgeCheck className="w-3 h-3 text-green-500 flex-shrink-0" />
                                    </span>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-md text-[10px] z-[9999]">
                                  Verified product from the DeepFolder database — click to view full profile
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        {product.description && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-4 leading-tight">
                            {product.description.length > 300 ? product.description.slice(0, 300) + '...' : product.description}
                          </div>
                        )}
                        <div className="text-[10px] sm:hidden mt-0.5">
                          {product.isExternal && product.companyWebsite ? (
                            <a href={formatExternalUrl(product.companyWebsite)} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{companyName}</a>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">{companyName}</span>
                          )}
                        </div>
                        {topAttrs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 md:hidden">
                            {topAttrs.map((attr, j) => {
                              const specStatus = normalizeSpecStatus(attr.meets_requirement);
                              const defaultTip = specStatus === 'meets' ? 'Meets your requirement.' : specStatus === 'oversized' ? 'Oversized — exceeds requirement by >30%' : specStatus === 'undersized' ? 'Below your requirement.' : 'Informational spec — not part of your requirements';
                              const tip = (attr.note && attr.note.trim()) || defaultTip;
                              const icon = specStatus === 'meets' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500 flex-shrink-0" /> : specStatus === 'oversized' ? <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" /> : specStatus === 'undersized' ? <XCircle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" /> : <HelpCircle className="w-2.5 h-2.5 text-purple-500 flex-shrink-0" />;
                              return (
                                <span key={j} className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><span>{icon}</span></TooltipTrigger><TooltipContent side="top" className="max-w-[280px]"><p className="text-xs">{tip}</p></TooltipContent></Tooltip></TooltipProvider>
                                  <MaybeMath content={attr.label} />: <span><MaybeMath content={attr.value} /></span>{attr.unit ? <> <UnitMath unit={attr.unit} /></> : null}
                                  {j < topAttrs.length - 1 && <span className="text-gray-300 dark:text-gray-600 ml-0.5">|</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          {(() => {
                            const webLink = product.productWebLink;
                            if (webLink) {
                              return (
                                <button type="button" className="text-[11px] font-medium transition-colors text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(formatExternalUrl(webLink), '_blank'); }}>
                                  Web
                                </button>
                              );
                            }
                            if (!product.isExternal && product.id && product.id < 200000) {
                              return (
                                <Link href={`/product/${product.id}`} className="text-[11px] font-medium transition-colors text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
                                  DeepFolder
                                </Link>
                              );
                            }
                            return (
                              <a href={googleSearchUrl} target="_blank" rel="noopener noreferrer" className={`text-[11px] font-medium transition-colors ${webSearchEngine.colorClass} hover:underline`}>
                                {webSearchEngine.name}
                              </a>
                            );
                          })()}
                          {(() => {
                            const datasheetLink = product.catalogPath;
                            const modelLink = product.modelPath;
                            const hasDatasheet = !!datasheetLink;
                            const hasModel = !!modelLink;
                            const isPatent = product.partType?.toLowerCase() === 'patent';
                            const datasheetLabel = isPatent ? 'Patent PDF' : 'Datasheet';

                            return (
                              <>
                                {hasDatasheet && (
                                  <button type="button" className="text-[11px] font-medium transition-colors text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(datasheetLink!, '_blank'); }}>
                                    {datasheetLabel}
                                  </button>
                                )}
                                {hasModel && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button type="button" className="inline-flex items-center gap-0.5 text-[11px] font-medium transition-colors text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer">
                                        Downloads <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="min-w-[140px] z-[9999]">
                                      <DropdownMenuItem className="text-xs cursor-pointer gap-2" onSelect={() => { window.open(modelLink!, '_blank'); }}>
                                        <Download className="w-3.5 h-3.5 text-purple-500" />
                                        3D Model
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </>
                            );
                          })()}
                          {product.modelPath && (
                            <button
                              type="button"
                              className="text-[11px] font-medium transition-colors text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreview3DProduct({ id: product.id, modelPath: product.modelPath!, name: product.name, buttonRect: e.currentTarget.getBoundingClientRect() }); }}
                            >
                              3D Preview
                            </button>
                          )}
                          {onExplore && (
                            <button
                              type="button"
                              className="text-[11px] font-medium transition-colors text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExplore(product.name, companyName, { attributes: product.attributes, catalogPath: product.catalogPath, productWebLink: product.productWebLink, dbProductId: product.dbProductId }); }}
                            >
                              Explore
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-2 hidden sm:table-cell align-top">
                        <div className="flex flex-col gap-0.5">
                          {product.isExternal && product.companyWebsite ? (
                            <a href={formatExternalUrl(product.companyWebsite)} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-xs">{companyName}</a>
                          ) : product.companyId ? (
                            <Link href={`/company/${product.companyId}`} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">{companyName}</Link>
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400 text-xs">{companyName}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-2 hidden md:table-cell align-top">
                        {topAttrs.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {topAttrs.map((attr, j) => {
                              const specStatus = normalizeSpecStatus(attr.meets_requirement);
                              const defaultTip = specStatus === 'meets' ? 'Meets your requirement.' : specStatus === 'oversized' ? 'Oversized — exceeds requirement by >30%' : specStatus === 'undersized' ? 'Below your requirement.' : 'Informational spec — not part of your requirements';
                              const tip = (attr.note && attr.note.trim()) || defaultTip;
                              const icon = specStatus === 'meets' ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" /> : specStatus === 'oversized' ? <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" /> : specStatus === 'undersized' ? <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" /> : <HelpCircle className="w-3 h-3 text-purple-500 flex-shrink-0" />;
                              return (
                                <TooltipProvider key={j} delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex items-center gap-1 text-xs whitespace-nowrap cursor-help">
                                        <span>{icon}</span>
                                        <span className={`${specStatus === 'oversized' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}><MaybeMath content={attr.label} />:</span>
                                        <span className={`max-w-[180px] truncate ${specStatus === 'oversized' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}><MaybeMath content={attr.value} />{attr.unit ? <> <UnitMath unit={attr.unit} /></> : null}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[280px]"><p className="text-xs">{tip}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right align-top">
                        <TooltipProvider><Tooltip><TooltipTrigger asChild>
                          <span className={cn("px-2 py-0.5 rounded font-bold text-[11px] cursor-help", scoreBg, scoreColor)}>{score}%</span>
                        </TooltipTrigger><TooltipContent side="left" className="max-w-[320px]"><p className="text-xs">{product.scoreReason || product.fitReason || 'Match score based on requirements match'}</p></TooltipContent></Tooltip></TooltipProvider>
                      </td>
                    </tr>
                  );
                });
                return headerNode ? [headerNode, ...rowNodes] : rowNodes;
              });
            })()}
          </tbody>
        </table>
      </div>

      {(() => {
        const summarySrc = message.bestFit;
        const recommendationSrc = message.alternativeSuggestion || message.recommendation;
        const hasAny = summarySrc || recommendationSrc || message.searchGuidance;
        if (!hasAny) return null;
        return (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 rec-section-reveal space-y-3">
            {summarySrc && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">AI Summary</span>
                </div>
                <EngineeringNotes content={summarySrc} skipAnimation={message.isFromHistory} />
              </div>
            )}
            {recommendationSrc && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">AI Recommendation</span>
                </div>
                <EngineeringNotes content={recommendationSrc} skipAnimation={message.isFromHistory} />
              </div>
            )}
            {recommendationSrc && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                AI-generated content may contain errors. Verify important information independently.
              </p>
            )}
            {message.searchGuidance && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Refine Your Search</span>
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  {message.searchGuidance.split(/\s*[|;\n]\s*/).filter(Boolean).map((suggestion, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/30">
                      {suggestion.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {message.calculationSection && !isSizeThenSearch && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Step 2 — Calculation</span>
          </div>
          <CalcCard calculationSection={message.calculationSection} {...regenerateProps} />
        </div>
      )}
      {message.calculationNote && !message.calculationSection && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">AI Analysis</span>
            </div>
            <EngineeringNotes content={message.calculationNote!} skipAnimation={message.isFromHistory} />
          </div>
        </div>
      )}
      {hasComparisonData && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-2" />
            Comparison ({message.comparisonTable!.products.length} products)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                  <th className="text-left py-1.5 pr-4 font-semibold text-gray-600 dark:text-gray-300 min-w-[120px]">Parameter</th>
                  {message.comparisonTable!.products.map((product, pi) => (
                    <th key={pi} className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300 min-w-[100px]">{product}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonTableRows data={message.comparisonTable!} rowAnimDelayMs={60} />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!(message.searchResults?.companies?.length > 0 || message.searchResults?.products?.length > 0) && (
        <div className="mt-6 space-y-5 pt-4 border-t border-gray-200/50 dark:border-gray-700/50 lg:hidden">
          {message.searchResults.companies && message.searchResults.companies.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5 mr-2" />
                Companies ({message.searchResults.companies.length})
              </div>
              <div className="grid grid-cols-1 gap-3">
                {message.searchResults.companies.slice(0, 4).map((company: Company, index: number) => {
                  const isFollowing = userFollows.some(follow => follow.companyId === company.id);
                  return (
                    <div key={company.id} className="bg-white dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all group animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out" style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}>
                      <div className="p-2.5 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-lg flex-shrink-0 relative overflow-hidden">
                            {company.logoPath ? (
                              <img src={company.logoPath} alt={company.name} className="w-full h-full object-contain bg-white p-1" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                <Building2 className="w-5 h-5 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">{company.name}</h4>
                            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                              <span className="truncate">{company.location}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-600 dark:text-gray-400 rounded">{company.industry}</span>
                            </div>
                          </div>
                        </div>
                        {company.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{company.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 px-2.5 pb-2.5">
                        {company.website && (
                          <a href={formatExternalUrl(company.website)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors text-[10px] font-medium">
                            <Globe className="w-3 h-3" />
                            Web
                          </a>
                        )}
                        <button onClick={(e) => onFollowCompany(e, company.id, company.name)} className={cn("flex items-center gap-1 px-2 py-1 rounded-md border transition-colors text-[10px] font-medium", isFollowing ? "border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400")}>
                          <Heart className={cn("w-3 h-3", isFollowing && "fill-current")} />
                          {isFollowing ? "Following" : "Follow"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {!message.isStreaming && onExtendSearch && (
        <div className="flex justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (dislikeActive) return;
                    setDislikeActive(true);
                    onExtendSearch();
                    setTimeout(() => setDislikeActive(false), 1500);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    dislikeActive
                      ? "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500"
                      : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-300"
                  )}
                >
                  <ThumbsDown className="w-3 h-3" />
                  Extend search
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-xs">
                Results not helpful? Re-run with broader criteria and alternative sources.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <Preview3DPortal
        preview3DProduct={preview3DProduct}
        onClose={() => setPreview3DProduct(null)}
      />
    </div>
  );
}
