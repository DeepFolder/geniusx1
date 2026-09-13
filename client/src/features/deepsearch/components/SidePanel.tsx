import { Package, Building2, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { groupProductsByPartType } from "../utils/productAdapters";
import { getMatchThreshold } from "../utils/thresholds";
import { ProductCard } from "./ProductCard";
import { CompanyCard } from "./CompanyCard";
import type { Company, Product } from "../types";

interface ProductGroup {
  queryLabel: string;
  messageId: string;
  products: Product[];
  matchThreshold: number;
}

interface SidePanelProps {
  isPanelOpen: boolean;
  isProductsCollapsed: boolean;
  setIsProductsCollapsed: (v: boolean) => void;
  isCompaniesCollapsed: boolean;
  setIsCompaniesCollapsed: (v: boolean) => void;
  collapsedSearchGroups: Set<string>;
  setCollapsedSearchGroups: (fn: (prev: Set<string>) => Set<string>) => void;
  groupedProducts: ProductGroup[];
  allFilteredProducts: Product[];
  allAccumulatedCompanies: Company[];
  companyMap: Map<number, Company>;
  selectedConfigs: Record<number, any>;
  setSelectedConfigs: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  favoriteProductIds: Set<number>;
  userFollows: { id: number; companyId: number }[];
  webSearchEngine: { name: string; colorClass: string };
  buildWebSearchUrl: (q: string) => string;
  onDismissProduct: (e: React.MouseEvent, productId: number) => void;
  onDismissCompany: (e: React.MouseEvent, companyId: number) => void;
  onFavoriteProduct: (e: React.MouseEvent, productId: number, productName: string, product?: Product) => void;
  onFollowCompany: (e: React.MouseEvent, companyId: number, companyName: string) => void;
  onPreview3D: (product: Product, modelPath: string, buttonRect: DOMRect) => void;
  onExplore?: (productName: string, companyName: string, info?: { attributes?: { label: string; value: string; unit?: string }[]; catalogPath?: string; productWebLink?: string }) => void;
  onClose?: () => void;
}

export function SidePanel({
  isPanelOpen,
  isProductsCollapsed,
  setIsProductsCollapsed,
  isCompaniesCollapsed,
  setIsCompaniesCollapsed,
  collapsedSearchGroups,
  setCollapsedSearchGroups,
  groupedProducts,
  allFilteredProducts,
  allAccumulatedCompanies,
  companyMap,
  selectedConfigs,
  setSelectedConfigs,
  favoriteProductIds,
  userFollows,
  webSearchEngine,
  buildWebSearchUrl,
  onDismissProduct,
  onDismissCompany,
  onFavoriteProduct,
  onFollowCompany,
  onPreview3D,
  onExplore,
  onClose,
}: SidePanelProps) {
  const panelClass = isPanelOpen
    ? "flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 opacity-100 overflow-hidden fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:w-2/5 lg:bg-gray-50/50 lg:dark:bg-gray-900/50"
    : "hidden flex-col border-l border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 w-0 opacity-0 border-l-0 overflow-hidden";

  return (
    <div className={`${panelClass} transition-all duration-500`}>
      {onClose && (
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Results</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-8">
        {groupedProducts.length > 0 && (
          <div>
            <button
              onClick={() => setIsProductsCollapsed(!isProductsCollapsed)}
              className="w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center">
                <Package className="w-3.5 h-3.5 mr-2" />
                Products ({allFilteredProducts.length})
              </div>
              {isProductsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            {!isProductsCollapsed && (
              <div className="space-y-3">
                {groupedProducts.map((group) => {
                  const isGroupCollapsed = collapsedSearchGroups.has(group.messageId);
                  const matchThreshold = getMatchThreshold(undefined);
                  return (
                    <div key={group.messageId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setCollapsedSearchGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(group.messageId)) next.delete(group.messageId);
                          else next.add(group.messageId);
                          return next;
                        })}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Search className="w-3 h-3 flex-shrink-0 text-gray-400" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{group.queryLabel}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">({group.products.length})</span>
                        </div>
                        {isGroupCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                      </button>

                      {!isGroupCollapsed && (
                        <div className="grid grid-cols-1 gap-3 p-3">
                          {(() => {
                            const subGroups = groupProductsByPartType(group.products);
                            const showSubHeaders = subGroups.length > 1;
                            let cardIndex = 0;
                            return subGroups.flatMap((sg) => {
                              const header = showSubHeaders ? (
                                <div key={`subhdr-${group.messageId}-${sg.partType ?? 'other'}`} className="col-span-full flex items-center gap-2 mt-1 first:mt-0">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{sg.partType ?? 'Other'}</span>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500">({sg.products.length})</span>
                                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                                </div>
                              ) : null;
                              const cards = sg.products.map((product: Product) => {
                                const index = cardIndex++;
                                return (
                                  <ProductCard
                                    key={product.id}
                                    product={product}
                                    index={index}
                                    matchThreshold={matchThreshold}
                                    companyMap={companyMap}
                                    selectedConfigs={selectedConfigs}
                                    setSelectedConfigs={setSelectedConfigs}
                                    favoriteProductIds={favoriteProductIds}
                                    webSearchEngine={webSearchEngine}
                                    buildWebSearchUrl={buildWebSearchUrl}
                                    onDismiss={onDismissProduct}
                                    onFavorite={onFavoriteProduct}
                                    onPreview3D={onPreview3D}
                                    onExplore={onExplore}
                                  />
                                );
                              });
                              return header ? [header, ...cards] : cards;
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {allAccumulatedCompanies.length > 0 && (
          <div>
            <button
              onClick={() => setIsCompaniesCollapsed(!isCompaniesCollapsed)}
              className="w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center">
                <Building2 className="w-3.5 h-3.5 mr-2" />
                Companies ({allAccumulatedCompanies.length})
              </div>
              {isCompaniesCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            {!isCompaniesCollapsed && (
              <div className="grid grid-cols-1 gap-3">
                {allAccumulatedCompanies.map((company: Company, index: number) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    index={index}
                    isFollowing={userFollows.some(f => f.companyId === company.id)}
                    onDismiss={onDismissCompany}
                    onFollow={onFollowCompany}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
