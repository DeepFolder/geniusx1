import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Heart, Package, Building2, ArrowLeft, MapPin, BadgeCheck, Gauge, ChevronDown, Box, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatExternalUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import FavoriteButton from "@/components/favorite-button";

interface Company {
  id: number;
  name: string;
  industry: string;
  description: string;
  location: string;
  colorTheme: string;
  logoPath?: string;
  website?: string;
}

interface Product {
  id: number;
  name: string;
  category: string;
  description: string;
  companyId: number;
  modelPath?: string;
  catalogPath?: string;
  imagePath?: string;
  documentPaths?: string[];
  productWebLink?: string;
  fitScore?: number;
  fitReason?: string;
  company?: Company;
  companyName?: string;
  companyWebsite?: string;
  isExternal?: boolean;
}

const productGradients = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-yellow-500 to-amber-600',
  'from-indigo-500 to-purple-600',
];

export default function FavoritesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'products' | 'companies'>('products');

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/user/favorite-products"],
    enabled: !!user,
  });

  const { data: favoriteCompanies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/user/following"],
    enabled: !!user,
  });

  const { data: allCompanies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: !!user && products.length > 0,
  });

  const companyMap = new Map(allCompanies.map(c => [c.id, c]));
  const isLoading = productsLoading || companiesLoading;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-4">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Favorites</h1>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Your saved products and companies</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">Sign in to view your favorites</p>
            <Link href="/auth">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-4">
      <div className="max-w-4xl mx-auto px-4 py-4">
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Favorites</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Your saved products and companies</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('products')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === 'products'
                  ? "text-pink-600 dark:text-pink-400 border-b-2 border-pink-500 bg-pink-50/50 dark:bg-pink-900/10"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50"
              )}
            >
              <Package className="w-4 h-4" />
              Products
              {products.length > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 text-xs rounded-full",
                  activeTab === 'products'
                    ? "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                )}>
                  {products.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('companies')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === 'companies'
                  ? "text-purple-600 dark:text-purple-400 border-b-2 border-purple-500 bg-purple-50/50 dark:bg-purple-900/10"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50"
              )}
            >
              <Building2 className="w-4 h-4" />
              Companies
              {favoriteCompanies.length > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 text-xs rounded-full",
                  activeTab === 'companies'
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                )}>
                  {favoriteCompanies.length}
                </span>
              )}
            </button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Loading favorites...</p>
            </div>
          ) : (
            <div className="p-4">
              {/* Products Tab Content */}
              {activeTab === 'products' && (
                <>
                  {products.length === 0 ? (
                    <div className="py-8 text-center">
                      <Package className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No favorite products yet</p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Products you favorite will appear here</p>
                      <Link href="/products">
                        <Button variant="outline" className="mt-4">
                          Browse Products
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {products.map((product) => (
                        <div key={product.id} className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200 relative">
                          {/* Verified Badge & Fit Score - Top Right */}
                          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                                    <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <p className="text-xs">Product is verified by DeepFolder</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {product.fitScore !== undefined && (
                              <div 
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                                  product.fitScore >= 80 
                                    ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/50' 
                                    : product.fitScore >= 50 
                                      ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50'
                                      : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50'
                                }`}
                                title={product.fitReason || 'Fit score based on requirements match'}
                              >
                                <Gauge className={`w-3 h-3 ${
                                  product.fitScore >= 80 
                                    ? 'text-green-600 dark:text-green-400' 
                                    : product.fitScore >= 50 
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-red-600 dark:text-red-400'
                                }`} />
                                <span className={`text-[9px] font-bold ${
                                  product.fitScore >= 80 
                                    ? 'text-green-700 dark:text-green-400' 
                                    : product.fitScore >= 50 
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-red-700 dark:text-red-400'
                                }`}>
                                  Fit score {product.fitScore}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-start p-3 gap-3">
                            {/* Product Image */}
                            <div className="w-24 h-24 rounded-lg flex-shrink-0 relative overflow-hidden">
                              {product.imagePath ? (
                                <img 
                                  src={product.imagePath} 
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className={`w-full h-full flex items-center justify-center bg-gradient-to-r ${productGradients[product.id % productGradients.length]}`}>
                                  <Package className="w-8 h-8 text-white/80" />
                                </div>
                              )}
                            </div>
                            
                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <h5 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1 mb-1">
                                {product.name}
                              </h5>
                              
                              {/* Brand & Location */}
                              {(companyMap.get(product.companyId) || product.companyName) && (
                                <div className="mb-1 flex flex-col">
                                  <div className="flex items-baseline gap-1 mb-0.5">
                                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Brand:</span>
                                    {product.isExternal ? (
                                      product.companyWebsite ? (
                                        <a href={product.companyWebsite.startsWith('http') ? product.companyWebsite : `https://${product.companyWebsite}`} target="_blank" rel="noopener noreferrer">
                                          <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate">
                                            {product.companyName}
                                          </span>
                                        </a>
                                      ) : (
                                        <span className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
                                          {product.companyName}
                                        </span>
                                      )
                                    ) : (
                                      <Link href={`/company/${product.companyId}`}>
                                        <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate">
                                          {companyMap.get(product.companyId)?.name}
                                        </span>
                                      </Link>
                                    )}
                                  </div>
                                  {companyMap.get(product.companyId)?.location && (
                                    <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                      <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="truncate">{companyMap.get(product.companyId)?.location}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Description */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2 cursor-default">
                                      {product.description}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="center" sideOffset={2} avoidCollisions={false} className="max-w-[300px] z-[9999]">
                                    <p className="text-xs">{product.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {/* Category Badge */}
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                                  {product.category}
                                </span>
                              </div>
                              
                              {/* Download Links Row */}
                              <div className="flex items-center gap-3">
                                {/* Web Button */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`text-xs font-medium transition-colors ${
                                          product.productWebLink
                                            ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer'
                                            : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                        }`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (product.productWebLink) {
                                            window.open(formatExternalUrl(product.productWebLink), '_blank');
                                          }
                                        }}
                                        disabled={!product.productWebLink}
                                      >
                                        Web
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" align="start" sideOffset={8} className="max-w-xs z-[9999]" collisionPadding={16}>
                                      <p className="text-xs break-all">{product.productWebLink ? product.productWebLink : "No web link available"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                {/* DataSheet Button */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`text-xs font-medium transition-colors ${
                                          product.catalogPath
                                            ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer'
                                            : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                        }`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (product.catalogPath) {
                                            window.open(product.catalogPath, '_blank');
                                          }
                                        }}
                                        disabled={!product.catalogPath}
                                      >
                                        DataSheet
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{product.catalogPath ? "Download product technical specifications PDF" : "No datasheet available"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                {/* Downloads Dropdown */}
                                {((product.documentPaths && product.documentPaths.length > 0) || product.modelPath) ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                      >
                                        Downloads
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
                                      {/* 3D Model */}
                                      {product.modelPath && (
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            window.open(product.modelPath, '_blank');
                                          }}
                                          className="cursor-pointer"
                                        >
                                          <Box className="w-4 h-4 mr-2 text-blue-500" />
                                          <span>3D CAD Model (STEP)</span>
                                        </DropdownMenuItem>
                                      )}
                                      {/* Documents */}
                                      {product.documentPaths && product.documentPaths.map((docPath, docIndex) => {
                                        const fileName = docPath.split('/').pop() || `Document ${docIndex + 1}`;
                                        return (
                                          <DropdownMenuItem
                                            key={docIndex}
                                            onSelect={() => {
                                              window.open(docPath, '_blank');
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <FileText className="w-4 h-4 mr-2 text-green-500" />
                                            <span className="truncate">{fileName}</span>
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : (
                                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-not-allowed">
                                    Downloads
                                  </span>
                                )}
                                
                                <FavoriteButton type="product" id={product.id} className="ml-auto p-1" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Companies Tab Content */}
              {activeTab === 'companies' && (
                <>
                  {favoriteCompanies.length === 0 ? (
                    <div className="py-8 text-center">
                      <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No favorite companies yet</p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Companies you favorite will appear here</p>
                      <Link href="/companies">
                        <Button variant="outline" className="mt-4">
                          Browse Companies
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {favoriteCompanies.map((company) => (
                        <div key={company.id} className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 relative">
                          {/* Verified Badge - Top Right */}
                          <div className="absolute top-2 right-2 z-10">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                                    <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <p className="text-xs">Company is verified by DeepFolder</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          
                          <div className="flex items-start p-3 gap-3">
                            {/* Company Logo */}
                            <Link href={`/company/${company.id}`}>
                              <div className="w-14 h-14 rounded-lg flex-shrink-0 relative overflow-hidden cursor-pointer">
                                {company.logoPath ? (
                                  <img 
                                    src={company.logoPath} 
                                    alt={company.name}
                                    className="w-full h-full object-contain bg-white p-1"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                    <Building2 className="w-6 h-6 text-white" />
                                  </div>
                                )}
                              </div>
                            </Link>
                            
                            {/* Company Info */}
                            <div className="flex-1 min-w-0">
                              <Link href={`/company/${company.id}`}>
                                <h5 className="font-semibold text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer line-clamp-1 mb-1">
                                  {company.name}
                                </h5>
                              </Link>
                              
                              {/* Location */}
                              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{company.location}</span>
                              </div>
                              
                              {/* Description */}
                              {company.description && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2 cursor-default">
                                        {company.description}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" align="center" sideOffset={2} avoidCollisions={false} className="max-w-[300px] z-[9999]">
                                      <p className="text-xs">{company.description}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              {/* Industry Badge */}
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                                  {company.industry}
                                </span>
                              </div>
                              
                              {/* Action Buttons Row - Matching Product Card Style */}
                              <div className="flex items-center gap-3">
                                {/* Web Button */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`text-xs font-medium transition-colors ${
                                          company.website
                                            ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer'
                                            : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                        }`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (company.website) {
                                            window.open(formatExternalUrl(company.website), '_blank');
                                          }
                                        }}
                                        disabled={!company.website}
                                      >
                                        Web
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" align="start" sideOffset={8} className="max-w-xs z-[9999]" collisionPadding={16}>
                                      <p className="text-xs break-all">{company.website ? company.website : "No website available"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                
                                {/* Downloads Dropdown */}
                                {(() => {
                                  const companyDocs = (company as Company & { documentPaths?: string[] }).documentPaths;
                                  return companyDocs && companyDocs.length > 0 ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                        >
                                          Downloads
                                          <ChevronDown className="w-3 h-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
                                        {companyDocs.map((docPath: string, docIndex: number) => {
                                          const fileName = docPath.split('/').pop() || `Document ${docIndex + 1}`;
                                          return (
                                            <DropdownMenuItem
                                              key={docIndex}
                                              onSelect={() => {
                                                window.open(docPath, '_blank');
                                              }}
                                              className="cursor-pointer"
                                            >
                                              <FileText className="w-4 h-4 mr-2 text-green-500" />
                                              <span className="truncate">{fileName}</span>
                                            </DropdownMenuItem>
                                          );
                                        })}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : (
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-not-allowed">
                                      Downloads
                                    </span>
                                  );
                                })()}
                                
                                <FavoriteButton type="company" id={company.id} className="ml-auto p-1" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/">
            <Button variant="ghost" className="text-gray-600 dark:text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
