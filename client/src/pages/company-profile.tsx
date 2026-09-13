import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Factory, 
  Mail, 
  MessageCircle, 
  MapPin, 
  Phone, 
  Globe, 
  Users, 
  Download,
  Package,
  Heart,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Settings,
  Check,
  X,
  Upload,
  Save,
  Eye,
  FileText,
  Send,
  Sparkles,
  Calendar,
  TrendingUp,
  Award,
  Building2,
  Bot,
  Shield,
  Clock,
  ShoppingCart,
  Camera,
  Trash2,
  Lock,
  Loader2,
  BadgeCheck,
  Box,
  ChevronDown,
  Settings2,
  Link2,
  FileSpreadsheet,
  Search,
  ChevronsUpDown
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import FavoriteButton from "@/components/favorite-button";
import type { Company, Product } from "@shared/schema";
import UnifiedChat from "@/components/chat/UnifiedChat";
import { ObjectUploader } from "@/components/ObjectUploader";
import ModelViewer from "@/components/models/model-viewer";
import Three3DViewer from "@/components/models/Three3DViewer";
import GlobalSearch from "@/components/search/global-search";
import { cn, formatExternalUrl } from "@/lib/utils";
import AddCatalogueModal from "@/components/company/add-catalogue-modal";
import AddRestrictedDocumentModal from "@/components/company/add-restricted-document-modal";
import ProductPreview from "@/components/models/ProductPreview";

const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
  "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
  "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia",
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago",
  "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "UAE", "Uganda", "Ukraine", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const INDUSTRIES = [
  'Aerospace Components', 'Agricultural Equipment', 'Automotive Parts', 'Bearings & Bushings',
  'Cables & Wiring', 'Castings & Forgings', 'Chemicals & Compounds', 'Connectors & Fasteners',
  'Construction Materials', 'Consumer Electronics', 'Control Systems', 'Cutting Tools',
  'Defense Equipment', 'Electrical Components', 'Electronic Components', 'Enclosures & Cabinets',
  'Fasteners & Hardware', 'Filters & Filtration', 'Flow Control', 'Food Processing Equipment',
  'Furniture & Fixtures', 'Gaskets & Seals', 'Gears & Drives', 'Hand Tools', 'Hinges & Latches',
  'HVAC Equipment', 'Hydraulics & Pneumatics', 'Industrial Machinery', 'Instrumentation',
  'Lighting Equipment', 'Linear Motion', 'Machine Tools', 'Marine Equipment', 'Material Handling',
  'Measuring Instruments', 'Medical Devices', 'Motors & Drives', 'Packaging Materials',
  'Pharmaceutical Equipment', 'Plastics & Polymers', 'Power Transmission', 'Precision Components',
  'Printed Circuit Boards', 'Pumps & Valves', 'Raw Materials', 'Robotics Components',
  'Safety Equipment', 'Sensors & Transducers', 'Semiconductors', 'Sheet Metal', 'Springs',
  'Structural Components', 'Surface Treatment', 'Test Equipment', 'Textiles & Fabrics',
  'Thermal Management', 'Tubes & Pipes', 'Welding Equipment', 'Other'
];

function capitalizeCity(input: string): string {
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseLocation(location: string): { city: string; country: string } {
  if (!location) return { city: '', country: '' };
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    return { city: parts[0], country: parts.slice(1).join(', ') };
  }
  const matchedCountry = countries.find(c => c.toLowerCase() === location.toLowerCase());
  if (matchedCountry) return { city: '', country: matchedCountry };
  return { city: location, country: '' };
}

// Typing animation component for AI chat responses
function TypingMessageContent({ content, speed = 15 }: { content: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [content]);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, content, speed]);

  return <>{displayedText}</>;
}

