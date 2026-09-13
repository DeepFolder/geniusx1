import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
// import { Slider } from "@/components/ui/slider";
import { SlidersHorizontal, Building2, Package, MapPin, Users, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

interface SearchFiltersProps {
  filters: SearchFilters;
  updateFilters: (updates: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  searchResults: {
    companies: any[];
    products: any[];
  };
  searchQuery?: string;
}

export interface SearchFilters {
  sortBy: 'relevance' | 'name' | 'industry' | 'location' | 'employeeCount';
  sortOrder: 'asc' | 'desc';
  industries: string[];
  locations: string[];
  companySize: string[];
  productCategories: string[];
  hasModels: boolean;
  hasCatalogs: boolean;
  hasDatasheets: boolean;
}

export default function SearchFilters({ filters, updateFilters, clearFilters, searchResults, searchQuery = '' }: SearchFiltersProps) {
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  
  // Prevent scroll when any dropdown is open
  useScrollLock(industryDropdownOpen || locationDropdownOpen || categoryDropdownOpen);

  // Generate intelligent filter suggestions based on search query
  const generateIntelligentFilters = (query: string): string[] => {
    if (!query || query.length < 2) return [];
    
    const suggestions: string[] = [];
    const queryLower = query.toLowerCase().trim();
    
    console.log('AI Filter Debug - Query:', query, 'QueryLower:', queryLower);
    
    // Manufacturing & Industrial keywords
    if (queryLower.match(/(cnc|machining|manufacturing|production|factory|industrial)/)) {
      suggestions.push('CNC Machines', 'Manufacturing Equipment', 'Industrial Automation');
      console.log('AI Filter Debug - Manufacturing match found');
    }
    
    // AI & Technology keywords
    if (queryLower.match(/(ai|artificial|intelligence|smart|automated|iot|sensors)/)) {
      suggestions.push('AI & Automation', 'Smart Manufacturing', 'IoT Solutions');
      console.log('AI Filter Debug - AI/Tech match found');
    }
    
    // Robotics keywords
    if (queryLower.match(/(robot|robotic|automation|assembly|pick|place)/)) {
      suggestions.push('Robotics & Automation', 'Assembly Systems', 'Industrial Robots');
      console.log('AI Filter Debug - Robotics match found');
    }
    
    // Quality & Testing keywords
    if (queryLower.match(/(quality|testing|inspection|measurement|precision)/)) {
      suggestions.push('Quality Control', 'Measurement Equipment', 'Testing Solutions');
      console.log('AI Filter Debug - Quality match found');
    }
    
    // 3D Printing keywords
    if (queryLower.match(/(3d|printing|additive|metal|plastic|prototype)/)) {
      suggestions.push('3D Printing', 'Additive Manufacturing', 'Prototyping');
      console.log('AI Filter Debug - 3D Printing match found');
    }
    
    // Software & Systems keywords
    if (queryLower.match(/(software|system|erp|mes|analytics|data)/)) {
      suggestions.push('Manufacturing Software', 'Analytics', 'System Integration');
      console.log('AI Filter Debug - Software match found');
    }
    
    // Materials keywords
    if (queryLower.match(/(metal|steel|aluminum|plastic|composite|material)/)) {
      suggestions.push('Metal Processing', 'Material Handling', 'Composite Materials');
      console.log('AI Filter Debug - Materials match found');
    }
    
    // Energy & Sustainability keywords
    if (queryLower.match(/(energy|sustainable|green|efficient|renewable)/)) {
      suggestions.push('Energy Efficiency', 'Sustainable Manufacturing', 'Green Technology');
      console.log('AI Filter Debug - Energy match found');
    }
    
    // Additional common search terms with more specific suggestions
    if (queryLower.includes('machine') || queryLower.includes('equipment')) {
      suggestions.push('Industrial Equipment', 'Machinery', 'Automation Systems');
      console.log('AI Filter Debug - Machine/Equipment match found');
    }
    
    if (queryLower.includes('tool') || queryLower.includes('cutting')) {
      suggestions.push('Cutting Tools', 'Precision Tools', 'Tool Systems');
      console.log('AI Filter Debug - Tools match found');
    }
    
    if (queryLower.includes('part') || queryLower.includes('component')) {
      suggestions.push('Components', 'Parts Manufacturing', 'Custom Parts');
      console.log('AI Filter Debug - Parts match found');
    }
    
    // If no specific matches, suggest general industry filters based on search results context
    if (suggestions.length === 0 && query.length >= 2) {
      // Always show some intelligent suggestions based on current search results
      const availableIndustries = Array.from(new Set(searchResults.companies?.map(c => c.industry).filter(Boolean) || []));
      const availableCategories = Array.from(new Set(searchResults.products?.map(p => p.category).filter(Boolean) || []));
      
      if (availableIndustries.length > 0) {
        suggestions.push(...availableIndustries.slice(0, 2));
      }
      if (availableCategories.length > 0) {
        suggestions.push(...availableCategories.slice(0, 2));
      }
      
      // Fallback suggestions
      if (suggestions.length === 0) {
        suggestions.push('Manufacturing', 'Technology', 'Innovation');
      }
      console.log('AI Filter Debug - Fallback suggestions:', suggestions);
    }
    
    // Remove duplicates and limit to 4 suggestions
    const finalSuggestions = Array.from(new Set(suggestions)).slice(0, 4);
    console.log('AI Filter Debug - Final suggestions:', finalSuggestions);
    return finalSuggestions;
  };
  
  const intelligentFilters = generateIntelligentFilters(searchQuery);

  // Extract unique values from search results
  const industries = Array.from(new Set(searchResults.companies?.map(c => c.industry).filter(Boolean) || []));
  const locations = Array.from(new Set(searchResults.companies?.map(c => c.location).filter(Boolean) || []));
  const companySizes = Array.from(new Set(searchResults.companies?.map(c => c.employeeCount).filter(Boolean) || []));
  const productCategories = Array.from(new Set(searchResults.products?.map(p => p.category).filter(Boolean) || []));

  const activeFiltersCount = [
    ...filters.industries,
    ...filters.locations,
    ...filters.companySize,
    ...filters.productCategories,
    filters.hasModels ? 'models' : '',
    filters.hasCatalogs ? 'catalogs' : '',
  ].filter(Boolean).length;

  return (
    <div className="overflow-x-auto scrollbar-hide">
      {/* Single horizontal scrolling row - Optimized layout */}
      <div className="flex items-center space-x-2 px-1 py-2 min-w-max">
        {/* AI Filter Icon + Pills (merged into same row) */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
        </div>
        
        {/* AI recommended filter pills */}
        {intelligentFilters.length > 0 && intelligentFilters.map((filter) => {
          const isActive = filters.productCategories.includes(filter) || filters.industries.includes(filter);
          return (
            <Button
              key={filter}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "px-2 md:px-4 py-2 text-xs font-medium rounded-md border whitespace-nowrap flex-shrink-0",
                isActive 
                  ? "bg-blue-600 text-white border-transparent hover:bg-blue-700"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
              onClick={() => {
                if (isActive) {
                  updateFilters({ 
                    productCategories: filters.productCategories.filter(c => c !== filter),
                    industries: filters.industries.filter(i => i !== filter)
                  });
                } else {
                  if (industries.includes(filter)) {
                    updateFilters({ industries: [...filters.industries, filter] });
                  } else {
                    updateFilters({ productCategories: [...filters.productCategories, filter] });
                  }
                }
              }}
            >
              {filter}
            </Button>
          );
        })}

        {/* Standard filters (same line as AI filters) */}
        <Select
          value={filters.industries[0] || 'all'}
          onValueChange={(value) => {
            if (value && value !== 'all') {
              updateFilters({ industries: [value] });
            } else {
              updateFilters({ industries: [] });
            }
          }}
          onOpenChange={setIndustryDropdownOpen}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} align="start" className="bg-white dark:bg-gray-800 max-h-[300px] z-[9999]">
            <SelectItem value="all">All Industries</SelectItem>
            {industries.map((industry) => (
              <SelectItem key={industry} value={industry}>{industry}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.locations[0] || 'all'}
          onValueChange={(value) => {
            if (value && value !== 'all') {
              updateFilters({ locations: [value] });
            } else {
              updateFilters({ locations: [] });
            }
          }}
          onOpenChange={setLocationDropdownOpen}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} align="start" className="bg-white dark:bg-gray-800 max-h-[300px] z-[9999]">
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location} value={location}>{location}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.productCategories[0] || 'all'}
          onValueChange={(value) => {
            if (value && value !== 'all') {
              updateFilters({ productCategories: [value] });
            } else {
              updateFilters({ productCategories: [] });
            }
          }}
          onOpenChange={setCategoryDropdownOpen}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} align="start" className="bg-white dark:bg-gray-800 max-h-[300px] z-[9999]">
            <SelectItem value="all">All Categories</SelectItem>
            {productCategories.map((category) => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={filters.hasModels ? "default" : "outline"}
          size="sm"
          onClick={() => updateFilters({ hasModels: !filters.hasModels })}
          className={cn(
            "h-8 px-3 text-xs whitespace-nowrap",
            filters.hasModels 
              ? "bg-blue-600 text-white" 
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          )}
        >
          3D Models
        </Button>

        <Button
          variant={filters.hasCatalogs ? "default" : "outline"}
          size="sm"
          onClick={() => updateFilters({ hasCatalogs: !filters.hasCatalogs })}
          className={cn(
            "h-8 px-3 text-xs whitespace-nowrap",
            filters.hasCatalogs 
              ? "bg-blue-600 text-white" 
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          )}
        >
          Catalogs
        </Button>

        <Button
          variant={filters.hasDatasheets ? "default" : "outline"}
          size="sm"
          onClick={() => updateFilters({ hasDatasheets: !filters.hasDatasheets })}
          className={cn(
            "h-8 px-3 text-xs whitespace-nowrap",
            filters.hasDatasheets 
              ? "bg-blue-600 text-white" 
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          )}
        >
          Datasheets
        </Button>

        {/* Clear button */}
        {activeFiltersCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearFilters}
            className="h-8 px-3 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Clear ({activeFiltersCount})
          </Button>
        )}

        {/* Results count */}
        <div className="hidden lg:flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400 border-l border-gray-300 dark:border-gray-600 pl-3 ml-2">
          <div className="flex items-center space-x-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>{searchResults.companies?.length || 0}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Package className="w-3.5 h-3.5" />
            <span>{searchResults.products?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}