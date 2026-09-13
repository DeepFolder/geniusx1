import { SearchFilters } from "@/components/search/search-filters";

export function applySearchFilters(
  searchResults: { companies: any[]; products: any[] },
  filters: SearchFilters
): { companies: any[]; products: any[] } {
  let { companies, products } = searchResults;

  // Apply company filters
  if (filters.industries.length > 0) {
    companies = companies.filter(company => 
      filters.industries.includes(company.industry)
    );
  }

  if (filters.locations.length > 0) {
    companies = companies.filter(company => 
      filters.locations.some(location => 
        company.location?.includes(location)
      )
    );
  }

  if (filters.companySize.length > 0) {
    companies = companies.filter(company => 
      filters.companySize.includes(company.employeeCount)
    );
  }

  // Apply product filters
  if (filters.productCategories.length > 0) {
    products = products.filter(product => 
      filters.productCategories.includes(product.category)
    );
  }

  if (filters.hasModels) {
    products = products.filter(product => product.modelPath);
  }

  if (filters.hasCatalogs) {
    products = products.filter(product => product.catalogPath);
  }

  if (filters.hasDatasheets) {
    products = products.filter(product => product.datasheetPath);
  }

  // Filter companies based on product features
  // Only show companies that have products matching the selected filters
  if (filters.hasModels || filters.hasCatalogs || filters.hasDatasheets) {
    const companiesWithMatchingProducts = new Set<number>();
    
    products.forEach(product => {
      companiesWithMatchingProducts.add(product.companyId);
    });
    
    companies = companies.filter(company => 
      companiesWithMatchingProducts.has(company.id)
    );
  }

  // Apply sorting
  const sortFunction = getSortFunction(filters.sortBy, filters.sortOrder);
  companies = [...companies].sort(sortFunction);
  products = [...products].sort(sortFunction);

  return { companies, products };
}

function getSortFunction(sortBy: string, sortOrder: 'asc' | 'desc') {
  const direction = sortOrder === 'asc' ? 1 : -1;

  return (a: any, b: any) => {
    let aValue: any;
    let bValue: any;

    switch (sortBy) {
      case 'name':
        aValue = a.name?.toLowerCase() || '';
        bValue = b.name?.toLowerCase() || '';
        break;
      case 'industry':
        aValue = a.industry?.toLowerCase() || '';
        bValue = b.industry?.toLowerCase() || '';
        break;
      case 'location':
        aValue = a.location?.toLowerCase() || '';
        bValue = b.location?.toLowerCase() || '';
        break;
      case 'employeeCount':
        // Convert employee count to numeric for sorting
        aValue = getEmployeeCountNumeric(a.employeeCount);
        bValue = getEmployeeCountNumeric(b.employeeCount);
        break;
      default: // relevance
        // For relevance, maintain original order
        return 0;
    }

    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return 0;
  };
}

function getEmployeeCountNumeric(employeeCount: string | undefined): number {
  if (!employeeCount) return 0;
  
  const ranges: Record<string, number> = {
    '1-10': 5,
    '11-50': 30,
    '51-100': 75,
    '101-200': 150,
    '201-500': 350,
    '501-1000': 750,
    '1000+': 2000,
    '500-1000': 750,
  };

  return ranges[employeeCount] || 0;
}

export function calculateSearchRelevance(
  item: any,
  searchQuery: string
): number {
  if (!searchQuery) return 0;

  const query = searchQuery.toLowerCase();
  let score = 0;

  // Name match (highest weight)
  if (item.name?.toLowerCase().includes(query)) {
    score += 10;
    if (item.name?.toLowerCase().startsWith(query)) {
      score += 5; // Bonus for prefix match
    }
  }

  // Industry/Category match
  if (item.industry?.toLowerCase().includes(query) || 
      item.category?.toLowerCase().includes(query)) {
    score += 5;
  }

  // Description match
  if (item.description?.toLowerCase().includes(query)) {
    score += 3;
  }

  // Location match
  if (item.location?.toLowerCase().includes(query)) {
    score += 2;
  }

  // Partial word matches
  const queryWords = query.split(/\s+/);
  queryWords.forEach(word => {
    if (word.length > 2) {
      const text = `${item.name || ''} ${item.description || ''} ${item.industry || ''} ${item.category || ''}`.toLowerCase();
      if (text.includes(word)) {
        score += 1;
      }
    }
  });

  return score;
}

export function sortByRelevance(
  items: any[],
  searchQuery: string
): any[] {
  return items
    .map(item => ({
      ...item,
      _relevanceScore: calculateSearchRelevance(item, searchQuery)
    }))
    .sort((a, b) => b._relevanceScore - a._relevanceScore)
    .map(({ _relevanceScore, ...item }) => item);
}