function ProductConfigDropdown({ productId, onSelectConfig }: { productId: number; onSelectConfig: (config: any | null) => void }) {
  const { data: configs } = useQuery<any[]>({
    queryKey: [`/api/products/${productId}/configurations`],
    enabled: !!productId,
  });

  if (!configs || configs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full">
          <Settings2 className="w-2.5 h-2.5" />
          {configs.length} variant{configs.length !== 1 ? 's' : ''}
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
        <DropdownMenuItem onSelect={() => onSelectConfig(null)}>
          <span className="text-xs font-medium">Base Product</span>
        </DropdownMenuItem>
        {configs.map((config: any) => (
          <DropdownMenuItem key={config.id} onSelect={() => onSelectConfig(config)}>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">{config.name}</span>
              <div className="flex items-center gap-2">
                {config.datasheetPath && (
                  <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
                    <FileText className="w-2.5 h-2.5" />
                    PDF
                  </span>
                )}
                {config.modelPath && (
                  <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                    <Box className="w-2.5 h-2.5" />
                    3D
                  </span>
                )}
                {config.webLink && (
                  <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                    <Link2 className="w-2.5 h-2.5" />
                    Web
                  </span>
                )}
                {!config.datasheetPath && !config.modelPath && !config.webLink && (
                  <span className="text-[10px] text-gray-400 italic">Uses base product files</span>
                )}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CompanyProfile() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  
  // Product gradients for consistency
  const productGradients = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600', 
    'from-purple-400 to-purple-600',
    'from-red-400 to-red-600',
    'from-yellow-400 to-yellow-600',
    'from-pink-400 to-pink-600',
    'from-indigo-400 to-indigo-600',
    'from-teal-400 to-teal-600'
  ];

  // Placeholder ProductPreview component
  const ProductPreview = ({ product, gradientClass }: { product: any, gradientClass: string }) => (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradientClass}`}>
      <Package className="w-12 h-12 text-white/70" />
    </div>
  );
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAddingCatalogue, setIsAddingCatalogue] = useState(false);
  const [isAddingRestrictedDoc, setIsAddingRestrictedDoc] = useState(false);
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [selectedConfigs, setSelectedConfigs] = useState<Record<number, any>>({});
  const [query, setQuery] = useState("");
  const [isAISearchLoading, setIsAISearchLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tabSectionRef = useRef<HTMLDivElement>(null);
  const tabHeaderRef = useRef<HTMLDivElement>(null);
  
  // AI Chat states
  const [aiQuery, setAiQuery] = useState("");
  const [aiMessages, setAiMessages] = useState<{id: string, content: string, isUser: boolean, timestamp: Date}[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  // Preview states
  const [previewItem, setPreviewItem] = useState<{ type: 'company' | 'product', data: any } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Mutation for adding to favorites
  const addToFavoritesMutation = useMutation({
    mutationFn: async ({ productId }: { productId: number }) => {
      return apiRequest("/api/favorites", {
        method: "POST",
        body: JSON.stringify({
          favoriteType: "product",
          favoriteId: productId
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
      toast({
        title: "Added to favorites",
        description: "Product added to your favorites successfully",
      });
    },
    onError: (error: Error) => {
      if (error.message.includes("401") || error.message.includes("Authentication required")) {
        toast({
          title: "Login required",
          description: "Please log in to add products to your favorites",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add to favorites. Please try again.",
          variant: "destructive",
        });
      }
    },
  });
  
  // Product view and filter states
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  
  // Check if current user is company admin for this company
  const isCompanyAdmin =
    user?.role === 'admin' ||
    (user?.role === 'company_admin' && user?.companyId === parseInt(id || '0'));

  // Aggressive scroll to top - prevent any automatic scrolling
  useLayoutEffect(() => {
    // Disable browser scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    
    // Force scroll to top immediately
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Create a scroll lock during initial load
    const preventScroll = (e: Event) => {
      window.scrollTo(0, 0);
      e.preventDefault();
    };
    
    // Lock scroll for first 500ms
    window.addEventListener('scroll', preventScroll, { passive: false });
    
    const timer = setTimeout(() => {
      window.removeEventListener('scroll', preventScroll);
    }, 500);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', preventScroll);
    };
  }, [id]);

  // Search handlers

  const { data: company, isLoading: isLoadingCompany, error: companyError } = useQuery<Company>({
    queryKey: [`/api/companies/${id}`],
    enabled: !!id,
    retry: false,
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: [`/api/products?companyId=${id}`],
    enabled: !!id,
    retry: false,
  });

  const { data: catalogues, isLoading: isLoadingCatalogues } = useQuery<any[]>({
    queryKey: [`/api/companies/${id}/catalogues`],
    enabled: !!id,
    retry: false,
  });

  const { data: restrictedDocuments, isLoading: isLoadingRestrictedDocs } = useQuery<any[]>({
    queryKey: [`/api/companies/${id}/restricted-documents`],
    enabled: !!id,
    retry: false,
  });

  // Update company mutation for inline editing
  const updateCompanyMutation = useMutation({
    mutationFn: async (updateData: any) => {
      return apiRequest(`/api/companies/${id}`, { method: "PUT", body: JSON.stringify(updateData) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}`] });
      setEditingData({});
      toast({
        title: "Company Updated",
        description: "Company information updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update company information.",
        variant: "destructive",
      });
    },
  });


  // AI Chat handlers
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages, isAILoading]);

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim() || isAILoading || !company) return;

    const userMessage = {
      id: Date.now().toString(),
      content: aiQuery.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setAiMessages(prev => [...prev, userMessage]);
    setAiQuery("");
    setIsAILoading(true);

    try {
      const response = await fetch(`/api/companies/${company.id}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: userMessage.content
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiMessage = {
          id: (Date.now() + 1).toString(),
          content: data.response || "I can help you learn more about this company. What would you like to know?",
          isUser: false,
          timestamp: new Date(),
        };
        setAiMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error('Failed to get AI response');
      }
    } catch (error) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again later.",
        isUser: false,
        timestamp: new Date(),
      };
      setAiMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAILoading(false);
    }
  };

  // Preview functions
  const handlePreviewCompany = async (company: Company) => {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/companies/${company.id}`);
      if (response.ok) {
        const fullCompanyData = await response.json();
        setPreviewItem({ type: 'company', data: fullCompanyData });
      } else {
        setPreviewItem({ type: 'company', data: company });
      }
    } catch (error) {
      console.error('Failed to load company preview:', error);
      setPreviewItem({ type: 'company', data: company });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewProduct = async (product: Product) => {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/products/${product.id}`);
      if (response.ok) {
        const fullProductData = await response.json();
        setPreviewItem({ type: 'product', data: fullProductData });
      } else {
        setPreviewItem({ type: 'product', data: product });
      }
    } catch (error) {
      console.error('Failed to load product preview:', error);
      setPreviewItem({ type: 'product', data: product });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Delete product handler with synchronous ref lock to prevent double-clicks
  const handleDeleteProduct = async () => {
    // Synchronous check with ref to prevent race conditions
    if (!productToDelete || isDeletingRef.current) return;
    
    // Capture product data immediately before any async work
    const productId = productToDelete.id;
    const productName = productToDelete.name;
    
    // Set ref synchronously BEFORE any async work
    isDeletingRef.current = true;
    setIsDeleting(true);
    
    try {
      await apiRequest(`/api/products/${productId}`, {
        method: 'DELETE',
      });

      toast({
        title: "Product Deleted",
        description: `${productName} has been successfully deleted.`,
      });

      queryClient.invalidateQueries({ queryKey: [`/api/products?companyId=${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });

      setShowDeleteConfirmation(false);
      setProductToDelete(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete product. Please try again.",
        variant: "destructive",
      });
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // Enhanced render editable field - uses editMode for section-level editing
  // Both display and edit modes have same spacing to prevent layout shift
  const renderEditableField = (field: string, value: any, type: "text" | "textarea" | "select" | "array" = "text", options?: string[], centered: boolean = false) => {
    const isInEditMode = editMode === 'profile' && isCompanyAdmin;
    
    // Base styles with transparent border (always present to reserve space)
    const baseFieldStyles = "border border-transparent rounded px-1 py-0.5 transition-colors duration-150";
    // Edit mode - blue border becomes visible
    const editFieldStyles = "bg-transparent border-blue-400 dark:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300/50 dark:focus:ring-blue-700/50";
    const selectTriggerStyles = "bg-transparent border-blue-400 dark:border-blue-500 hover:border-blue-500 dark:hover:border-blue-400";

    if (!isCompanyAdmin || !isInEditMode) {
      if (type === "array" && Array.isArray(value)) {
        return (
          <div className={cn("flex flex-wrap gap-1", baseFieldStyles, centered && "justify-center")}>
            {value.map((item, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        );
      }
      // Display mode - transparent border reserves space
      return <span className={cn("text-gray-600 dark:text-gray-300 inline-block", baseFieldStyles, centered && "text-center")}>{value || "Not specified"}</span>;
    }

    // In edit mode - same base styles but with visible blue border
    return (
      <div className={cn(centered && "flex flex-col items-center")}>
        {type === "textarea" ? (
          <Textarea
            value={editingData[field] ?? value ?? ""}
            onChange={(e) => setEditingData({ ...editingData, [field]: e.target.value })}
            className={cn("w-full text-sm text-gray-900 dark:text-gray-100", baseFieldStyles, editFieldStyles, centered && "text-center")}
            rows={3}
          />
        ) : type === "select" && options ? (
          <Select value={editingData[field] ?? value ?? ""} onValueChange={(val) => setEditingData({ ...editingData, [field]: val })}>
            <SelectTrigger className={cn("w-auto min-w-[120px] h-8 text-xs text-gray-900 dark:text-gray-100", baseFieldStyles, selectTriggerStyles, centered && "text-center")}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : type === "array" ? (
          <div className="space-y-1">
            <Textarea
              value={Array.isArray(editingData[field]) ? editingData[field].join('\n') : ''}
              onChange={(e) => setEditingData({ ...editingData, [field]: e.target.value.split('\n').filter(item => item.trim()) })}
              placeholder="Enter one item per line"
              className={cn("w-full text-sm text-gray-900 dark:text-gray-100", baseFieldStyles, editFieldStyles)}
              rows={3}
            />
          </div>
        ) : (
          <Input
            value={editingData[field] ?? value ?? ""}
            onChange={(e) => setEditingData({ ...editingData, [field]: e.target.value })}
            className={cn("w-full h-auto text-sm text-gray-900 dark:text-gray-100", baseFieldStyles, editFieldStyles, centered && "text-center")}
          />
        )}
      </div>
    );
  };

  // Location editing state
  const [locationCity, setLocationCity] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);

  // Industry editing state
  const [industryOpen, setIndustryOpen] = useState(false);
  const [customIndustry, setCustomIndustry] = useState('');

  // Add edit mode toggle for entire sections
  const [editMode, setEditMode] = useState<string | null>(null);
  
  const toggleEditMode = (section: string) => {
    if (editMode === section) {
      setEditMode(null);
      setEditingData({});
      setLocationCity('');
      setLocationCountry('');
      setCountryOpen(false);
      setCustomIndustry('');
      setIndustryOpen(false);
    } else {
      setEditMode(section);
      if (section === 'profile' && company) {
        const parsed = parseLocation(company.location || '');
        setLocationCity(parsed.city);
        setLocationCountry(parsed.country);
        setEditingData({
          name: company.name || '',
          description: company.description || '',
          industry: company.industry || '',
          location: company.location || '',
          employeeCount: company.employeeCount || '',
          website: company.website || '',
        });
      }
    }
  };
  
  const saveAllChanges = () => {
    const finalLocation = locationCity && locationCountry ? `${locationCity}, ${locationCountry}` : locationCity || locationCountry;
    updateCompanyMutation.mutate({ ...editingData, location: finalLocation || editingData.location });
    setEditMode(null);
    setLocationCity('');
    setLocationCountry('');
    setCountryOpen(false);
    setCustomIndustry('');
    setIndustryOpen(false);
  };
  
  const cancelAllEditing = () => {
    setEditMode(null);
    setEditingData({});
    setLocationCity('');
    setLocationCountry('');
    setCountryOpen(false);
    setCustomIndustry('');
    setIndustryOpen(false);
  };

  // Check if user is following this company
  const { data: userFollows } = useQuery<{ id: number, companyId: number }[]>({
    queryKey: ["/api/user/follows"],
    enabled: isAuthenticated,
  });

  const isFollowing = userFollows?.some(follow => follow.companyId === parseInt(id || '0')) || false;

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        return apiRequest(`/api/companies/${id}/follow`, { method: "DELETE" });
      } else {
        return apiRequest(`/api/companies/${id}/follow`, { method: "POST" });
      }
    },
    onSuccess: async () => {
      // Force refetch to bypass cache
      await queryClient.invalidateQueries({ queryKey: ["/api/user/follows"], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ["/api/user/follows"] });
      // Update company data to reflect new follower count
      await queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}`] });
      toast({
        title: isFollowing ? "Unfollowed" : "Following",
        description: `You are ${isFollowing ? 'no longer following' : 'now following'} ${company?.name}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update follow status. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Loading state
  if (isLoadingCompany) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
        <div className="w-full px-6 py-6">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_0.7fr] gap-4">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Company not found
  if (!company) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
        <div className="w-full px-6">
          <div className="text-center py-12">
            <Factory className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Company not found</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">The company you're looking for doesn't exist.</p>
            <Link href="/companies">
              <Button>Browse Companies</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen modern-4k-background pt-6">
      
      <div className="relative z-10">
      <div className="w-full px-6 py-3">
        {/* Company Profile Card - Matching Search Result Style */}
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all duration-200 relative mb-8">
          {/* Verified Badge - Top Right */}
          {/* Top Right: Verified Badge + Edit Button */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {/* Admin Edit Button */}
            {isCompanyAdmin && (
              <>
                {editMode === 'profile' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={saveAllChanges}
                      disabled={updateCompanyMutation.isPending}
                      className="text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelAllEditing}
                      className="text-xs h-7 px-2 bg-white/90 dark:bg-gray-800/90"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleEditMode('profile')}
                    className="text-xs h-7 px-2 bg-white/90 dark:bg-gray-800/90"
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </>
            )}
            
            {/* Verified Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                    <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">Company is verified by DeepFolder</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="p-5">
            <div className="flex items-start gap-5">
              {/* Company Logo */}
              <div className="relative w-24 h-24 rounded-lg flex-shrink-0 overflow-hidden">
                {company.logoPath ? (
                  <div className="w-full h-full bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center p-2 border border-gray-200 dark:border-gray-700">
                    <img 
                      src={company.logoPath} 
                      alt={`${company.name} logo`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const parent = el.parentElement;
                        if (parent && !parent.querySelector('.img-fallback')) {
                          const fb = document.createElement('div');
                          fb.className = 'img-fallback w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg';
                          fb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
                          parent.appendChild(fb);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                    <Building2 className="w-10 h-10 text-white" />
                  </div>
                )}
                {isCompanyAdmin && editMode === 'profile' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label 
                          htmlFor="logo-upload" 
                          className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 hover:bg-black/70 rounded-lg cursor-pointer transition-colors"
                        >
                          <Camera className="w-6 h-6 text-white" />
                          <span className="text-[9px] text-white/80 mt-1">Click to upload</span>
                          <input
                            id="logo-upload"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const formData = new FormData();
                                formData.append('logo', file);
                                try {
                                  const response = await fetch(`/api/companies/${id}/logo`, {
                                    method: 'POST',
                                    credentials: 'include',
                                    body: formData,
                                  });
                                  if (response.ok) {
                                    queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}`] });
                                    toast({
                                      title: "Logo Updated",
                                      description: "Company logo uploaded successfully.",
                                    });
                                  } else {
                                    throw new Error('Upload failed');
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Upload Failed",
                                    description: "Failed to upload logo. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                          />
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p>300 × 300px • 1:1 Square • PNG/JPG</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              
              {/* Company Info */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="font-bold text-xl text-gray-900 dark:text-white mb-1 max-w-[280px]">
                  {renderEditableField('name', company.name, 'text', undefined, true)}
                </div>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
                  <MapPin className="w-4 h-4 mr-1.5 flex-shrink-0" />
                  {editMode === 'profile' && isCompanyAdmin ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Input
                        value={locationCity}
                        onChange={(e) => {
                          const capitalized = capitalizeCity(e.target.value);
                          setLocationCity(capitalized);
                          const loc = capitalized && locationCountry ? `${capitalized}, ${locationCountry}` : capitalized || locationCountry;
                          setEditingData((prev: any) => ({ ...prev, location: loc }));
                        }}
                        placeholder="City"
                        className="h-7 w-[120px] text-xs bg-transparent border-blue-400 dark:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-300/50 rounded px-1.5"
                      />
                      <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                        <PopoverTrigger asChild>
                          <button className="h-7 px-2 text-xs rounded border border-blue-400 dark:border-blue-500 bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1 hover:border-blue-500 min-w-[100px]">
                            {locationCountry || "Country"}
                            <ChevronsUpDown className="w-3 h-3 opacity-60 ml-auto" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start" side="bottom">
                          <Command className="bg-white dark:bg-gray-800">
                            <CommandInput placeholder="Search country..." className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                            <CommandList>
                              <CommandEmpty className="text-gray-500 py-3 text-center text-xs">No country found.</CommandEmpty>
                              <CommandGroup>
                                {countries.map((c) => (
                                  <CommandItem
                                    key={c}
                                    value={c}
                                    onSelect={() => {
                                      setLocationCountry(c);
                                      setCountryOpen(false);
                                      const loc = locationCity && c ? `${locationCity}, ${c}` : locationCity || c;
                                      setEditingData((prev: any) => ({ ...prev, location: loc }));
                                    }}
                                    className="text-gray-900 dark:text-white cursor-pointer text-xs"
                                  >
                                    <Check className={cn("mr-2 h-3 w-3", locationCountry === c ? "opacity-100" : "opacity-0")} />
                                    {c}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-300 border border-transparent rounded px-1 py-0.5">{company.location || "Not specified"}</span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 rounded">
                    {editMode === 'profile' && isCompanyAdmin ? (
                      <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
                        <PopoverTrigger asChild>
                          <button className="h-7 px-2 text-xs rounded border border-blue-400 dark:border-blue-500 bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1 hover:border-blue-500 min-w-[140px]">
                            {editingData.industry || company.industry || "Select industry"}
                            <ChevronsUpDown className="w-3 h-3 opacity-60 ml-auto" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[260px] p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start" side="bottom">
                          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-1">
                              <Input
                                value={customIndustry}
                                onChange={(e) => setCustomIndustry(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customIndustry.trim()) {
                                    setEditingData((prev: any) => ({ ...prev, industry: customIndustry.trim() }));
                                    setCustomIndustry('');
                                    setIndustryOpen(false);
                                  }
                                }}
                                placeholder="Type custom industry..."
                                className="h-7 text-xs bg-transparent border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-300/50"
                              />
                              {customIndustry.trim() && (
                                <button
                                  onClick={() => {
                                    setEditingData((prev: any) => ({ ...prev, industry: customIndustry.trim() }));
                                    setCustomIndustry('');
                                    setIndustryOpen(false);
                                  }}
                                  className="h-7 w-7 flex items-center justify-center rounded border border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 shrink-0"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <Command className="bg-white dark:bg-gray-800">
                            <CommandInput placeholder="Search industries..." className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                            <CommandList>
                              <CommandEmpty className="text-gray-500 py-3 text-center text-xs">No industry found.</CommandEmpty>
                              <CommandGroup>
                                {INDUSTRIES.map((ind) => (
                                  <CommandItem
                                    key={ind}
                                    value={ind}
                                    onSelect={() => {
                                      setEditingData((prev: any) => ({ ...prev, industry: ind }));
                                      setIndustryOpen(false);
                                      setCustomIndustry('');
                                    }}
                                    className="text-gray-900 dark:text-white cursor-pointer text-xs"
                                  >
                                    <Check className={cn("mr-2 h-3 w-3", (editingData.industry || company.industry) === ind ? "opacity-100" : "opacity-0")} />
                                    {ind}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-300 border border-transparent rounded px-1 py-0.5">{company.industry || "Not specified"}</span>
                    )}
                  </span>
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-xs font-medium text-blue-600 dark:text-blue-400 rounded flex items-center">
                    <Users className="w-3 h-3 mr-1" />
                    {renderEditableField('employeeCount', company.employeeCount, 'select', [
                      '1-10', '11-50', '51-100', '101-250', '251-500', '501-1000', '1000+'
                    ])}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Description */}
            {company.description && (
              <div className="mt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {renderEditableField('description', company.description, 'textarea')}
                </div>
              </div>
            )}
            
            {/* Additional Info Grid */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h5 className="font-medium text-gray-500 dark:text-gray-400 text-xs mb-1">Website</h5>
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <Globe className="w-3 h-3 mr-1.5 text-gray-400 flex-shrink-0" />
                  {editMode === 'profile' && isCompanyAdmin ? (
                    <span className="truncate">{renderEditableField('website', company.website, 'text')}</span>
                  ) : company.website ? (
                    <a
                      href={formatExternalUrl(company.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {company.website}
                    </a>
                  ) : (
                    <span className="truncate text-gray-400 dark:text-gray-500">—</span>
                  )}
                </div>
              </div>
              <div>
                <h5 className="font-medium text-gray-500 dark:text-gray-400 text-xs mb-1">Email</h5>
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <Mail className="w-3 h-3 mr-1.5 text-gray-400" />
                  <span className="truncate">{renderEditableField('email', company.email, 'text')}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h5 className="font-medium text-gray-500 dark:text-gray-400 text-xs mb-1">Founded</h5>
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <Calendar className="w-3 h-3 mr-1.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{renderEditableField('foundedYear', company.foundedYear, 'text')}</span>
                  </div>
                </div>
                {isAuthenticated && (
                  <button
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                    className="flex-shrink-0 mt-3"
                  >
                    <Heart className={cn(
                      "w-5 h-5 cursor-pointer transition-colors",
                      isFollowing
                        ? "text-red-500 fill-red-500"
                        : "text-gray-400 hover:text-red-500"
                    )} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Full Width Tab Section Below */}
        <div 
          ref={tabSectionRef}
          className="max-w-3xl mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md overflow-hidden"
        >
          <Tabs 
            defaultValue="products" 
            className="h-full flex flex-col"
          >
            {/* Tab Headers */}
            <div 
              ref={tabHeaderRef}
              className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 border-b border-gray-200 dark:border-gray-600 overflow-x-auto scrollbar-hide"
            >
              <TabsList className="bg-transparent inline-flex w-auto min-w-full">
                <TabsTrigger value="products" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 whitespace-nowrap flex-shrink-0">
                  Products {products && products.length > 0 && `(${products.length})`}
                </TabsTrigger>
                <TabsTrigger value="catalogues" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 whitespace-nowrap flex-shrink-0">
                  Catalogues and Documents {catalogues && catalogues.length > 0 && `(${catalogues.length})`}
                </TabsTrigger>
                {isCompanyAdmin && (
                  <TabsTrigger value="restricted-documents" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 whitespace-nowrap flex-shrink-0">
                    Company Restricted Documents
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Tab Contents */}
            <TabsContent value="products" className="p-6 min-h-[400px]">
              <div className="space-y-6">
                {/* Search Bar and Admin Actions */}
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        placeholder="Search products..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all duration-200"
                      />
                    </div>
                    {isCompanyAdmin && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setLocation(`/company/${id}/add-products-csv`)}
                          className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 shadow-sm transition-all duration-200 h-9"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                          Import Products
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setLocation(`/company/${id}/add-product`)}
                          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 h-9"
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          Add Product
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                
                {isLoadingProducts ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : products && products.length > 0 ? (
                  (() => {
                    let filteredProducts = products;
                    if (productSearchQuery.trim()) {
                      const query = productSearchQuery.toLowerCase().trim();
                      filteredProducts = filteredProducts
                        .filter(p =>
                          p.name.toLowerCase().includes(query) ||
                          (p.description && p.description.toLowerCase().includes(query)) ||
                          (p.category && p.category.toLowerCase().includes(query))
                        )
                        .sort((a, b) => {
                          const aName = a.name.toLowerCase();
                          const bName = b.name.toLowerCase();
                          const aStartsWith = aName.startsWith(query) ? 0 : 1;
                          const bStartsWith = bName.startsWith(query) ? 0 : 1;
                          if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
                          const aIncludes = aName.includes(query) ? 0 : 1;
                          const bIncludes = bName.includes(query) ? 0 : 1;
                          return aIncludes - bIncludes;
                        });
                    }

                    if (filteredProducts.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                          <Search className="w-12 h-12 mx-auto mb-4" />
                          <h4 className="text-lg font-medium mb-2">No Products Found</h4>
                          <p className="text-sm">Try a different search term to find what you're looking for.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="max-w-3xl mx-auto space-y-3">
                        {filteredProducts.map((product) => (
                          <div key={product.id} className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 relative">
                            {/* Top Right: Admin Buttons + Verified Badge */}
                            <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                              {/* Admin Edit/Delete Buttons */}
                              {isCompanyAdmin && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setLocation(`/company/${id}/edit-product/${product.id}`);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
                                    data-testid={`button-edit-product-${product.id}`}
                                    title="Edit product"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setProductToDelete(product);
                                      setShowDeleteConfirmation(true);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors shadow-sm"
                                    data-testid={`button-delete-product-${product.id}`}
                                    title="Delete product"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              
                              {/* Verified Badge */}
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
                            </div>
                            
                            <div className="flex items-start p-3 gap-3">
                              {/* Product Image */}
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
                              
                              {/* Product Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <h5 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
                                    {product.name}
                                    {selectedConfigs[product.id] && (
                                      <span className="text-purple-600 dark:text-purple-400"> — {selectedConfigs[product.id].name}</span>
                                    )}
                                  </h5>
                                  <ProductConfigDropdown
                                    productId={product.id}
                                    onSelectConfig={(config) => {
                                      setSelectedConfigs(prev => ({
                                        ...prev,
                                        [product.id]: config
                                      }));
                                    }}
                                  />
                                  {selectedConfigs[product.id] && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedConfigs(prev => {
                                          const next = { ...prev };
                                          delete next[product.id];
                                          return next;
                                        });
                                      }}
                                      className="text-gray-400 hover:text-red-500 transition-colors"
                                      title="Clear variant selection"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                
                                {/* Description */}
                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
                                  {product.description}
                                </p>
                                
                                {/* Category Badge */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                                    {product.category}
                                  </span>
                                </div>
                                
                                {/* Download Links Row */}
                                <div className="flex items-center gap-3">
                                  {/* Web Button */}
                                  {(() => {
                                    const configWebLink = selectedConfigs[product.id]?.webLink;
                                    const effectiveWebLink = configWebLink || product.productWebLink;
                                    return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className={`text-xs font-medium transition-colors ${
                                            effectiveWebLink
                                              ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer'
                                              : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                          }`}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (effectiveWebLink) {
                                              window.open(formatExternalUrl(effectiveWebLink), '_blank');
                                            }
                                          }}
                                          disabled={!effectiveWebLink}
                                        >
                                          Web{configWebLink ? ` (${selectedConfigs[product.id].name})` : ''}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs break-all">{effectiveWebLink ? effectiveWebLink : "No web link available"}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                    );
                                  })()}
                                  
                                  {/* DataSheet Button */}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        {(() => {
                                          const configDatasheet = selectedConfigs[product.id]?.datasheetPath;
                                          const datasheetPath = configDatasheet || product.catalogPath;
                                          return (
                                            <button
                                              className={`text-xs font-medium transition-colors ${
                                                datasheetPath
                                                  ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer'
                                                  : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                              }`}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (datasheetPath) {
                                                  window.open(datasheetPath, '_blank');
                                                }
                                              }}
                                              disabled={!datasheetPath}
                                            >
                                              DataSheet{selectedConfigs[product.id] ? ` (${selectedConfigs[product.id].name})` : ''}
                                            </button>
                                          );
                                        })()}
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">{(selectedConfigs[product.id]?.datasheetPath || product.catalogPath) ? "Download product technical specifications PDF" : "No datasheet available"}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  
                                  {/* Downloads Dropdown */}
                                  {(() => {
                                    const configModel = selectedConfigs[product.id]?.modelPath;
                                    const modelPath = configModel || product.modelPath;
                                    return ((product.documentPaths && product.documentPaths.length > 0) || modelPath) ? (
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
                                        {modelPath && (
                                          <DropdownMenuItem
                                            onSelect={() => {
                                              if (modelPath) window.open(modelPath, '_blank');
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <Box className="w-4 h-4 mr-2 text-blue-500" />
                                            <span>3D CAD Model (STEP){selectedConfigs[product.id] ? ` - ${selectedConfigs[product.id].name}` : ''}</span>
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
                                  )
                                  })()}
                                  
                                  {/* Heart Icon - Favorite Button */}
                                  <div className="ml-auto">
                                    <FavoriteButton type="product" id={product.id} className="p-1" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-4" />
                    <h4 className="text-lg font-medium mb-2">No Products Available</h4>
                    <p className="text-sm">This company hasn't published any products yet.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Catalogues Tab Content */}
            <TabsContent value="catalogues" className="p-6 min-h-[400px]">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Company Catalogues</h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Download product catalogues and documentation
                    </p>
                  </div>
                  {isCompanyAdmin && (
                    <Button size="sm" variant="outline" onClick={() => setIsAddingCatalogue(true)}>
                      <Upload className="w-3 h-3 mr-1" />
                      Add Documents
                    </Button>
                  )}
                </div>

                {isLoadingCatalogues ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : catalogues && catalogues.length > 0 ? (
                  <div className="space-y-2">
                    {catalogues.map((catalogue: any) => (
                      <div key={catalogue.id} className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg flex-shrink-0">
                            <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white truncate text-sm">{catalogue.name}</h4>
                            {catalogue.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{catalogue.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(catalogue.pdfPath, '_blank')}
                            className="text-xs h-8"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                          {isCompanyAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (confirm('Are you sure you want to delete this catalogue?')) {
                                  try {
                                    await apiRequest(`/api/catalogues/${catalogue.id}`, { method: 'DELETE' });
                                    queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}/catalogues`] });
                                    toast({
                                      title: "Catalogue Deleted",
                                      description: "Catalogue deleted successfully.",
                                    });
                                  } catch (error) {
                                    toast({
                                      title: "Delete Failed",
                                      description: "Failed to delete catalogue.",
                                      variant: "destructive",
                                    });
                                  }
                                }
                              }}
                              className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              data-testid={`button-delete-catalogue-${catalogue.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-400">No catalogues available</p>
                    {isCompanyAdmin && (
                      <Button size="sm" variant="outline" className="mt-4" onClick={() => setIsAddingCatalogue(true)}>
                        <Upload className="w-3 h-3 mr-1" />
                        Add Your First Catalogue
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Restricted Documents Tab Content */}
            <TabsContent value="restricted-documents" className="p-6 min-h-[400px]">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Company Restricted Documents</h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Internal documents for AI training purposes only - not available for download
                    </p>
                  </div>
                  {isCompanyAdmin && (
                    <Button size="sm" variant="outline" onClick={() => setIsAddingRestrictedDoc(true)}>
                      <Upload className="w-3 h-3 mr-1" />
                      Add Document
                    </Button>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      These documents are used exclusively for AI training
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      They are not downloadable by users and serve to enhance AI responses about your company and products.
                    </p>
                  </div>
                </div>

                {isLoadingRestrictedDocs ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : restrictedDocuments && restrictedDocuments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {restrictedDocuments.map((doc: any) => (
                      <div key={doc.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">{doc.name}</h4>
                            {doc.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">{doc.description}</p>
                            )}
                            {isCompanyAdmin && (
                              <div className="flex items-center gap-2 mt-3">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={async () => {
                                    if (confirm('Are you sure you want to delete this document?')) {
                                      try {
                                        await apiRequest(`/api/restricted-documents/${doc.id}`, { method: 'DELETE' });
                                        queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}/restricted-documents`] });
                                        toast({
                                          title: "Document Deleted",
                                          description: "Restricted document deleted successfully.",
                                        });
                                      } catch (error) {
                                        toast({
                                          title: "Delete Failed",
                                          description: "Failed to delete document.",
                                          variant: "destructive",
                                        });
                                      }
                                    }
                                  }}
                                  className="text-xs"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Lock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-400">No restricted documents available</p>
                    {isCompanyAdmin && (
                      <Button size="sm" variant="outline" className="mt-4" onClick={() => setIsAddingRestrictedDoc(true)}>
                        <Upload className="w-3 h-3 mr-1" />
                        Add Your First Restricted Document
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Company Assistant Modal */}
      {isChatOpen && company && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[80vh] relative">
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsChatOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <UnifiedChat
              context={{
                type: 'company' as const,
                sessionId: `company_${company.id}_${Date.now()}`,
                title: `Chat with ${company.name}`,
                subtitle: `Get answers about ${company.name}'s products and services`,
                data: { companyId: company.id, companyName: company.name }
              }}
              initialMessage={`Hi! I'm the AI assistant for ${company.name}.

Ask me about products, services, capabilities, and more.`}
              className="h-full"
              showHeader={true}
              maxHeight="calc(80vh - 100px)"
              placeholder={`Ask me anything about ${company.name}...`}
            />
          </div>
        </div>
      )}

      {/* 3D Model Viewer Modal */}
      {show3DViewer && selectedProduct?.modelPath && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-4xl h-[80vh]">
            <ModelViewer
              modelPath={selectedProduct.modelPath}
              onClose={() => setShow3DViewer(false)}
            />
          </div>
        </div>
      )}
      </div>
      
      
      {/* Add Catalogue Modal */}
      {isAddingCatalogue && (
        <AddCatalogueModal
          isOpen={isAddingCatalogue}
          onClose={() => setIsAddingCatalogue(false)}
          companyId={id!}
          onCatalogueAdded={() => {
            setIsAddingCatalogue(false);
            queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}/catalogues`] });
          }}
        />
      )}

      {/* Add Restricted Document Modal */}
      {isAddingRestrictedDoc && (
        <AddRestrictedDocumentModal
          isOpen={isAddingRestrictedDoc}
          onClose={() => setIsAddingRestrictedDoc(false)}
          companyId={id!}
          onDocumentAdded={() => {
            setIsAddingRestrictedDoc(false);
            queryClient.invalidateQueries({ queryKey: [`/api/companies/${id}/restricted-documents`] });
          }}
        />
      )}

      {/* Delete Product Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              Delete Product
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete <span className="font-semibold">{productToDelete?.name}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProduct}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="confirm-delete-product"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Product'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}