import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, MapPin, Building, Users, Briefcase } from "lucide-react";
import { Link } from "wouter";

interface Company {
  id: number;
  name: string;
  description: string;
  industry: string;
  location: string;
  country: string;
  companySize: string;
  employeeCount: string;
  logoPath?: string;
  servicesOffered?: string[];
}

export default function AdvancedCompanySearch() {
  const [filters, setFilters] = useState({
    keywords: "",
    industry: "",
    country: "",
    companySize: "",
    servicesOffered: ""
  });

  const [isSearching, setIsSearching] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['/api/companies/search/advanced', filters],
    enabled: isSearching,
    staleTime: 30000, // 30 seconds
  });

  const handleSearch = () => {
    setIsSearching(true);
  };

  const handleReset = () => {
    setFilters({
      keywords: "",
      industry: "",
      country: "",
      companySize: "",
      servicesOffered: ""
    });
    setIsSearching(false);
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const industries = [
    "Manufacturing", "Technology", "Healthcare", "Automotive", "Aerospace",
    "Electronics", "Energy", "Construction", "Food & Beverage", "Chemical",
    "Pharmaceutical", "Textile", "Mining", "Agriculture", "Finance"
  ];

  const countries = [
    "United States", "Canada", "United Kingdom", "Germany", "France",
    "Italy", "Spain", "Netherlands", "China", "Japan", "South Korea",
    "India", "Australia", "Brazil", "Mexico"
  ];

  const companySizes = [
    "Startup (1-10)", "Small (11-50)", "Medium (51-200)", 
    "Large (201-1000)", "Enterprise (1000+)"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Advanced Company Search
          </CardTitle>
          <CardDescription>
            Find companies by industry, location, size, and services offered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                placeholder="Search by company name or description..."
                value={filters.keywords}
                onChange={(e) => handleFilterChange("keywords", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={filters.industry} onValueChange={(value) => handleFilterChange("industry", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {industries.map(industry => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={filters.country} onValueChange={(value) => handleFilterChange("country", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companySize">Company Size</Label>
              <Select value={filters.companySize} onValueChange={(value) => handleFilterChange("companySize", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  {companySizes.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="servicesOffered">Services</Label>
              <Input
                id="servicesOffered"
                placeholder="e.g., consulting, manufacturing..."
                value={filters.servicesOffered}
                onChange={(e) => handleFilterChange("servicesOffered", e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="h-4 w-4 mr-2" />
              {isLoading ? "Searching..." : "Search Companies"}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <Filter className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {isSearching && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Search Results {companies.length > 0 && `(${companies.length} companies found)`}
            </h3>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : companies.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Search className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No companies found
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  Try adjusting your search filters to find more companies.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.map((company: Company) => (
                <Link key={company.id} href={`/companies/${company.id}`}>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {company.logoPath ? (
                              <img 
                                src={company.logoPath} 
                                alt={`${company.name} logo`}
                                className="w-full h-full object-cover rounded-lg"
                              />
                            ) : (
                              <Building className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                              {company.name}
                            </h3>
                            <Badge variant="outline" className="text-xs">
                              {company.industry}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                          {company.description}
                        </p>

                        <div className="space-y-2">
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <MapPin className="h-3 w-3 mr-1" />
                            {company.location}
                            {company.country && `, ${company.country}`}
                          </div>
                          
                          {company.companySize && (
                            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                              <Users className="h-3 w-3 mr-1" />
                              {company.companySize} employees
                            </div>
                          )}

                          {company.servicesOffered && company.servicesOffered.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {company.servicesOffered.slice(0, 3).map((service, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {service}
                                </Badge>
                              ))}
                              {company.servicesOffered.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{company.servicesOffered.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}