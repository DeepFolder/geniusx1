import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { 
  Palette, 
  Upload, 
  Save, 
  Eye, 
  Settings, 
  Building2, 
  MapPin, 
  Globe, 
  Mail, 
  Phone,
  Users,
  Award,
  Target,
  Briefcase,
  X,
  Plus,
  Package
} from "lucide-react";

interface CompanyData {
  id: number;
  name: string;
  description: string;
  industry: string;
  location: string;
  website?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  colorTheme: string;
  certifications: string[];
  capabilities: string[];
  companySize?: string;
  servicesOffered: string[];
  targetMarkets: string[];
  founded?: string;
  employees?: string;
  headquarters?: string;
}

const themeColors = {
  blue: "from-blue-500 to-blue-600",
  purple: "from-purple-500 to-purple-600", 
  green: "from-green-500 to-green-600",
  red: "from-red-500 to-red-600",
  orange: "from-orange-500 to-orange-600",
  teal: "from-teal-500 to-teal-600",
  pink: "from-pink-500 to-pink-600",
  indigo: "from-indigo-500 to-indigo-600"
};

const industrySuggestions = [
  "Technology", "Manufacturing", "Healthcare", "Finance", "Education",
  "Automotive", "Aerospace", "Construction", "Energy", "Telecommunications",
  "Retail", "Hospitality", "Agriculture", "Media", "Transportation"
];

const companySizes = [
  "1-10", "11-50", "51-100", "101-500", "501-1000", "1000+"
];

