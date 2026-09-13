import { useState, useMemo } from "react";
import type { AISearchMessage, Company, Product } from "../types";
import { getMatchThreshold } from "../utils/thresholds";

interface ProductGroup {
  queryLabel: string;
  messageId: string;
  products: Product[];
  matchThreshold: number;
}

interface UseProductPanelResult {
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  isProductsCollapsed: boolean;
  setIsProductsCollapsed: (v: boolean) => void;
  isCompaniesCollapsed: boolean;
  setIsCompaniesCollapsed: (v: boolean) => void;
  collapsedSearchGroups: Set<string>;
  setCollapsedSearchGroups: (s: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  dismissedProductIds: Set<number>;
  setDismissedProductIds: (s: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  dismissedCompanyIds: Set<number>;
  setDismissedCompanyIds: (s: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  groupedProducts: ProductGroup[];
  allFilteredProducts: Product[];
  allAccumulatedCompanies: Company[];
  hasResultsPanel: boolean;
}

export function useProductPanel(aiMessages: AISearchMessage[]): UseProductPanelResult {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isProductsCollapsed, setIsProductsCollapsed] = useState(false);
  const [isCompaniesCollapsed, setIsCompaniesCollapsed] = useState(false);
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(new Set());
  const [dismissedProductIds, setDismissedProductIds] = useState<Set<number>>(new Set());
  const [dismissedCompanyIds, setDismissedCompanyIds] = useState<Set<number>>(new Set());

  const allAccumulatedCompanies = useMemo(() => {
    const companiesMap = new Map<number, Company>();
    aiMessages.forEach(msg => {
      if (msg.searchResults) {
        msg.searchResults.companies?.forEach((c: Company) => {
          if (!dismissedCompanyIds.has(c.id)) {
            companiesMap.set(c.id, c);
          }
        });
      }
    });
    return Array.from(companiesMap.values());
  }, [aiMessages, dismissedCompanyIds]);

  const groupedProducts = useMemo(() => {
    const groups: ProductGroup[] = [];
    for (let i = 0; i < aiMessages.length; i++) {
      const msg = aiMessages[i];
      if (!msg.searchResults?.products?.length) continue;
      const allProducts = msg.searchResults.products.filter(
        (p: Product) => !dismissedProductIds.has(p.id) && (p.fitScore ?? 0) > 0
      );
      const threshold = getMatchThreshold(msg.requirements);
      const hasQuality = allProducts.some(p => (p.fitScore ?? 0) >= threshold);
      const products = hasQuality
        ? allProducts.filter(p => (p.fitScore ?? 0) >= threshold)
        : allProducts;
      if (products.length === 0) continue;
      let queryLabel = 'Search results';
      for (let j = i - 1; j >= 0; j--) {
        if (aiMessages[j].isUser && aiMessages[j].content) {
          const q = aiMessages[j].content;
          queryLabel = q.length > 40 ? q.slice(0, 40) + '...' : q;
          break;
        }
      }
      groups.push({ queryLabel, messageId: msg.id, products, matchThreshold: threshold });
    }
    return groups;
  }, [aiMessages, dismissedProductIds]);

  const allFilteredProducts = groupedProducts.flatMap(g => g.products);
  const hasResultsPanel = allFilteredProducts.length > 0 || allAccumulatedCompanies.length > 0;

  return {
    isPanelOpen, setIsPanelOpen,
    isProductsCollapsed, setIsProductsCollapsed,
    isCompaniesCollapsed, setIsCompaniesCollapsed,
    collapsedSearchGroups, setCollapsedSearchGroups,
    dismissedProductIds, setDismissedProductIds,
    dismissedCompanyIds, setDismissedCompanyIds,
    groupedProducts,
    allFilteredProducts,
    allAccumulatedCompanies,
    hasResultsPanel,
  };
}
