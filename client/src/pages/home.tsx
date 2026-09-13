import { useState, useEffect, useRef } from "react";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Box, Users, Bot, Sparkles, Factory, Building2, Cog, FlaskConical, Zap, ChevronRight, ChevronDown, Heart, Package, ArrowRight, MapPin, X, Send, Download, Target, Lightbulb, Brain, Rocket, Shield, Globe, Star, Newspaper, TrendingUp, Eye, FileText, Layers, Pill, Settings, Droplet, Plane, Wheat, Mountain, Cpu, Battery, Car, Code, Ship, GraduationCap, CircuitBoard, Box as Box3d, UserPlus, Mail, BadgeCheck, AlertCircle, Gauge, History, ArrowUp, Calculator, GitCompare } from "lucide-react";
import { useCardPromptTyping } from "@/features/deepsearch/hooks/use-card-prompt-typing";
import ChatHistorySidebar from "@/components/chat/ChatHistorySidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedbackChatContext } from "@/contexts/FeedbackChatContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn, formatExternalUrl } from "@/lib/utils";
import GlobalSearch from "@/components/search/global-search";
import SearchFilters, { SearchFilters as SearchFiltersType } from "@/components/search/search-filters";
import SearchAnalytics from "@/components/search/search-analytics";
import SearchHighlight from "@/components/search/search-highlight";
import ProductPreview from "@/components/models/ProductPreview";
import { applySearchFilters, sortByRelevance } from "@/utils/search-utils";
import { useToast } from "@/hooks/use-toast";
import deepFolderLogo from "@assets/logo_DeepFolder_1760649570860.png";

// Define interfaces
interface Company {
  id: number;
  name: string;
  industry: string;
  description: string;
  location: string;
  colorTheme: string;
  employeeCount?: string;
  logoPath?: string;
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
}

interface SearchResult {
  companies: Company[];
  products: Product[];
}

interface AISearchMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  suggestions?: string[];
  searchResults?: SearchResult;
}

// Typing animation component with markdown link support
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

  // Render message content with clickable links
  const renderWithLinks = (text: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      
      const [, linkText, linkPath] = match;
      parts.push(
        <Link 
          key={match.index} 
          href={linkPath}
          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
        >
          {linkText}
        </Link>
      );
      
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return <>{renderWithLinks(displayedText)}</>;
}