export default function CompanyCustomize() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<Partial<CompanyData>>({
    name: '',
    description: '',
    industry: '',
    location: '',
    website: '',
    email: '',
    phone: '',
    colorTheme: 'blue',
    certifications: [],
    capabilities: [],
    companySize: '',
    servicesOffered: [],
    targetMarkets: [],
    founded: '',
    employees: '',
    headquarters: ''
  });
  
  const [newCertification, setNewCertification] = useState('');
  const [newCapability, setNewCapability] = useState('');
  const [newService, setNewService] = useState('');
  const [newMarket, setNewMarket] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('basic');

  // Check if user is company admin for this company
  const isCompanyAdmin = user?.role === 'company_admin' && user?.companyId === parseInt(id);
  
  console.log('Customize page - user:', user);
  console.log('Customize page - isCompanyAdmin:', isCompanyAdmin);
  console.log('Customize page - id:', id);

  const { data: company, isLoading } = useQuery<CompanyData>({
    queryKey: [`/api/companies/${id}`],
    enabled: !!id,
  });

  useEffect(() => {
    if (company) {
      setFormData({
        ...company,
        certifications: company.certifications || [],
        capabilities: company.capabilities || [],
        servicesOffered: company.servicesOffered || [],
        targetMarkets: company.targetMarkets || []
      });
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (data: FormData | any) => {
      if (data instanceof FormData) {
        return apiRequest(`/api/companies/${id}`, {
          method: 'PUT',
          body: data,
        });
      } else {
        return apiRequest(`/api/companies/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company profile updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}`] });
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast({
        title: "Error",
        description: "Failed to update company profile",
        variant: "destructive",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      return apiRequest(`/api/companies/${id}/logo`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Logo uploaded successfully",
      });
      // Update logo preview
      setLogoPreview(data.logoPath);
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}`] });
    },
    onError: (error: any) => {
      console.log("Logo upload error:", error);
      toast({
        title: "Error", 
        description: "Failed to upload logo",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof CompanyData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayAdd = (field: keyof CompanyData, value: string, setter: (value: string) => void) => {
    if (value.trim()) {
      const currentArray = (formData[field] as string[]) || [];
      setFormData(prev => ({
        ...prev,
        [field]: [...currentArray, value.trim()]
      }));
      setter('');
    }
  };

  const handleArrayRemove = (field: keyof CompanyData, index: number) => {
    const currentArray = (formData[field] as string[]) || [];
    setFormData(prev => ({
      ...prev,
      [field]: currentArray.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Always send as JSON for company data
    const jsonData = { ...formData };
    
    // Remove problematic fields that cause database issues
    delete jsonData.id;
    delete jsonData.createdAt;
    delete jsonData.updatedAt;
    
    // Parse array fields that might be strings
    ['certifications', 'capabilities', 'servicesOffered', 'targetMarkets'].forEach(field => {
      if (typeof jsonData[field] === 'string') {
        try {
          jsonData[field] = JSON.parse(jsonData[field]);
        } catch (e) {
          jsonData[field] = [];
        }
      }
    });
    
    console.log('Submitting clean JSON data:', jsonData);
    
    // Call the mutation - logo upload will happen in onSuccess if needed
    updateMutation.mutate(jsonData);
  };

  if (!isCompanyAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Access Denied
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Only company administrators can customize company profiles.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading company data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Company Profile Customization
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Customize your company profile to attract potential partners and customers
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => window.open(`/companies/${id}`, '_blank')}>
                <Eye className="w-4 h-4 mr-2" />
                Preview Profile
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={updateMutation.isPending || uploadLogoMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {(updateMutation.isPending || uploadLogoMutation.isPending) ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="details">Company Details</TabsTrigger>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
            </TabsList>

            {/* Basic Information Tab */}
            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Company Name *</Label>
                      <Input
                        id="name"
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter company name"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry *</Label>
                      <Select 
                        value={formData.industry || ''}
                        onValueChange={(value) => handleInputChange('industry', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {industrySuggestions.map(industry => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Company Description *</Label>
                    <Textarea
                      id="description"
                      value={formData.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Describe your company, mission, and what makes you unique..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="location">Location *</Label>
                      <Input
                        id="location"
                        value={formData.location || ''}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                        placeholder="City, Country"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="companySize">Company Size</Label>
                      <Select 
                        value={formData.companySize || ''}
                        onValueChange={(value) => handleInputChange('companySize', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {companySizes.map(size => (
                            <SelectItem key={size} value={size}>
                              {size} employees
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Branding Tab */}
            <TabsContent value="branding" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Branding & Visual Identity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Logo Upload */}
                  <div className="space-y-4">
                    <Label>Company Logo</Label>
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                        {logoFile ? (
                          <img 
                            src={URL.createObjectURL(logoFile)} 
                            alt="Logo preview"
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : formData.logoUrl ? (
                          <img 
                            src={formData.logoUrl} 
                            alt="Company logo"
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <Building2 className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="logo-upload"
                        />
                        <Label htmlFor="logo-upload" className="cursor-pointer">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <div>
                              <Upload className="w-4 h-4 mr-2" />
                              {logoFile ? 'Change Logo' : 'Upload Logo'}
                            </div>
                          </Button>
                        </Label>
                        <p className="text-sm text-gray-500">
                          Recommended: 200x200px, PNG or JPG
                        </p>
                        {logoFile && (
                          <p className="text-sm text-green-600">
                            New logo selected: {logoFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Color Theme */}
                  <div className="space-y-4">
                    <Label>Brand Color Theme</Label>
                    <div className="grid grid-cols-4 gap-3">
                      {Object.entries(themeColors).map(([theme, gradient]) => (
                        <div
                          key={theme}
                          className={`relative cursor-pointer rounded-lg p-4 border-2 transition-all ${
                            formData.colorTheme === theme 
                              ? 'border-blue-500 ring-2 ring-blue-200' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => handleInputChange('colorTheme', theme)}
                        >
                          <div className={`w-full h-12 bg-gradient-to-r ${gradient} rounded-md mb-2`}></div>
                          <p className="text-sm font-medium text-center capitalize">{theme}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Company Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    Contact & Company Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        value={formData.website || ''}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        placeholder="https://yourcompany.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Contact Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="contact@yourcompany.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone || ''}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="founded">Founded Year</Label>
                      <Input
                        id="founded"
                        value={formData.founded || ''}
                        onChange={(e) => handleInputChange('founded', e.target.value)}
                        placeholder="2020"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Capabilities Tab */}
            <TabsContent value="capabilities" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Certifications */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="w-5 h-5" />
                      Certifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newCertification}
                        onChange={(e) => setNewCertification(e.target.value)}
                        placeholder="e.g., ISO 9001, ISO 27001"
                        onKeyPress={(e) => e.key === 'Enter' && handleArrayAdd('certifications', newCertification, setNewCertification)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleArrayAdd('certifications', newCertification, setNewCertification)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.certifications?.map((cert, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {cert}
                          <X 
                            className="w-3 h-3 cursor-pointer hover:text-red-500" 
                            onClick={() => handleArrayRemove('certifications', index)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Capabilities */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Core Capabilities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newCapability}
                        onChange={(e) => setNewCapability(e.target.value)}
                        placeholder="e.g., Design, Manufacturing"
                        onKeyPress={(e) => e.key === 'Enter' && handleArrayAdd('capabilities', newCapability, setNewCapability)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleArrayAdd('capabilities', newCapability, setNewCapability)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.capabilities?.map((capability, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {capability}
                          <X 
                            className="w-3 h-3 cursor-pointer hover:text-red-500" 
                            onClick={() => handleArrayRemove('capabilities', index)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Services Offered */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5" />
                      Services Offered
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newService}
                        onChange={(e) => setNewService(e.target.value)}
                        placeholder="e.g., Consulting, Custom Development"
                        onKeyPress={(e) => e.key === 'Enter' && handleArrayAdd('servicesOffered', newService, setNewService)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleArrayAdd('servicesOffered', newService, setNewService)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.servicesOffered?.map((service, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {service}
                          <X 
                            className="w-3 h-3 cursor-pointer hover:text-red-500" 
                            onClick={() => handleArrayRemove('servicesOffered', index)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Target Markets */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Target Markets
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newMarket}
                        onChange={(e) => setNewMarket(e.target.value)}
                        placeholder="e.g., Small Business, Enterprise"
                        onKeyPress={(e) => e.key === 'Enter' && handleArrayAdd('targetMarkets', newMarket, setNewMarket)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleArrayAdd('targetMarkets', newMarket, setNewMarket)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.targetMarkets?.map((market, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {market}
                          <X 
                            className="w-3 h-3 cursor-pointer hover:text-red-500" 
                            onClick={() => handleArrayRemove('targetMarkets', index)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Product Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProductManagementTab companyId={parseInt(id)} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </div>
  );
}

// Product Management Component
function ProductManagementTab({ companyId }: { companyId: number }) {
  const [products, setProducts] = useState<any[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: companyProducts = [], refetch } = useQuery({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const addProductMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return apiRequest(`/api/companies/${companyId}/products`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product added successfully" });
      setIsAddingProduct(false);
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add product", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: number; formData: FormData }) => {
      return apiRequest(`/api/products/${id}`, {
        method: 'PUT',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product updated successfully" });
      setEditingProduct(null);
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      return apiRequest(`/api/products/${productId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product deleted successfully" });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Company Products</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage your product catalog with descriptions, images, and downloadable files
          </p>
        </div>
        <Button onClick={() => setIsAddingProduct(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Products List */}
      <div className="grid gap-4">
        {companyProducts.map((product: any) => (
          <Card key={product.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                {product.imageUrl && (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div>
                  <h4 className="font-semibold">{product.name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {product.description}
                  </p>
                  <div className="flex gap-2 text-xs">
                    {product.category && (
                      <Badge variant="secondary">{product.category}</Badge>
                    )}
                    <span className="text-gray-500">${product.price}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setEditingProduct(product)}
                >
                  Edit
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => deleteProductMutation.mutate(product.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add/Edit Product Modal */}
      {(isAddingProduct || editingProduct) && (
        <ProductModal
          product={editingProduct}
          companyId={companyId}
          onClose={() => {
            setIsAddingProduct(false);
            setEditingProduct(null);
          }}
          onSubmit={(formData) => {
            if (editingProduct) {
              updateProductMutation.mutate({ id: editingProduct.id, formData });
            } else {
              addProductMutation.mutate(formData);
            }
          }}
        />
      )}
    </div>
  );
}

// Product Modal Component
function ProductModal({ 
  product, 
  companyId, 
  onClose, 
  onSubmit 
}: { 
  product?: any; 
  companyId: number; 
  onClose: () => void; 
  onSubmit: (formData: FormData) => void; 
}) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    category: product?.category || '',
    price: product?.price || '',
    specifications: product?.specifications || '',
  });
  const [files, setFiles] = useState<{
    image?: File;
    datasheet?: File;
    model3d?: File;
  }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = new FormData();
    submitData.append('companyId', companyId.toString());
    
    Object.entries(formData).forEach(([key, value]) => {
      submitData.append(key, value);
    });
    
    if (files.image) submitData.append('image', files.image);
    if (files.datasheet) submitData.append('datasheet', files.datasheet);
    if (files.model3d) submitData.append('model3d', files.model3d);
    
    onSubmit(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {product ? 'Edit Product' : 'Add New Product'}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specifications">Specifications</Label>
                <Input
                  id="specifications"
                  value={formData.specifications}
                  onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
                  placeholder="e.g., Material: Steel, Size: 10x5cm"
                />
              </div>
            </div>

            {/* File Uploads */}
            <div className="space-y-4">
              <h4 className="font-medium">Product Files</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="image">Product Image</Label>
                  <input
                    type="file"
                    id="image"
                    accept="image/*"
                    onChange={(e) => setFiles(prev => ({ ...prev, image: e.target.files?.[0] }))}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="datasheet">Datasheet (PDF)</Label>
                  <input
                    type="file"
                    id="datasheet"
                    accept=".pdf"
                    onChange={(e) => setFiles(prev => ({ ...prev, datasheet: e.target.files?.[0] }))}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model3d">3D Model</Label>
                  <input
                    type="file"
                    id="model3d"
                    accept=".step,.stp,.stl,.obj,.fbx"
                    onChange={(e) => setFiles(prev => ({ ...prev, model3d: e.target.files?.[0] }))}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  />
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p>• Image: JPG, PNG up to 5MB</p>
                <p>• Datasheet: PDF up to 10MB</p>
                <p>• 3D Model: STEP, STL, OBJ files up to 50MB</p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {product ? 'Update Product' : 'Add Product'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}