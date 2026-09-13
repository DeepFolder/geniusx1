import { useMemo, useState } from "react";
import { BarChart3, PieChart, TrendingUp, Building2, Package, Globe, Users, Factory, ChevronDown, ChevronUp } from "lucide-react";

interface SearchAnalyticsProps {
  searchResults: {
    companies: any[];
    products: any[];
  };
  searchQuery: string;
}

export default function SearchAnalytics({ searchResults, searchQuery }: SearchAnalyticsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const analytics = useMemo(() => {
    const companies = searchResults.companies || [];
    const products = searchResults.products || [];

    // Industry distribution
    const industryCount = companies.reduce((acc, company) => {
      const industry = company.industry || 'Other';
      acc[industry] = (acc[industry] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Location distribution
    const locationCount = companies.reduce((acc, company) => {
      const location = company.location?.split(',')[0] || 'Unknown';
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Product category distribution
    const categoryCount = products.reduce((acc, product) => {
      const category = product.category || 'Other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Company size distribution
    const sizeCount = companies.reduce((acc, company) => {
      const size = company.employeeCount || 'Not specified';
      acc[size] = (acc[size] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalResults: companies.length + products.length,
      companiesCount: companies.length,
      productsCount: products.length,
      topIndustries: Object.entries(industryCount)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5),
      topLocations: Object.entries(locationCount)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5),
      topCategories: Object.entries(categoryCount)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5),
      companySizes: Object.entries(sizeCount)
        .sort(([, a], [, b]) => (b as number) - (a as number)),
      hasModels: products.filter(p => p.modelPath).length,
      hasCatalogs: products.filter(p => p.catalogPath).length,
    };
  }, [searchResults]);

  if (analytics.totalResults === 0) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-900 dark:to-slate-900 rounded-xl mb-6 border border-blue-200/30 dark:border-gray-600/50 shadow-sm dark:shadow-lg">
      {/* Collapsed Header - Always Visible */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-gray-800/50 transition-colors rounded-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Search Analytics
            </h3>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {analytics.companiesCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Companies</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                {analytics.productsCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Products</div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isExpanded ? 'Hide Details' : 'Show Details'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content - Only Visible When Expanded */}
      {isExpanded && (
        <div className="px-6 pb-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analysis of {analytics.totalResults} results for "{searchQuery}"
            </p>
          </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Top Industries */}
        {analytics.topIndustries.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200/50 dark:border-gray-600/60 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <Factory className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
              Top Industries
            </h4>
            <div className="space-y-2">
              {analytics.topIndustries.map(([industry, count]) => (
                <div key={industry} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {industry}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 dark:bg-blue-400 h-1.5 rounded-full"
                        style={{
                          width: `${((count as number) / Math.max(...analytics.topIndustries.map(([, c]) => c as number))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white w-4">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Locations */}
        {analytics.topLocations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200/50 dark:border-gray-600/60 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <Globe className="w-4 h-4 mr-2 text-green-600 dark:text-green-400" />
              Top Locations
            </h4>
            <div className="space-y-2">
              {analytics.topLocations.map(([location, count]) => (
                <div key={location} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {location}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-green-500 dark:bg-green-400 h-1.5 rounded-full"
                        style={{
                          width: `${((count as number) / Math.max(...analytics.topLocations.map(([, c]) => c as number))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white w-4">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Categories */}
        {analytics.topCategories.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200/50 dark:border-gray-600/60 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <Package className="w-4 h-4 mr-2 text-purple-600 dark:text-purple-400" />
              Categories
            </h4>
            <div className="space-y-2">
              {analytics.topCategories.map(([category, count]) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {category}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-purple-500 dark:bg-purple-400 h-1.5 rounded-full"
                        style={{
                          width: `${((count as number) / Math.max(...analytics.topCategories.map(([, c]) => c as number))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white w-4">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Company Sizes */}
        {analytics.companySizes.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200/50 dark:border-gray-600/60 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <Users className="w-4 h-4 mr-2 text-orange-600 dark:text-orange-400" />
              Company Sizes
            </h4>
            <div className="space-y-2">
              {analytics.companySizes.map(([size, count]) => (
                <div key={size} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {size}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-orange-500 dark:bg-orange-400 h-1.5 rounded-full"
                        style={{
                          width: `${((count as number) / Math.max(...analytics.companySizes.map(([, c]) => c as number))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white w-4">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

          {/* Product Assets Summary */}
          {analytics.productsCount > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-600/50">
              <div className="flex items-center justify-center space-x-8">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {analytics.hasModels} products with 3D models
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 dark:bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {analytics.hasCatalogs} products with catalogs
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}