const PROMPT_THEMES: Record<string, { bg: string; border: string; iconBg: string }> = {
  blue:    { bg: "from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20",          border: "border-blue-200/50 dark:border-blue-800/50",       iconBg: "from-blue-500 to-blue-600" },
  purple:  { bg: "from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20",  border: "border-purple-200/50 dark:border-purple-800/50",   iconBg: "from-purple-500 to-purple-600" },
  amber:   { bg: "from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20",      border: "border-amber-200/50 dark:border-amber-800/50",     iconBg: "from-amber-500 to-amber-600" },
  teal:    { bg: "from-teal-50 to-teal-100/50 dark:from-teal-950/30 dark:to-teal-900/20",          border: "border-teal-200/50 dark:border-teal-800/50",       iconBg: "from-teal-500 to-teal-600" },
  slate:   { bg: "from-slate-50 to-slate-100/50 dark:from-slate-950/30 dark:to-slate-900/20",      border: "border-slate-200/50 dark:border-slate-800/50",     iconBg: "from-slate-500 to-slate-600" },
  green:   { bg: "from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20",      border: "border-green-200/50 dark:border-green-800/50",     iconBg: "from-green-500 to-green-600" },
  red:     { bg: "from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20",              border: "border-red-200/50 dark:border-red-800/50",         iconBg: "from-red-500 to-red-600" },
  rose:    { bg: "from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20",          border: "border-rose-200/50 dark:border-rose-800/50",       iconBg: "from-rose-500 to-rose-600" },
  emerald: { bg: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20", border: "border-emerald-200/50 dark:border-emerald-800/50", iconBg: "from-emerald-500 to-emerald-600" },
  sky:     { bg: "from-sky-50 to-sky-100/50 dark:from-sky-950/30 dark:to-sky-900/20",              border: "border-sky-200/50 dark:border-sky-800/50",         iconBg: "from-sky-500 to-sky-600" },
  cyan:    { bg: "from-cyan-50 to-cyan-100/50 dark:from-cyan-950/30 dark:to-cyan-900/20",          border: "border-cyan-200/50 dark:border-cyan-800/50",       iconBg: "from-cyan-500 to-cyan-600" },
  indigo:  { bg: "from-indigo-50 to-indigo-100/50 dark:from-indigo-950/30 dark:to-indigo-900/20",  border: "border-indigo-200/50 dark:border-indigo-800/50",   iconBg: "from-indigo-500 to-indigo-600" },
  violet:  { bg: "from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20",  border: "border-violet-200/50 dark:border-violet-800/50",   iconBg: "from-violet-500 to-violet-600" },
  orange:  { bg: "from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20",  border: "border-orange-200/50 dark:border-orange-800/50",   iconBg: "from-orange-500 to-orange-600" },
  lime:    { bg: "from-lime-50 to-lime-100/50 dark:from-lime-950/30 dark:to-lime-900/20",          border: "border-lime-200/50 dark:border-lime-800/50",       iconBg: "from-lime-500 to-lime-600" },
  fuchsia: { bg: "from-fuchsia-50 to-fuchsia-100/50 dark:from-fuchsia-950/30 dark:to-fuchsia-900/20", border: "border-fuchsia-200/50 dark:border-fuchsia-800/50", iconBg: "from-fuchsia-500 to-fuchsia-600" },
  yellow:  { bg: "from-yellow-50 to-yellow-100/50 dark:from-yellow-950/30 dark:to-yellow-900/20",  border: "border-yellow-200/50 dark:border-yellow-800/50",   iconBg: "from-yellow-500 to-yellow-600" },
  pink:    { bg: "from-pink-50 to-pink-100/50 dark:from-pink-950/30 dark:to-pink-900/20",          border: "border-pink-200/50 dark:border-pink-800/50",       iconBg: "from-pink-500 to-pink-600" },
};

const INDUSTRY_EXAMPLES: Array<{ name: string; icon: any; color: keyof typeof PROMPT_THEMES; searchPrompt: string; buildPrompt: string; calculationPrompt: string; comparisonPrompt: string }> = [
  { name: "Mechanical & Industrial",       icon: Cog,           color: "blue",    searchPrompt: "Find SKF 6206-2Z bearing, 30 mm bore, C3 clearance, 3000 RPM",                                       buildPrompt: "Design a roller conveyor for 50 kg/m at 0.5 m/s with guarding",                                         calculationPrompt: "Calculate radial load rating for a ball bearing at 3000 RPM, L10 = 20 000 h",                      comparisonPrompt: "Compare 6206 vs 6306 bearing for radial load capacity at 3000 RPM" },
  { name: "Automation & Robotics",         icon: Bot,           color: "purple",  searchPrompt: "Find UR10e cobot, 10 kg payload, ±0.05 mm repeatability",                                            buildPrompt: "Specify a pick-and-place cell with 6 kg cobot, 2D vision, 30 cycles/min",                               calculationPrompt: "Calculate cycle time for pick-and-place with 400 mm travel at 2 m/s",                              comparisonPrompt: "Compare UR10e vs FANUC CRX-10iA payload and reach envelope" },
  { name: "Electronics & Sensors",         icon: CircuitBoard,  color: "amber",   searchPrompt: "Find PT100 RTD sensor, –50 to +200 °C, Modbus RTU, IP67",                                           buildPrompt: "Design a wireless PT100 monitoring kit for 10 cold-storage rooms, 4–20 mA",                             calculationPrompt: "Calculate 4–20 mA loop resistance for 24 V supply over 50 m cable",                               comparisonPrompt: "Compare PT100 vs Type-K thermocouple accuracy at –50 to +200 °C" },
  { name: "Additive Manufacturing",        icon: Package,       color: "teal",    searchPrompt: "Source EOS M 290 SLM, AlSi10Mg powder, ≥ 99.7 % density",                                           buildPrompt: "Specify a metal SLM workflow for AlSi10Mg brackets under 200 × 200 × 200 mm",                           calculationPrompt: "Calculate support volume and build time for a 150 mm AlSi10Mg bracket",                            comparisonPrompt: "Compare SLM vs DMLS for AlSi10Mg part density and surface roughness" },
  { name: "Materials & Metallurgy",        icon: Layers,        color: "slate",   searchPrompt: "Source 42CrMo4 +QT bar stock, Ø60 mm, EN 10083-3, HB 280–320",                                      buildPrompt: "Design a heat-treatment line for 42CrMo4 shafts Ø80 mm, quench + temper",                              calculationPrompt: "Calculate fatigue safety factor for 42CrMo4 shaft at 500 N·m alternating torque",                 comparisonPrompt: "Compare 42CrMo4 vs 17-4 PH for yield strength and corrosion resistance" },
  { name: "Energy & Renewables",           icon: Battery,       color: "green",   searchPrompt: "Find SMA Sunny Tripower 100-60, 100 kW, 3-phase, 50 Hz, IP65",                                      buildPrompt: "Design a 100 kW rooftop solar plant with BESS and grid feed-in metering",                               calculationPrompt: "Calculate string configuration for 400 W panels on a 100 kW inverter",                             comparisonPrompt: "Compare SMA Tripower vs Fronius Eco for 100 kW efficiency and MPPT" },
  { name: "Mobility & EV Systems",         icon: Car,           color: "red",     searchPrompt: "Find a permanent magnet motor, 80 kW peak, 400 V DC, IP67, liquid cooled",                           buildPrompt: "Specify an EV powertrain for 1500 kg vehicle: motor, inverter, BMS, 250 km range",                      calculationPrompt: "Calculate motor torque and gear ratio for 1500 kg vehicle, 0–100 km/h in 8 s",                    comparisonPrompt: "Compare LFP vs NMC battery chemistry for 250 km EV range and cycle life" },
  { name: "Medical Devices",               icon: Heart,         color: "rose",    searchPrompt: "Source 316L surgical-grade stainless tube, OD 8 mm, Ra ≤ 0.4 µm, ISO 5832-1",                       buildPrompt: "Specify a portable patient monitor: ECG, SpO₂, NIBP, BLE 5.0, IEC 60601-1",                            calculationPrompt: "Calculate heat dissipation for a portable monitor powered by 3.7 V Li-ion, 8 h",                  comparisonPrompt: "Compare 316L vs Ti-6Al-4V for surgical implant biocompatibility and fatigue" },
  { name: "Construction & Infrastructure", icon: Building2,     color: "emerald", searchPrompt: "Source Rockwool Frontrock MAX E, 100 mm, λ = 0.036 W/mK, A2-s1,d0",                               buildPrompt: "Design a smart BMS for 5-floor office: CO₂, occupancy, HVAC scheduling, BACnet",                        calculationPrompt: "Calculate U-value for a facade with 100 mm mineral wool and brick cladding",                       comparisonPrompt: "Compare mineral wool vs PIR board for thermal and fire performance" },
  { name: "Aerospace & Defense",           icon: Plane,         color: "sky",     searchPrompt: "Source NAS1097AD4-3 blind rivet, A286 alloy, AS9100D certified",                                    buildPrompt: "Specify a UAV propulsion module: 25 kg MTOW, 60 min, brushless + ESC + BEC",                            calculationPrompt: "Calculate prop size and motor KV for a 25 kg UAV at 60 min hover endurance",                      comparisonPrompt: "Compare Inconel 718 vs Ti-6Al-4V for turbine blade fatigue at 600 °C" },
  { name: "Pharma / Biotech",              icon: Pill,          color: "cyan",    searchPrompt: "Find Quattroflow 1200 diaphragm pump, FDA 21 CFR 177.2600, 3-A certified",                          buildPrompt: "Specify a benchtop bioreactor: 10 L, pH/DO cascade control, CIP/SIP, GMP",                             calculationPrompt: "Calculate pump flow rate and pressure drop for a 10 L/h aseptic transfer line",                    comparisonPrompt: "Compare single-use bioreactor bags vs glass vessels for GMP batch production" },
  { name: "AI & Digital Twin",             icon: Cpu,           color: "indigo",  searchPrompt: "Find PTC ThingWorx Edge, OPC-UA, MQTT, <10 ms latency industrial gateway",                         buildPrompt: "Design an IoT data-acquisition kit for hydraulic press: vibration, pressure, PLC sync",                 calculationPrompt: "Calculate sensor sampling rate needed to detect 50 Hz bearing fault frequency",                    comparisonPrompt: "Compare OPC-UA vs MQTT for latency and payload size in industrial IoT" },
  { name: "Industrial Software",           icon: Code,          color: "violet",  searchPrompt: "Find Siemens S7-1500 PLC, TIA Portal V17, Profinet, 2 ms cycle time",                              buildPrompt: "Architect a SCADA + S7-1500 PLC solution for 12-line bottling plant, OEE dashboards",                  calculationPrompt: "Calculate PLC scan time budget for 400 I/O points at 2 ms cycle, 30 % spare",                    comparisonPrompt: "Compare Siemens S7-1500 vs Allen-Bradley 5580 for throughput and ecosystem" },
  { name: "Mining, Oil & Gas",             icon: Droplet,       color: "orange",  searchPrompt: "Source Dräger REGARD 3900 gas controller, ATEX Zone 1, Ex d IIC T6 Gb",                            buildPrompt: "Design an ATEX Zone 1 gas-detection system for crude oil refinery section, SIL 2",                      calculationPrompt: "Calculate detector spacing for LEL coverage in a 50 × 30 m open-process area",                    comparisonPrompt: "Compare catalytic bead vs infrared gas detectors for CH₄ in Zone 1 environments" },
  { name: "Food & Beverage",               icon: Wheat,         color: "lime",    searchPrompt: "Source Festo DHTG IP69K rotary actuator, 316L, EHEDG-certified, 90°",                              buildPrompt: "Specify a dairy pasteurization skid: 2000 L/h, 72 °C / 15 s, CIP-ready, 3-A",                          calculationPrompt: "Calculate heat duty and steam flow for pasteurizing 2000 L/h milk at 72 °C",                      comparisonPrompt: "Compare plate heat exchanger vs tubular for dairy pasteurization CIP-ability" },
  { name: "Chemicals & Process",           icon: FlaskConical,  color: "fuchsia", searchPrompt: "Source Chemours Viton® FKM sheet gasket, 3 mm, PN16, 95% H₂SO₄ rated",                            buildPrompt: "Design a corrosion-resistant pump skid for 95% H₂SO₄ at 80 °C, ATEX Zone 2",                           calculationPrompt: "Calculate pipe wall thickness for 95% H₂SO₄ at 10 bar using ASME B31.3",                         comparisonPrompt: "Compare PVDF vs lined carbon steel for 95% H₂SO₄ pipe at 80 °C" },
  { name: "Agriculture & Smart Farming",   icon: Wheat,         color: "yellow",  searchPrompt: "Find Dragino LHT65 LoRaWAN sensor, soil moisture + temp, IP67, 10-year battery",                    buildPrompt: "Design a LoRaWAN irrigation control for 50 ha: 200 sensors, edge gateway, auto-dosing",                 calculationPrompt: "Calculate LoRa link budget and node density for 50 ha flat terrain at 868 MHz",                   comparisonPrompt: "Compare LoRaWAN vs NB-IoT for battery life and coverage in open farmland" },
  { name: "Maritime & Offshore",           icon: Ship,          color: "blue",    searchPrompt: "Source Liebherr RL-K 3000 offshore crane, SWL 30 t, DNV-ST-0378, ATEX Zone 2",                     buildPrompt: "Specify a deck-crane control system: heave compensation, anti-sway, DNV-ST-0378 PLC",                   calculationPrompt: "Calculate dynamic load factor for 30 t lift at sea state 4 per DNV-ST-0378",                      comparisonPrompt: "Compare electro-hydraulic vs full-electric offshore crane drives for energy recovery" },
  { name: "Education & Research",          icon: GraduationCap, color: "pink",    searchPrompt: "Find Fischertechnik 500 pcs mechatronics kit, university-grade, EN 71 compliant",                    buildPrompt: "Design a desktop CNC mini-lab for engineering courses: 3-axis, 300 × 300 mm, enclosure",                calculationPrompt: "Calculate spindle power needed to mill 6061-Al at 10 000 RPM, 1 mm DOC, 500 mm/min",             comparisonPrompt: "Compare open-loop stepper vs closed-loop servo for desktop CNC positioning accuracy" },
];

type PromptMode = 'search' | 'build' | 'calculate' | 'compare';

interface IndustryCardProps {
  industry: typeof INDUSTRY_EXAMPLES[number];
  index: number;
  promptMode: PromptMode;
  enabled: boolean;
  onNavigate: (url: string) => void;
}

function IndustryCard({ industry, index, promptMode, enabled, onNavigate }: IndustryCardProps) {
  const theme = PROMPT_THEMES[industry.color];
  const Icon = industry.icon;
  const prompt =
    promptMode === 'search'      ? industry.searchPrompt :
    promptMode === 'build'       ? industry.buildPrompt :
    promptMode === 'calculate'   ? industry.calculationPrompt :
                                   industry.comparisonPrompt;

  const { displayed } = useCardPromptTyping(prompt, enabled);

  return (
    <button
      type="button"
      onClick={() => onNavigate(`/deepsearch?q=${encodeURIComponent(prompt)}`)}
      className={cn(
        "group relative rounded-xl p-4 border hover:shadow-lg transition-all duration-300 text-left bg-gradient-to-br",
        theme.bg,
        theme.border
      )}
      data-testid={`card-prompt-${index}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg bg-gradient-to-br",
          theme.iconBg
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm text-gray-900 dark:text-white mb-1">{industry.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 italic min-h-[2.5rem]">
            "{displayed}<span className="animate-pulse">|</span>"
          </p>
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [query, setQuery] = useState("");
  const [isAIMode, setIsAIMode] = useState(false);
  const [promptMode, setPromptMode] = useState<'search' | 'build' | 'calculate' | 'compare'>('search');
  const [showAllIndustries, setShowAllIndustries] = useState(false);
  const [aiMessages, setAiMessages] = useState<AISearchMessage[]>([]);
  const [aiQuery, setAiQuery] = useState("");
  const { setFirstChatPrompt } = useFeedbackChatContext();

  // Keep FeedbackChatContext in sync with the first user message of the active chat.
  // Clear on unmount so navigating away never leaks stale context.
  useEffect(() => {
    const first = aiMessages.find((m) => m.isUser);
    setFirstChatPrompt(first ? first.content : null);
    return () => setFirstChatPrompt(null);
  }, [aiMessages, setFirstChatPrompt]);

  // Chat history sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const { user } = useAuth();

  // Hero scroll affordance fade
  const [heroPassed, setHeroPassed] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = heroRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      const onScroll = () => {
        const rect = node.getBoundingClientRect();
        setHeroPassed(rect.bottom <= 80);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener('scroll', onScroll);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setHeroPassed(!entry.isIntersecting),
      { threshold: 0, rootMargin: '0px 0px -80px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const [isAILoading, setIsAILoading] = useState(false);
  const [isFullscreenChat, setIsFullscreenChat] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [filteredResults, setFilteredResults] = useState<SearchResult>({ companies: [], products: [] });
  const [searchFilters, setSearchFilters] = useState<SearchFiltersType>({
    sortBy: 'relevance',
    sortOrder: 'desc',
    industries: [],
    locations: [],
    companySize: [],
    productCategories: [],
    hasModels: false,
    hasCatalogs: false,
    hasDatasheets: false,
  });
  const [previewItem, setPreviewItem] = useState<{ type: 'company' | 'product', data: Company | Product } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Inline discovery states
  const [showInlineResults, setShowInlineResults] = useState(false);
  const [inlineResultsType, setInlineResultsType] = useState<'companies' | 'products' | null>(null);
  const [aiRecommendedCompanies, setAiRecommendedCompanies] = useState<(Company & { score: number; aiReason: string })[]>([]);
  const [aiRecommendedProducts, setAiRecommendedProducts] = useState<(Product & { score: number; aiReason: string })[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inlineResultsRef = useRef<HTMLDivElement>(null);
  const aiChatContainerRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-scroll to bottom when new messages are added or when typing
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll to position AI chat in middle of screen when activated
  const scrollToAIChat = () => {
    if (aiChatContainerRef.current) {
      const rect = aiChatContainerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const elementTop = window.pageYOffset + rect.top;
      const elementHeight = rect.height;
      
      // Mobile-optimized scroll positioning
      const isMobile = window.innerWidth < 768; // md breakpoint
      
      let scrollPosition;
      if (isMobile) {
        // On mobile, position AI chat higher on screen for better visibility
        // Account for mobile keyboard space and touch interactions
        scrollPosition = elementTop - (viewportHeight * 0.15); // Position at 15% from top
      } else {
        // Desktop: center the AI chat interface
        scrollPosition = elementTop - (viewportHeight - elementHeight) / 2;
      }
      
      window.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: 'smooth'
      });
    }
  };

  // Handle input focus on mobile - scroll chat to optimal position when keyboard appears
  const handleInputFocus = () => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && aiChatContainerRef.current) {
      // Delay to allow keyboard to appear first
      setTimeout(() => {
        if (aiChatContainerRef.current) {
          const rect = aiChatContainerRef.current.getBoundingClientRect();
          const elementTop = window.pageYOffset + rect.top;
          
          // Position chat at top with small margin when keyboard is open
          // This ensures the input field and recent messages are visible above the keyboard
          const scrollPosition = elementTop - 80; // 80px from top for better visibility
          
          window.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: 'smooth'
          });
        }
      }, 300); // Delay for keyboard animation
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages, isAILoading]);

  // Also scroll when user starts typing
  useEffect(() => {
    if (aiQuery.length > 0) {
      scrollToBottom();
    }
  }, [aiQuery]);

  // Auto-scroll to center AI chat when AI mode is activated
  useEffect(() => {
    if (isAIMode && aiChatContainerRef.current) {
      // Longer delay for mobile to ensure smooth transition and component rendering
      const isMobile = window.innerWidth < 768;
      const delay = isMobile ? 400 : 100;
      
      setTimeout(() => {
        scrollToAIChat();
      }, delay);
    }
  }, [isAIMode]);

  // Removed animated background elements for clean white background

  // Fetch companies for featured section
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  // Perform search when query changes
  const { data: queryResults, isLoading: searchLoading } = useQuery({
    queryKey: [`/api/search?q=${encodeURIComponent(query)}`],
    enabled: !!query && query.length >= 2 && !isAIMode,
  });

  useEffect(() => {
    if (queryResults && !isAIMode && query.length >= 2) {
      console.log('Setting search results:', queryResults);
      setSearchResults(queryResults as SearchResult);
    }
  }, [queryResults, isAIMode, query]);

  // Apply filters to search results
  useEffect(() => {
    if (searchResults) {
      console.log('Applying filters to search results:', searchResults);
      const filtered = applySearchFilters(searchResults, searchFilters);
      console.log('Filtered results:', filtered);
      setFilteredResults(filtered);
    } else {
      setFilteredResults({ companies: [], products: [] });
    }
  }, [searchResults, searchFilters]);

  // Clear results when switching modes or clearing query
  useEffect(() => {
    if (!query || query.length < 2 || isAIMode) {
      console.log('Clearing search results, query:', query, 'isAIMode:', isAIMode);
      setSearchResults(null);
      setFilteredResults({ companies: [], products: [] });
    }
  }, [query, isAIMode]);

  // Handle hash navigation for scrolling to sections (e.g., #deepsearch-examples)
  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash;
      if (hash) {
        // Small delay to ensure DOM is fully rendered
        const scrollToElement = () => {
          const elementId = hash.replace('#', '');
          const element = document.getElementById(elementId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Clear the hash after scrolling to prevent re-scrolling on re-renders
            window.history.replaceState(null, '', window.location.pathname);
          }
        };
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          setTimeout(scrollToElement, 100);
        });
      }
    };

    // Run on initial mount
    scrollToHash();

    // Also listen for hash changes (for navigation from other pages)
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  // Ocean-inspired gradient colors matching the new theme
  const productGradients = [
    "from-blue-600 via-blue-500 to-cyan-400",         // Deep ocean blue to cyan
    "from-purple-600 via-indigo-500 to-blue-400",     // Purple to blue wave
    "from-teal-600 via-cyan-500 to-blue-300",         // Teal ocean flow
    "from-indigo-600 via-purple-500 to-pink-400",     // Deep indigo to pink
    "from-slate-600 via-blue-500 to-cyan-300",        // Slate to cyan depth
    "from-cyan-600 via-teal-500 to-emerald-400",      // Cyan to emerald
    "from-blue-700 via-indigo-500 to-purple-400",     // Navy to purple
    "from-teal-700 via-blue-500 to-indigo-400"        // Dark teal flow
  ];

  const themeColors = {
    blue: productGradients[0],
    purple: productGradients[1], 
    green: productGradients[2],
    red: productGradients[3],
    yellow: productGradients[4],
    indigo: productGradients[5],
  };

  const themeIcons = {
    blue: Factory,
    purple: Building2,
    green: Cog,
    red: FlaskConical,
    yellow: Zap,
    indigo: Bot,
  };

  const handleAIResults = (messages: AISearchMessage[]) => {
    // If we get an empty array but have a query, it means a search was triggered from GlobalSearch
    if (messages.length === 0 && query.trim()) {
      handleAISearch(query);
      setQuery(''); // Clear the query after starting search
    } else {
      setAiMessages(messages);
    }
  };

  // Preview functions
  const handlePreviewCompany = async (company: Company) => {
    setPreviewLoading(true);
    try {
      // Fetch complete company data
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
      // Fetch complete product data
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

  const clearPreview = () => {
    setPreviewItem(null);
  };

  // Function to render message content with clickable links (same as personal assistant)
  const renderMessageContent = (content: string) => {
    // Regular expression to match markdown-style links: [text](/path)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      
      // Add the clickable link
      const [, linkText, linkPath] = match;
      parts.push(
        <Link 
          key={match.index} 
          href={linkPath}
          className="text-blue-500 hover:text-blue-700 underline cursor-pointer"
        >
          {linkText}
        </Link>
      );
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last link
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    // If no links were found, return the original content
    return parts.length > 0 ? parts : content;
  };

  // Chat history handlers
  const handleNewChat = () => {
    setActiveSessionId(null);
    setAiMessages([]);
    setAiQuery("");
    setIsSidebarOpen(false);
  };

  const handleSelectSession = async (sessionId: number) => {
    setActiveSessionId(sessionId);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`);
      if (response.ok) {
        const messages = await response.json();
        const formattedMessages: AISearchMessage[] = messages.map((msg: any) => ({
          id: msg.id.toString(),
          content: msg.content,
          isUser: msg.isUser,
          timestamp: new Date(msg.createdAt),
          suggestions: msg.suggestions || [],
          searchResults: msg.searchResults || undefined,
        }));
        setAiMessages(formattedMessages);
        setIsAIMode(true);
        setIsFullscreenChat(true);
      }
    } catch (error) {
      console.error('Error loading session messages:', error);
    }
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (deletedSessionId: number) => {
    if (activeSessionId === deletedSessionId) {
      setActiveSessionId(null);
      setAiMessages([]);
      setAiQuery("");
    }
  };

  // Helper to save message to session
  const saveMessageToSession = async (sessionId: number, message: AISearchMessage) => {
    if (!user) {
      console.log("saveMessageToSession: No user, skipping save");
      return;
    }
    console.log("saveMessageToSession: Saving message to session", sessionId, message.content.slice(0, 50));
    try {
      const result = await apiRequest(`/api/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: message.content,
          isUser: message.isUser,
          searchResults: message.searchResults || null,
          suggestions: message.suggestions || null,
        }),
      });
      console.log("saveMessageToSession: Message saved successfully", result);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
    } catch (error) {
      console.error("Error saving message to session:", error);
    }
  };

  // AI Search functionality
  const handleAISearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsAILoading(true);
    
    // Create session if user is logged in and no active session
    let currentSessionId = activeSessionId;
    if (user && !currentSessionId) {
      try {
        const newSession = await apiRequest("/api/chat/sessions", {
          method: "POST",
          body: JSON.stringify({ title: searchQuery.slice(0, 50) }),
        });
        currentSessionId = newSession.id;
        setActiveSessionId(newSession.id);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      } catch (error) {
        console.error("Error creating chat session:", error);
      }
    }
    
    // Add user message
    const userMessage: AISearchMessage = {
      id: Date.now().toString(),
      content: searchQuery,
      isUser: true,
      timestamp: new Date()
    };
    
    setAiMessages(prev => [...prev, userMessage]);
    
    // Save user message to session
    if (currentSessionId) {
      saveMessageToSession(currentSessionId, userMessage);
    }
    
    // Activate fullscreen chat mode
    setIsFullscreenChat(true);
    
    // Scroll to bottom when user sends message
    setTimeout(scrollToBottom, 100);
    
    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      });
      
      if (!response.ok) {
        throw new Error(`AI search failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Add AI response message
      const aiMessage: AISearchMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date(),
        searchResults: data.searchResults
      };
      
      setAiMessages(prev => [...prev, aiMessage]);
      
      // Save AI response to session
      if (currentSessionId) {
        saveMessageToSession(currentSessionId, aiMessage);
      }
      
      // Scroll to bottom after AI response
      setTimeout(scrollToBottom, 100);
      
    } catch (error) {
      console.error('AI search error:', error);
      
      // Add error message
      const errorMessage: AISearchMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        isUser: false,
        timestamp: new Date()
      };
      
      setAiMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAILoading(false);
    }
  };

  const showDefaultContent = (!query || query.length < 2 || (isAIMode && !aiMessages.length)) && !showInlineResults;
  const showSearchResults = !isAIMode && query.length >= 2 && searchResults && !showInlineResults;
  const showAIResults = isAIMode && aiMessages.length > 0 && !showInlineResults;

  // Fetch all companies and products for AI recommendations
  const { data: allCompanies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: allProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Create company lookup map for quick access (for product Brand display)
  const companyMap = new Map<number, Company>();
  (allCompanies || []).forEach(company => {
    companyMap.set(company.id, company);
  });

  console.log('Display logic:', {
    query: query,
    queryLength: query.length,
    isAIMode,
    searchResults: !!searchResults,
    showDefaultContent,
    showSearchResults,
    showAIResults,
    showInlineResults,
    inlineResultsType
  });

  // Generate AI recommendations for inline display
  const generateInlineAIRecommendations = (type: 'companies' | 'products') => {
    const userPreferences = {
      searchHistory: ['CNC', 'automation', 'robotics', 'manufacturing'],
      viewedCategories: ['Manufacturing Equipment', 'Robotics & Automation', 'Precision Tools'],
      industryInterests: ['Technology', 'Manufacturing', 'Automotive'],
      locationPreferences: ['Germany', 'United States', 'Japan'],
      recentlyViewed: ['precision-cnc', 'industrial-robot', 'automation-system']
    };

    if (type === 'companies' && allCompanies) {
      const scoredCompanies = allCompanies.map(company => {
        let score = 0;
        let reasons = [];
        
        // Industry preference
        if (userPreferences.industryInterests.some(interest => 
          company.industry.toLowerCase().includes(interest.toLowerCase())
        )) {
          score += 1.5;
          reasons.push('industry interest');
        }
        
        // Location preference  
        if (userPreferences.locationPreferences.some(loc =>
          company.location.toLowerCase().includes(loc.toLowerCase())
        )) {
          score += 0.8;
          reasons.push('preferred location');
        }
        
        // Trending industries boost
        if (['AI & Manufacturing Technology', 'Robotics & Automation', 'Technology'].includes(company.industry)) {
          score += 1;
          reasons.push('trending industry');
        }
        
        // Random baseline score to show variety
        score += Math.random() * 0.5;
        
        return {
          ...company,
          score,
          aiReason: reasons.length > 0 ? `AI picked: ${reasons.join(', ')}` : 'Similar to your interests'
        };
      }).filter(company => company.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      
      setAiRecommendedCompanies(scoredCompanies);
    }
    
    if (type === 'products' && allProducts) {
      const scoredProducts = allProducts.map(product => {
        let score = 0;
        let reasons = [];
        
        // Category preference
        if (userPreferences.viewedCategories.some(category =>
          product.category.toLowerCase().includes(category.toLowerCase())
        )) {
          score += 1.5;
          reasons.push('category match');
        }
        
        // Search history match
        if (userPreferences.searchHistory.some(term =>
          product.name.toLowerCase().includes(term.toLowerCase()) ||
          product.description.toLowerCase().includes(term.toLowerCase())
        )) {
          score += 1.2;
          reasons.push('search history');
        }
        
        // Has CAD/3D models boost
        if (product.modelPath) {
          score += 0.8;
          reasons.push('3D models available');
        }
        
        // Has catalog boost
        if (product.catalogPath) {
          score += 0.5;
          reasons.push('catalog available');
        }
        
        // Random baseline score to show variety
        score += Math.random() * 0.5;
        
        return {
          ...product,
          score,
          aiReason: reasons.length > 0 ? `AI picked: ${reasons.join(', ')}` : 'Similar to your interests'
        };
      }).filter(product => product.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      
      setAiRecommendedProducts(scoredProducts);
    }
  };

  // Handle inline discovery
  const handleDiscoverCompanies = () => {
    setShowInlineResults(true);
    setInlineResultsType('companies');
    generateInlineAIRecommendations('companies');
    
    // Scroll to results after a brief delay
    setTimeout(() => {
      if (inlineResultsRef.current) {
        inlineResultsRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleExploreProducts = () => {
    setShowInlineResults(true);
    setInlineResultsType('products');
    generateInlineAIRecommendations('products');
    
    // Scroll to results after a brief delay
    setTimeout(() => {
      if (inlineResultsRef.current) {
        inlineResultsRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Clear inline results
  const clearInlineResults = () => {
    setShowInlineResults(false);
    setInlineResultsType(null);
    setAiRecommendedCompanies([]);
    setAiRecommendedProducts([]);
  };

  // Compute if results panel should be visible based on latest AI message with search results
  const latestResultsMessage = [...aiMessages].reverse().find(m => m.searchResults && (m.searchResults.companies?.length > 0 || m.searchResults.products?.length > 0));
  const hasResultsPanel = isFullscreenChat && latestResultsMessage?.searchResults && 
    ((latestResultsMessage.searchResults.companies?.length || 0) > 0 || (latestResultsMessage.searchResults.products?.length || 0) > 0);

  return (
    <div className="relative min-h-screen modern-4k-background">
      {/* Fullscreen Chat Overlay */}
      {isFullscreenChat && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">DeepSearch</h2>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">AI Powered Discovery</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {user && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Chat History"
                >
                  <History className="w-5 h-5" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsFullscreenChat(false)}
                className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </header>

          {/* Chat History Sidebar */}
          {user && (
            <ChatHistorySidebar
              isOpen={isSidebarOpen}
              onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {/* Main Content Area - Split View */}
          <div className="flex-1 flex overflow-hidden">
            {/* Chat Pane */}
            <div className={cn(
              "flex-1 flex flex-col min-w-0 transition-all duration-500",
              hasResultsPanel ? "lg:w-3/5" : "w-full"
            )}>
              <div 
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth"
              >
                <div className="max-w-4xl mx-auto w-full">
                  {aiMessages.map((message) => (
                    <div key={message.id} className={cn(
                      "flex flex-col space-y-2 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300",
                      message.isUser ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "max-w-[85%] px-4 py-2.5 rounded-lg shadow-sm",
                        message.isUser 
                          ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white" 
                          : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                      )}>
                        <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                          {message.isUser ? (
                            renderMessageContent(message.content)
                          ) : (
                            <div className="whitespace-normal [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-200 dark:[&_th]:bg-gray-700 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-gray-600 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
                              <RichTextRenderer content={message.content} />
                            </div>
                          )}
                        </div>

                        {/* Search Results in Chat - Only visible on mobile (hidden on desktop where right panel shows) */}
                        {message.searchResults && (message.searchResults.companies?.length > 0 || message.searchResults.products?.length > 0) && (
                          <div className="mt-6 space-y-5 pt-4 border-t border-gray-200/50 dark:border-gray-700/50 lg:hidden">
                            {message.searchResults.companies && message.searchResults.companies.length > 0 && (
                              <div className="space-y-3">
                                <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  <Building2 className="w-3.5 h-3.5 mr-2" />
                                  Companies ({message.searchResults.companies.length})
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  {message.searchResults.companies.slice(0, 4).map((company: Company) => (
                                    <div 
                                      key={company.id} 
                                      onClick={() => navigate(`/company/${company.id}`)}
                                      className="bg-white dark:bg-gray-900/50 hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3">
                                          <div className="w-12 h-12 rounded-lg flex-shrink-0 relative overflow-hidden">
                                            {company.logoPath ? (
                                              <img 
                                                src={company.logoPath} 
                                                alt={company.name}
                                                className="w-full h-full object-contain bg-white p-1"
                                              />
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
                                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-600 dark:text-gray-400 rounded">
                                                {company.industry}
                                              </span>
                                            </div>
                                          </div>
                                          
                                          {/* Web Link */}
                                          <div className="flex-shrink-0">
                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/20 transition-colors">
                                              <Globe className="w-3.5 h-3.5" />
                                              <span className="text-[10px] font-medium">Web</span>
                                            </div>
                                          </div>
                                        </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {message.searchResults.products && message.searchResults.products.length > 0 && (
                              <div className="space-y-3">
                                <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  <Package className="w-3.5 h-3.5 mr-2" />
                                  Products ({message.searchResults.products.length})
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  {message.searchResults.products.slice(0, 6).map((product: Product) => (
                                    <div
                                      key={product.id}
                                      className="group bg-white dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 relative"
                                    >
                                      {/* Verified Badge & Fit Score - Top Right */}
                                      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md">
                                          <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                          <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                                        </div>
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
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex-shrink-0 relative overflow-hidden">
                                          {product.imagePath ? (
                                            <img 
                                              src={product.imagePath} 
                                              alt={product.name}
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <div className={`w-full h-full flex items-center justify-center bg-gradient-to-r ${productGradients[product.id % productGradients.length]}`}>
                                              <Package className="w-6 h-6 text-white/80" />
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Product Info */}
                                        <div className="flex-1 min-w-0">
                                          <h5 className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mb-1 pr-20">
                                            {product.name}
                                          </h5>
                                          
                                          {/* Brand & Location */}
                                          {companyMap.get(product.companyId) && (
                                            <div className="mb-1 flex flex-col">
                                              <div className="flex items-baseline gap-1 mb-0.5">
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Brand:</span>
                                                <span 
                                                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/company/${product.companyId}`);
                                                  }}
                                                >
                                                  {companyMap.get(product.companyId)?.name}
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Category Badge */}
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                                              {product.category}
                                            </span>
                                          </div>
                                          
                                          {/* Download Links Row */}
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                              className={`text-[10px] font-medium transition-colors ${
                                                product.modelPath
                                                  ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer'
                                                  : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                              }`}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (product.modelPath) {
                                                  window.open(product.modelPath, '_blank');
                                                }
                                              }}
                                              disabled={!product.modelPath}
                                            >
                                              3D
                                            </button>
                                            
                                            <button
                                              className={`text-[10px] font-medium transition-colors ${
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
                                            
                                            <button
                                              className={`text-[10px] font-medium transition-colors ${
                                                product.documentPaths && product.documentPaths.length > 0
                                                  ? 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 cursor-pointer'
                                                  : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                              }`}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (product.documentPaths && product.documentPaths.length > 0) {
                                                  window.open(product.documentPaths[0], '_blank');
                                                }
                                              }}
                                              disabled={!product.documentPaths || product.documentPaths.length === 0}
                                            >
                                              Docs
                                            </button>
                                            
                                            <Heart 
                                              className="w-3.5 h-3.5 text-gray-400 hover:text-red-500 cursor-pointer transition-colors ml-auto" 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                              }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {isAILoading && (
                    <div className="flex justify-start mb-8 animate-in fade-in duration-300">
                      <div className="flex items-center justify-center p-2">
                        <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse-simple shadow-[0_0_8px_rgba(168,85,247,0.4)]"></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Input Area - Matching GlobalSearch Style */}
              <div className="p-4 md:p-6 border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
                <div className="max-w-4xl mx-auto">
                  <div className="relative">
                    {/* Gradient Border Wrapper with integrated glow */}
                    <div className="relative rounded-2xl transition-all duration-500 transform hover:scale-[1.01]">
                      {/* Glow effect positioned directly on the search bar */}
                      <div className="absolute -inset-0.5 bg-blue-500 rounded-2xl blur-md opacity-30 pointer-events-none"></div>
                      <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 p-[1px] rounded-2xl shadow-2xl shadow-blue-500/20">
                        <div className="relative flex items-center bg-white dark:bg-black rounded-2xl">
                        {/* Search Icon */}
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 z-20">
                          <Search className="w-5 h-5" />
                        </div>
                        
                        {/* Input */}
                        <input
                          autoFocus
                          type="text"
                          placeholder="Ask me anything: companies, products, technologies..."
                          value={aiQuery}
                          onChange={(e) => setAiQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && aiQuery.trim()) {
                              handleAISearch(aiQuery);
                              setAiQuery('');
                            }
                          }}
                          className="w-full h-12 pl-12 pr-14 text-sm font-medium bg-transparent text-gray-900 dark:text-white rounded-2xl border-0 focus:ring-0 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                        
                        {/* Send Button */}
                        <Button
                          size="icon"
                          onClick={() => {
                            if (aiQuery.trim()) {
                              handleAISearch(aiQuery);
                              setAiQuery('');
                            }
                          }}
                          disabled={!aiQuery.trim() || isAILoading}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 group border-0"
                        >
                          <ArrowUp className="w-4 h-4 stroke-[3] text-white transition-transform duration-200 group-hover:-translate-y-0.5" />
                        </Button>
                      </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel - Desktop - Show all search results as cards */}
            {hasResultsPanel && latestResultsMessage?.searchResults && (
                <div className="hidden lg:flex w-2/5 flex-col border-l border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 animate-in slide-in-from-right duration-500">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-8">
                    {/* Products Section */}
                    {latestResultsMessage.searchResults.products && latestResultsMessage.searchResults.products.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                          <Package className="w-3.5 h-3.5 mr-2" />
                          Products ({latestResultsMessage.searchResults.products.length})
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                          {latestResultsMessage.searchResults.products.map((product: Product) => (
                            <div key={product.id} className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all duration-200 relative">
                              {/* Verified Badge & Fit Score - Top Right */}
                              <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md">
                                  <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                                </div>
                                {/* Fit Score */}
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
                                  {companyMap.get(product.companyId) && (
                                    <div className="mb-1 flex flex-col">
                                      <div className="flex items-baseline gap-1 mb-0.5">
                                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Brand:</span>
                                        <Link href={`/company/${product.companyId}`}>
                                          <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer transition-colors truncate">
                                            {companyMap.get(product.companyId)?.name}
                                          </span>
                                        </Link>
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
                                    <button
                                      className={`text-xs font-medium transition-colors ${
                                        product.modelPath
                                          ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer'
                                          : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                      }`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (product.modelPath) {
                                          window.open(product.modelPath, '_blank');
                                        }
                                      }}
                                      disabled={!product.modelPath}
                                    >
                                      3D
                                    </button>
                                    
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
                                    
                                    <button
                                      className={`text-xs font-medium transition-colors ${
                                        product.documentPaths && product.documentPaths.length > 0
                                          ? 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 cursor-pointer'
                                          : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                      }`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (product.documentPaths && product.documentPaths.length > 0) {
                                          window.open(product.documentPaths[0], '_blank');
                                        }
                                      }}
                                      disabled={!product.documentPaths || product.documentPaths.length === 0}
                                    >
                                      Documentation
                                    </button>
                                    
                                    <button
                                      className={`text-xs font-medium transition-colors ${
                                        product.productWebLink
                                          ? 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer'
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
                                    
                                    <Heart className="w-4 h-4 text-gray-400 hover:text-red-500 cursor-pointer transition-colors ml-auto" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Companies Section */}
                    {latestResultsMessage.searchResults.companies && latestResultsMessage.searchResults.companies.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                          <Building2 className="w-3.5 h-3.5 mr-2" />
                          Companies ({latestResultsMessage.searchResults.companies.length})
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                          {latestResultsMessage.searchResults.companies.map((company: Company) => (
                            <Link key={company.id} href={`/company/${company.id}`}>
                              <div className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 cursor-pointer">
                                <div className="flex items-center p-2.5 gap-3">
                                  {/* Company Logo */}
                                  <div className="w-12 h-12 rounded-lg flex-shrink-0 relative overflow-hidden">
                                    {company.logoPath ? (
                                      <img 
                                        src={company.logoPath} 
                                        alt={company.name}
                                        className="w-full h-full object-contain bg-white p-1"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                        <Building2 className="w-5 h-5 text-white" />
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Company Info */}
                                  <div className="flex-1 min-w-0">
                                    <h5 className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                                      {company.name}
                                    </h5>
                                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                      <span className="truncate">{company.location}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-600 dark:text-gray-400 rounded">
                                        {company.industry}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Web Link */}
                                  <div className="flex-shrink-0">
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/20 transition-colors">
                                      <Globe className="w-3.5 h-3.5" />
                                      <span className="text-[10px] font-medium">Web</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            )}
          </div>
        </div>
      )}

      <main className="relative z-10 min-h-screen">
      {/* Hero Section */}
      <section ref={heroRef} className="px-4 sm:px-6 lg:px-12 relative">
        <div className="w-full">
          {/* Hero Block — locked to one full visible viewport below the fixed nav.
              Mobile: 3-row grid so the search bar sits at the viewport vertical middle,
              with the title group hugging it from above. sm+ keeps the original centered stack. */}
          <div className="hero-fold grid grid-rows-[1fr_auto_1fr] sm:flex sm:flex-col sm:justify-center mt-[4.5rem] sm:mt-[5rem] md:mt-[5.75rem] pb-8 sm:pb-12 md:pb-16 relative">
            {/* Title */}
            <div className="text-center self-end sm:self-auto mb-5 sm:mb-6 md:mb-8 [@media(max-height:700px)]:mb-3">
              <div className="-mb-4 flex justify-center [@media(max-height:700px)]:-mb-2">
                <img 
                  src={deepFolderLogo} 
                  alt="DeepFolder" 
                  className="h-24 sm:h-28 md:h-32 lg:h-40 xl:h-48 w-auto object-contain scale-110 [@media(max-height:700px)]:h-16"
                  style={{ objectPosition: 'center' }}
                />
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-bold text-gray-900 dark:text-white mb-3 md:mb-4 tracking-tight leading-tight [@media(max-height:700px)]:text-xl [@media(max-height:700px)]:mb-2">
                Discover. Connect.{" "}
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Innovate.
                </span>
              </h1>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed px-4 [@media(max-height:700px)]:text-xs">
                Explore the Future of Product Discovery
              </p>
            </div>

            {/* Search Bar */}
            <div className="mb-0 sm:mb-4 md:mb-6">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-2">
                <GlobalSearch
                  placeholder="Prompt your search"
                  onAIModeChange={setIsAIMode}
                  onAIResults={handleAIResults}
                  initialQuery={query}
                  onQueryChange={setQuery}
                  freezeAnimation={isSidebarOpen}
                />
              </div>
            </div>

            {/* Scroll affordance — fades out once the hero is scrolled past */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('audience-cards-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={cn(
                "absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 p-2 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-opacity duration-300 animate-bounce",
                heroPassed ? "opacity-0 pointer-events-none" : "opacity-80"
              )}
              aria-label="Scroll to learn more"
              data-testid="button-hero-scroll-down"
            >
              <ChevronDown className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>
        </div>
      </section>

      {/* Below-the-fold sibling — audience cards, examples, search results */}
      <section className="px-4 sm:px-6 lg:px-12 relative pb-6 sm:pb-8 md:pb-12">
        <div className="w-full">
          {/* Two Audiences Section + DeepSearch Examples + Final CTA */}
          <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mb-0">

            {/* Two Audience Cards Section */}
            <div id="audience-cards-section" className="relative bg-gray-950 scroll-mt-20 md:scroll-mt-24">
              <div className="max-w-7xl mx-auto">
                <div className="grid md:grid-cols-2 divide-y divide-gray-800 md:divide-y-0 md:divide-x md:divide-gray-800">
                  {/* For Engineers, Researchers & Innovators */}
                  <div
                    id="engineers-card"
                    className="group relative overflow-hidden px-10 py-16 md:py-20 flex flex-col"
                    data-testid="card-engineers"
                  >
                    {/* Left accent bar (desktop) / Top accent bar (mobile) */}
                    <div className="absolute left-0 inset-y-0 w-[3px] bg-blue-400 md:block hidden transition-opacity duration-300 opacity-70 group-hover:opacity-100" aria-hidden="true" />
                    <div className="absolute top-0 inset-x-0 h-[3px] bg-blue-400 md:hidden transition-opacity duration-300 opacity-70 group-hover:opacity-100" aria-hidden="true" />

                    {/* Large background numeral */}
                    <div className="pointer-events-none select-none absolute top-4 right-6 text-[10rem] font-black leading-none text-blue-400 opacity-[0.06] group-hover:opacity-[0.10] transition-opacity duration-300" aria-hidden="true">
                      01
                    </div>

                    <div className="relative flex flex-col flex-1">
                      <div className="font-mono text-xs tracking-[0.2em] uppercase text-blue-400 mb-3">
                        For Engineers, Researchers & Innovators
                      </div>
                      <h3 className="text-4xl font-bold text-white leading-tight mt-3 mb-4">
                        Find and combine products based on your requirements.
                      </h3>
                      <p className="text-sm text-gray-400 leading-relaxed mb-8">
                        Discover, understand, and connect products using AI that turns your technical requirements into traceable engineering solutions.
                      </p>
                      <div className="mb-10">
                        {[
                          "Smart product discovery based on function, performance, and constraints",
                          "Compare specifications instantly without reading PDFs",
                          "Access datasheets, CAD models, and technical details in one place",
                          "Run engineering calculations and derive search requirements",
                          "Get product recommendations based on calculated results",
                          "Combine components into complete, compatible systems using AI reasoning",
                          "Save and organize products into your own library",
                        ].map((item) => (
                          <div key={item} className="py-3 border-t border-gray-800 text-sm">
                            <span className="text-gray-300">{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto">
                        <button
                          onClick={() => navigate('/')}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors mt-10"
                          data-testid="button-start-searching"
                        >
                          Start Searching
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <p className="text-xs text-gray-600 mt-3">
                          Free access available with limited daily searches.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* For Companies & Manufacturers */}
                  <div
                    id="companies-card"
                    className="group relative overflow-hidden px-10 py-16 md:py-20 flex flex-col scroll-mt-24"
                    data-testid="card-companies"
                  >
                    {/* Left accent bar (desktop) / Top accent bar (mobile) */}
                    <div className="absolute left-0 inset-y-0 w-[3px] bg-amber-400 md:block hidden transition-opacity duration-300 opacity-70 group-hover:opacity-100" aria-hidden="true" />
                    <div className="absolute top-0 inset-x-0 h-[3px] bg-amber-400 md:hidden transition-opacity duration-300 opacity-70 group-hover:opacity-100" aria-hidden="true" />

                    {/* Large background numeral */}
                    <div className="pointer-events-none select-none absolute top-4 right-6 text-[10rem] font-black leading-none text-amber-400 opacity-[0.06] group-hover:opacity-[0.10] transition-opacity duration-300" aria-hidden="true">
                      02
                    </div>

                    <div className="relative flex flex-col flex-1">
                      <div className="font-mono text-xs tracking-[0.2em] uppercase text-amber-400 mb-3">
                        For Companies & Manufacturers
                      </div>
                      <h3 className="text-4xl font-bold text-white leading-tight mt-3 mb-4">
                        Make your product knowledge intelligent and discoverable.
                      </h3>
                      <p className="text-sm text-gray-400 leading-relaxed mb-8">
                        Transform your catalogs, datasheets, and CAD models into AI-ready product intelligence that engineers can find, understand, and select.
                      </p>
                      <div className="mb-10">
                        {[
                          "Turn PDFs and catalogs into intelligent, structured, searchable product data",
                          "Make your products discoverable through AI-driven queries",
                          "Appear in results based on real engineering requirements",
                          "Be recommended when your products meet calculated needs",
                          "Show how your products fit into complete systems",
                          "Increase product selection — not just visibility",
                          "Get insights into how engineers discover and choose your products",
                        ].map((item) => (
                          <div key={item} className="py-3 border-t border-gray-800 text-sm">
                            <span className="text-gray-300">{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto">
                        <button
                          onClick={() => navigate('/auth?intent=company')}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors mt-10"
                          data-testid="button-list-your-products"
                        >
                          List Your Products
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <p className="text-xs text-gray-600 mt-3">
                          Company subscription for verified product data — pricing available on request.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Search Examples Section - Full Width Multi-Industry Coverage */}
            <div id="deepsearch-examples" className="bg-white dark:bg-gray-900 py-10 sm:py-12 md:py-16">
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12">
                <div className="text-center mb-6 sm:mb-8">
                  <h4 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                    DeepSearch Prompt Examples
                  </h4>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-5 sm:mb-6">
                    Try a <span className="font-semibold text-gray-900 dark:text-white">Search</span>, <span className="font-semibold text-gray-900 dark:text-white">Build</span>, <span className="font-semibold text-gray-900 dark:text-white">Calculation</span>, or <span className="font-semibold text-gray-900 dark:text-white">Comparison</span> prompt to see DeepFolder in action
                  </p>
                  <div className="w-fit mx-auto grid grid-cols-2 sm:inline-flex sm:items-center gap-1 p-1 rounded-2xl sm:rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      title="Search"
                      onClick={() => setPromptMode('search')}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-sm font-medium transition-all w-full sm:w-auto",
                        promptMode === 'search'
                          ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      )}
                      data-testid="button-prompt-mode-search"
                    >
                      <Search className="w-4 h-4" />
                      <span>Search</span>
                    </button>
                    <button
                      type="button"
                      title="Build"
                      onClick={() => setPromptMode('build')}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-sm font-medium transition-all w-full sm:w-auto",
                        promptMode === 'build'
                          ? "bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      )}
                      data-testid="button-prompt-mode-build"
                    >
                      <Box3d className="w-4 h-4" />
                      <span>Build</span>
                    </button>
                    <button
                      type="button"
                      title="Calculation"
                      onClick={() => setPromptMode('calculate')}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-sm font-medium transition-all w-full sm:w-auto",
                        promptMode === 'calculate'
                          ? "bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      )}
                      data-testid="button-prompt-mode-calculate"
                    >
                      <Calculator className="w-4 h-4" />
                      <span>Calculation</span>
                    </button>
                    <button
                      type="button"
                      title="Comparison"
                      onClick={() => setPromptMode('compare')}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-sm font-medium transition-all w-full sm:w-auto",
                        promptMode === 'compare'
                          ? "bg-white dark:bg-gray-900 text-orange-600 dark:text-orange-400 shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      )}
                      data-testid="button-prompt-mode-compare"
                    >
                      <GitCompare className="w-4 h-4" />
                      <span>Comparison</span>
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {(showAllIndustries
                    ? INDUSTRY_EXAMPLES.map((industry, index) => ({ industry, index }))
                    : [0, 1, 2, 4, 5, 12].map((index) => ({ industry: INDUSTRY_EXAMPLES[index], index }))
                  ).map(({ industry, index }) => (
                    <IndustryCard
                      key={industry.name}
                      industry={industry}
                      index={index}
                      promptMode={promptMode}
                      enabled={true}
                      onNavigate={navigate}
                    />
                  ))}
                </div>

                <div className="flex justify-center mt-6 sm:mt-8">
                  <button
                    type="button"
                    onClick={() => setShowAllIndustries(v => !v)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid="button-toggle-all-industries"
                  >
                    {showAllIndustries ? 'Show fewer industries' : `Show all ${INDUSTRY_EXAMPLES.length} industries`}
                  </button>
                </div>
              </div>
            </div>

            {/* Final CTA Block */}
            <div className="bg-white dark:bg-black py-20 sm:py-24 md:py-32 px-4 sm:px-6 lg:px-12 border-t border-gray-200 dark:border-gray-800">
              <div className="max-w-4xl mx-auto text-center">
                <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-gray-900 dark:text-white tracking-tight leading-[1.1] mb-5">
                  The future of product discovery is{" "}
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    intelligent
                  </span>
                  .
                </h2>
                <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 leading-relaxed mb-10 max-w-2xl mx-auto">
                  Join engineers, researchers, innovators, and companies worldwide using DeepFolder to connect through AI-driven product knowledge.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
                  <Button
                    onClick={() => navigate('/')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 text-base font-medium rounded-xl shadow-sm hover:shadow-md transition-all w-full sm:w-auto"
                    data-testid="button-final-start-searching"
                  >
                    Start Searching
                  </Button>
                  <Button
                    onClick={() => {
                      const el = document.getElementById('companies-card');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    variant="outline"
                    className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-700 dark:hover:text-purple-300 px-8 h-12 text-base font-medium rounded-xl w-full sm:w-auto bg-transparent"
                    data-testid="button-final-for-companies"
                  >
                    For Companies
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Search Results Section */}
          {showSearchResults && (
            <div className="w-full space-y-8">
              {searchLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-4 text-gray-600 dark:text-gray-300">Searching...</p>
                </div>
              ) : (
                <>
                  {/* Search Analytics */}
                  <SearchAnalytics searchResults={searchResults} searchQuery={query} />
                  
                  {/* Search Filters */}
                  <SearchFilters 
                    filters={searchFilters}
                    updateFilters={(updates) => setSearchFilters(prev => ({ ...prev, ...updates }))}
                    clearFilters={() => setSearchFilters({
                      sortBy: 'relevance',
                      sortOrder: 'desc',
                      industries: [],
                      locations: [],
                      companySize: [],
                      productCategories: [],
                      hasModels: false,
                      hasCatalogs: false,
                      hasDatasheets: false,
                    })}
                    searchResults={searchResults}
                  />
                </>
              )}
              
              {!searchLoading && (
                <>
                  {/* Companies Section */}
                  {filteredResults.companies?.length > 0 && (
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                          <Building2 className="w-7 h-7 mr-3 text-blue-600 dark:text-blue-400" />
                          Companies
                          <span className="ml-3 px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                            {filteredResults.companies.length} found
                          </span>
                        </h3>
                        <Link href="/companies" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm flex items-center">
                          View All
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Link>
                      </div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredResults.companies.map((company, index) => {
                          const IconComponent = themeIcons[company.colorTheme as keyof typeof themeIcons] || Factory;
                          const gradientClass = productGradients[index % productGradients.length];
                          
                          return (
                            <Link
                              key={company.id}
                              href={`/company/${company.id}`}
                              className="group bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-6 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-300/60 dark:hover:border-blue-600/60 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                            >
                              <div className="flex items-start mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-r ${gradientClass} group-hover:scale-110 transition-transform duration-300`}>
                                  <IconComponent className="w-6 h-6" />
                                </div>
                                <div className="ml-4 flex-1">
                                  <h4 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    <SearchHighlight text={company.name} searchQuery={query} />
                                  </h4>
                                  <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold mt-1">
                                    <SearchHighlight text={company.industry} searchQuery={query} />
                                  </p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                                    <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                    <SearchHighlight text={company.location} searchQuery={query} />
                                  </p>
                                </div>
                              </div>
                              <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-3 leading-relaxed mb-4">
                                <SearchHighlight text={company.description} searchQuery={query} />
                              </p>
                              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                  <Users className="w-3 h-3 mr-1" />
                                  {company.employeeCount || 'Contact for size'}
                                </div>
                                <div className="text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform duration-300">
                                  <ArrowRight className="w-4 h-4" />
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Products Section */}
                  {filteredResults.products?.length > 0 && (
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                          <Package className="w-7 h-7 mr-3 text-purple-600 dark:text-purple-400" />
                          Products
                          <span className="ml-3 px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">
                            {filteredResults.products.length} found
                          </span>
                        </h3>
                        <Link href="/products" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium text-sm flex items-center">
                          View All
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {filteredResults.products.map((product, index) => {
                          const gradients = [
                            "from-blue-500 to-cyan-600",
                            "from-purple-500 to-pink-600", 
                            "from-green-500 to-emerald-600",
                            "from-red-500 to-orange-600",
                            "from-indigo-500 to-blue-600",
                            "from-amber-500 to-orange-600",
                            "from-teal-500 to-cyan-600",
                            "from-rose-500 to-pink-600"
                          ];
                          const gradientClass = gradients[index % gradients.length];
                          
                          return (
                            <div key={product.id} className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-300">
                              {/* Product Image - Larger focus with optimized aspect ratio */}
                              <div className="aspect-[4/3] relative overflow-hidden">
                                {product.imagePath ? (
                                  <img 
                                    src={product.imagePath} 
                                    alt={product.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                    }}
                                  />
                                ) : product.modelPath && product.modelPath.includes('/uploads/') ? (
                                  <div className="w-full h-full">
                                    <ProductPreview product={product} gradientClass={gradientClass} />
                                  </div>
                                ) : (
                                  <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradientClass} relative`}>
                                    <Package className="w-12 h-12 text-white/70" />
                                    <div className="absolute inset-0 bg-black/5"></div>
                                  </div>
                                )}
                                
                                {/* Category Badge */}
                                <div className="absolute bottom-2 left-2">
                                  <span className="bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                    <SearchHighlight text={product.category || ''} searchQuery={query} />
                                  </span>
                                </div>
                              </div>

                              {/* Product Info - Ultra compact without description */}
                              <div className="p-2 space-y-1.5">
                                <div className="min-h-[1.5rem]">
                                  <h4 className="font-semibold text-gray-900 dark:text-white line-clamp-2 text-sm leading-tight">
                                    <SearchHighlight text={product.name} searchQuery={query} />
                                  </h4>
                                </div>
                                
                                {/* Compact download buttons in row */}
                                <div className="grid grid-cols-2 gap-1 mb-1">
                                  {/* 3D Model Download */}
                                  {product.modelPath && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const path = product.modelPath;
                                        if (path) window.open(path, '_blank');
                                      }}
                                    >
                                      <Download className="w-2.5 h-2.5 mr-0.5" />
                                      3D step file
                                    </Button>
                                  )}
                                  
                                  {/* PDF Catalog Download */}
                                  {product.catalogPath && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-800 text-green-700 dark:text-green-300 text-xs"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const path = product.catalogPath;
                                        if (path) window.open(path, '_blank');
                                      }}
                                    >
                                      <Download className="w-2.5 h-2.5 mr-0.5" />
                                      pdf
                                    </Button>
                                  )}
                                  
                                  {/* Additional Documentation */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className={`h-6 px-1.5 text-xs ${
                                      product.documentPaths && product.documentPaths.length > 0
                                        ? 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    }`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (product.documentPaths && product.documentPaths.length > 0) {
                                        window.open(product.documentPaths[0], '_blank');
                                      }
                                    }}
                                    disabled={!product.documentPaths || product.documentPaths.length === 0}
                                  >
                                    <Download className="w-2.5 h-2.5 mr-0.5" />
                                    docs
                                  </Button>
                                  
                                  {/* Add to Project */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-800 text-red-700 dark:text-red-300 text-xs"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      alert(`Added ${product.name} to your project!`);
                                    }}
                                  >
                                    <Heart className="w-2.5 h-2.5 mr-0.5" />
                                    add to project
                                  </Button>
                                </div>
                                
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No Results */}
                  {searchResults.companies?.length === 0 && searchResults.products?.length === 0 && (
                    <div className="text-center py-16">
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                        <Search className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">No results found</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6 w-full text-center">
                        We couldn't find any companies or products matching your search. Try different keywords or browse our featured content below.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link href="/companies" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                          Browse Companies
                        </Link>
                        <Link href="/products" className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">
                          Browse Products
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* No Results Found */}
                  {filteredResults.companies?.length === 0 && filteredResults.products?.length === 0 && (
                    <div className="text-center py-16">
                      <div className="w-full max-w-2xl mx-auto">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Search className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          No results found for "{query}"
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                          Try searching for different terms, check your spelling, or browse our categories to discover companies and products.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <Link href="/companies">
                            <Button variant="outline" className="w-full sm:w-auto">
                              Browse All Companies
                            </Button>
                          </Link>
                          <Link href="/products">
                            <Button variant="outline" className="w-full sm:w-auto">
                              Browse All Products
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Inline AI Recommendations Section */}
          {showInlineResults && (
            <div ref={inlineResultsRef} className="w-full space-y-8 mt-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {inlineResultsType === 'companies' ? (
                      <span className="flex items-center">
                        <Sparkles className="w-8 h-8 mr-3 text-blue-500" />
                        AI Recommended Companies
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Sparkles className="w-8 h-8 mr-3 text-purple-500" />
                        AI Recommended Products
                      </span>
                    )}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300">
                    Personalized recommendations based on your interests and industry trends
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={clearInlineResults}
                  className="flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Close
                </Button>
              </div>

              {/* Companies Section */}
              {inlineResultsType === 'companies' && aiRecommendedCompanies.length > 0 && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {aiRecommendedCompanies.map((company, index) => {
                      const IconComponent = themeIcons[company.colorTheme as keyof typeof themeIcons] || Factory;
                      const gradientClass = productGradients[index % productGradients.length];
                      
                      return (
                        <div
                          key={company.id}
                          className="group bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-6 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-300/60 dark:hover:border-blue-600/60 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                        >
                          <div className="flex items-start mb-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-r ${gradientClass} group-hover:scale-110 transition-transform duration-300`}>
                              <IconComponent className="w-6 h-6" />
                            </div>
                            <div className="ml-4 flex-1">
                              <Link href={`/company/${company.id}`}>
                                <h4 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer">
                                  {company.name}
                                </h4>
                              </Link>
                              <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold mt-1">
                                {company.industry}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                {company.location}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
                            {company.description}
                          </p>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center justify-between">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 border-purple-200 dark:border-purple-600 hover:border-purple-300 dark:hover:border-purple-500 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                              onClick={(e) => {
                                e.stopPropagation();
                                // AI chat functionality
                                alert(`AI chat with ${company.name} - This feature will be available soon!`);
                              }}
                            >
                              <Bot className="w-3 h-3 mr-1" />
                              Ask AI
                            </Button>
                            
                            <div className="flex items-center space-x-1">
                              <Sparkles className="w-4 h-4 text-blue-500" />
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                {company.aiReason}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-center">
                    <Link href="/companies">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        View All Companies
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Products Section */}
              {inlineResultsType === 'products' && aiRecommendedProducts.length > 0 && (
                <div className="space-y-6">
                  <div className="overflow-x-auto scrollbar-hide w-full">
                    <div className="flex gap-4 pb-4" style={{display: 'flex', flexWrap: 'nowrap', width: 'max-content'}}>
                    {aiRecommendedProducts.map((product, index) => {
                      const gradientClass = productGradients[index % productGradients.length];
                      
                      return (
                        <div key={product.id} className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-300" style={{width: '280px', flexShrink: 0}}>
                          {/* Product Image - Same as search results */}
                          <div className="aspect-[4/3] relative overflow-hidden">
                            {product.imagePath ? (
                              <img 
                                src={product.imagePath} 
                                alt={product.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : product.modelPath && product.modelPath.includes('/uploads/') ? (
                              <div className="w-full h-full">
                                <ProductPreview product={product} gradientClass={gradientClass} />
                              </div>
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradientClass} relative`}>
                                <Package className="w-12 h-12 text-white/70" />
                                <div className="absolute inset-0 bg-black/5"></div>
                              </div>
                            )}
                            
                            {/* Category Badge */}
                            <div className="absolute bottom-2 left-2">
                              <span className="bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                {product.category}
                              </span>
                            </div>
                          </div>

                          {/* Product Info - Ultra compact without description */}
                          <div className="p-2 space-y-1.5">
                            <div className="min-h-[1.5rem]">
                              <h4 className="font-semibold text-gray-900 dark:text-white line-clamp-2 text-sm leading-tight">
                                {product.name}
                              </h4>
                            </div>
                            
                            {/* Compact download buttons in row */}
                            <div className="grid grid-cols-2 gap-1 mb-1">
                              {/* 3D Model Download */}
                              {product.modelPath && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const path = product.modelPath;
                                    if (path) window.open(path, '_blank');
                                  }}
                                >
                                  <Download className="w-2.5 h-2.5 mr-0.5" />
                                  3D step file
                                </Button>
                              )}
                              
                              {/* PDF Catalog Download */}
                              {product.catalogPath && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-800 text-green-700 dark:text-green-300 text-xs"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const path = product.catalogPath;
                                    if (path) window.open(path, '_blank');
                                  }}
                                >
                                  <Download className="w-2.5 h-2.5 mr-0.5" />
                                  pdf
                                </Button>
                              )}
                              
                              {/* Additional Documentation */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-6 px-1.5 text-xs ${
                                  product.documentPaths && product.documentPaths.length > 0
                                    ? 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (product.documentPaths && product.documentPaths.length > 0) {
                                    window.open(product.documentPaths[0], '_blank');
                                  }
                                }}
                                disabled={!product.documentPaths || product.documentPaths.length === 0}
                              >
                                <Download className="w-2.5 h-2.5 mr-0.5" />
                                docs
                              </Button>
                              
                              {/* Add to Project */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-800 text-red-700 dark:text-red-300 text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  alert(`Added ${product.name} to your project!`);
                                }}
                              >
                                <Heart className="w-2.5 h-2.5 mr-0.5" />
                                add to project
                              </Button>
                            </div>
                            
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  <div className="text-center">
                    <Link href="/products">
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                        View All Products
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>

      </section>

      {/* Default Content - Only show when not searching */}
      {showDefaultContent && (
        <section className="px-6 lg:px-12 pb-20 relative">
          <div className="w-full space-y-20">


          </div>
        </section>
      )}
    </main>
    </div>
  );
}