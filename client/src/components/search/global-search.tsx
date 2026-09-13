import { useState, useEffect, useRef } from "react";
import { Search, Sparkles, Bot, X, Send, Heart, ShoppingCart, Eye, Download, Star, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: number;
  name: string;
  industry: string;
  description: string;
  location: string;
  colorTheme: string;
}

interface Product {
  id: number;
  name: string;
  category: string;
  description: string;
  companyId: number;
  modelPath?: string;
  catalogPath?: string;
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

interface GlobalSearchProps {
  placeholder?: string;
  onAIModeChange?: (isAIMode: boolean) => void;
  onAIResults?: (messages: AISearchMessage[]) => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  freezeAnimation?: boolean;
}

const TYPING_PROMPTS = [
  "Build an autonomous delivery drone with 3 kg payload, 30 min flight time, range 10 km, GPS + obstacle avoidance — include full system design",
  "Calculate required motor and gearbox for lifting 500 kg at 0.15 m/s over 2 m height and recommend suitable products",
  "Search for surgical robotic arms with payload >5 kg, repeatability ±0.02 mm, and 6+ axes",
  "Create a high-speed FPV drone >160 km/h, thrust-to-weight ratio >5:1, 6S battery, low latency system",
  "Calculate actuator force and speed for moving 300 kg over 0.5 m in 2 seconds and find matching actuators",
  "Search for dental milling machines for crowns with accuracy <20 µm and CAD/CAM compatibility",
  "Compare lithium-ion vs solid-state batteries for EV with capacity 60 kWh, range >400 km, cycle life >1500",
  "Design a conveyor system for fragile products, load 20 kg/unit, speed 0.3 m/s, length 8 m — recommend components",
  "Search for medical imaging systems (CT or MRI) with resolution <1 mm and scan time <10 min",
  "Calculate battery capacity for drone (total weight 6 kg) with 25 min flight time and recommend optimal battery",
  "Evaluate insulation materials for building with λ <0.04 W/mK, thickness 100 mm, fire resistance class A",
  "Develop a medical infusion system with flow rate 1–20 ml/h, accuracy ±1%, pressure monitoring <1 bar",
  "Search for collaborative robots (cobots) with payload 10 kg, reach >1 m, safety-rated",
  "Calculate cooling requirements for electronics dissipating 5 kW heat, ambient 30°C, max device temp 70°C — find solutions",
  "Propose data center cooling system for rack 10 kW, airflow >2000 m³/h or liquid cooling alternative",
  "Search for dental chairs with ergonomic positioning, load capacity >150 kg, integrated instruments",
  "Optimize an electric bike with range >100 km, motor torque >90 Nm, battery 48V, weight <25 kg",
  "Compare hydraulic vs electric actuators for 25 kN load, stroke 300 mm, duty cycle 60%, precision ±0.1 mm",
  "Calculate torque and power for electric go-kart (total weight 120 kg, target speed 100 km/h) and recommend drivetrain",
  "Build automated packaging line for pharmaceutical products, 40 units/min, sterile environment, vision inspection",
];

export default function GlobalSearch({ placeholder, onAIModeChange, onAIResults, initialQuery = "", onQueryChange, freezeAnimation }: GlobalSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const isHomePage = window.location.pathname === '/home';
  
  // Update query function that calls both local state and parent callback
  const updateQuery = (newQuery: string) => {
    setQuery(newQuery);
    if (onQueryChange) {
      onQueryChange(newQuery);
    }
  };
  const [isAIMode, setIsAIMode] = useState(true);
  const [showAIResults, setShowAIResults] = useState(false);
  const [aiMessages, setAiMessages] = useState<AISearchMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [selectedProductForAI, setSelectedProductForAI] = useState<Product | null>(null);
  const [showProductAI, setShowProductAI] = useState(false);
  const [productAIQuery, setProductAIQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formWrapperRef = useRef<HTMLDivElement>(null);
  const [formWrapperHeight, setFormWrapperHeight] = useState(window.innerWidth < 640 ? 40 : 56);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Typing animation — same as DeepSearch, only active on home page
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [animationActive, setAnimationActive] = useState(isHomePage);
  const [searchInView, setSearchInView] = useState(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStateRef = useRef({ promptIndex: 0, charIndex: 0, deleting: false });

  // Pause the typing animation when the search bar scrolls out of view; resume when it comes back.
  useEffect(() => {
    if (!textareaRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setSearchInView(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(textareaRef.current);
    return () => observer.disconnect();
  }, []);

  // Track the form wrapper height so the examples link always sits below the bar.
  useEffect(() => {
    if (!formWrapperRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setFormWrapperHeight(entry.contentRect.height);
    });
    ro.observe(formWrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const clearTimer = () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };

    if (!animationActive || !searchInView || query) {
      setTypedPlaceholder("");
      return clearTimer;
    }

    const tick = () => {
      clearTimer();
      const state = typingStateRef.current;
      const current = TYPING_PROMPTS[state.promptIndex];

      if (!state.deleting) {
        if (state.charIndex < current.length) {
          state.charIndex++;
          setTypedPlaceholder(current.slice(0, state.charIndex));
          typingTimeoutRef.current = setTimeout(tick, 24);
        } else {
          typingTimeoutRef.current = setTimeout(() => {
            state.deleting = true;
            tick();
          }, 900);
        }
      } else {
        if (state.charIndex > 0) {
          state.charIndex--;
          setTypedPlaceholder(current.slice(0, state.charIndex));
          typingTimeoutRef.current = setTimeout(tick, 18);
        } else {
          state.deleting = false;
          state.promptIndex = (state.promptIndex + 1) % TYPING_PROMPTS.length;
          typingTimeoutRef.current = setTimeout(tick, 0);
        }
      }
    };

    tick();
    return clearTimer;
  }, [animationActive, query]);

  // Freeze when parent signals sidebar open or AI active
  useEffect(() => {
    if (freezeAnimation) setAnimationActive(false);
  }, [freezeAnimation]);

  // Drive textarea height from the animation (typedPlaceholder is used as value when animating)
  const defaultHeight = () => window.innerWidth < 640 ? '40px' : '56px';
  useEffect(() => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    if (animationActive && searchInView && !query) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    } else if (!query) {
      el.style.height = defaultHeight();
    }
  }, [typedPlaceholder, animationActive, searchInView, query]);

  // Favorites mutation
  const favoritesMutation = useMutation({
    mutationFn: async ({ productId, action }: { productId: number; action: 'add' | 'remove' }) => {
      if (action === 'add') {
        return apiRequest('/api/favorites', {
          method: 'POST',
          body: JSON.stringify({ favoriteType: 'product', favoriteId: productId }),
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else {
        return apiRequest('/api/favorites', {
          method: 'DELETE',
          body: JSON.stringify({ favoriteType: 'product', favoriteId: productId }),
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search"] });
      toast({
        title: "Success",
        description: "Favorites updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    },
  });

  // Sync with parent query
  useEffect(() => {
    if (initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // This function is already defined above

  // Search now redirects to dedicated page - no query needed here

  // Handle AI search
  const handleAISearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsAILoading(true);
    // Always show AI results in the same window
    setShowAIResults(true);

    const userMessage: AISearchMessage = {
      id: Date.now().toString(),
      content: searchQuery,
      isUser: true,
      timestamp: new Date(),
    };

    setAiMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (!response.ok) throw new Error("AI search failed");

      const data = await response.json();

      const aiMessage: AISearchMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date(),
        suggestions: data.suggestions,
        searchResults: data.searchResults,
      };

      setAiMessages(prev => {
        const newMessages = [...prev, aiMessage];
        onAIResults?.(newMessages);
        return newMessages;
      });
      
      // Auto-scroll to latest message
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error("AI search error:", error);
      
      const errorMessage: AISearchMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm having trouble processing your request right now. Please try again later.",
        isUser: false,
        timestamp: new Date(),
      };

      setAiMessages(prev => [...prev, errorMessage]);
      
      // Auto-scroll to latest message
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 100);
    } finally {
      setIsAILoading(false);
    }
  };

  // Handle search submission
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnimationActive(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = window.innerWidth < 640 ? '40px' : '56px';
    }
    if (query.trim()) {
      // Log the search activity
      try {
        await apiRequest('/api/user/log-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: query.trim() })
        });
      } catch (error) {
        // Silently fail - logging shouldn't block the search
        console.log('Failed to log search activity:', error);
      }
      
      if (isAIMode) {
        // Navigate to dedicated DeepSearch page with query
        setLocation(`/deepsearch?q=${encodeURIComponent(query.trim())}`);
      } else {
        // Redirect to dedicated search results page
        setLocation(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowAIResults(false);
      }
    };

    const handleHighlightSearch = () => {
      // AI mode is already active by default, just add highlight animation
      if (searchRef.current) {
        searchRef.current.classList.add('animate-pulse');
        searchRef.current.style.filter = 'drop-shadow(0 0 20px rgba(147, 51, 234, 0.5))';
        setTimeout(() => {
          if (searchRef.current) {
            searchRef.current.classList.remove('animate-pulse');
            searchRef.current.style.filter = '';
          }
        }, 1200);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener('highlightSearch', handleHighlightSearch);
    
    const handleResize = () => {
      // Force re-render to update placeholder text on resize
      setQuery(prev => prev);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener('highlightSearch', handleHighlightSearch);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      ref={searchRef}
      className="relative w-full max-w-4xl mx-auto overflow-visible h-10 sm:h-14"
    >
      {/* Absolutely-positioned search form — grows downward only, never pushes parent layout */}
      <div ref={formWrapperRef} className="absolute top-0 left-0 right-0">
        {/* Enhanced Background Glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-700/20 via-purple-700/20 to-purple-600/20 rounded-2xl blur-xl scale-110 opacity-30 pointer-events-none"></div>

        <form onSubmit={handleSearch} className="relative z-10">
          {/* Search Icon */}
          <div className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 z-20">
            <Search className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>

          {/* Search Input with Enhanced Styling */}
          <div className={cn(
            "relative rounded-xl transition-all duration-500 transform hover:scale-[1.02]",
            "p-[1px] shadow-2xl shadow-blue-500/20 animate-search-glow",
            "bg-gradient-to-r from-blue-500 to-blue-600"
          )}>
            <Textarea
              ref={textareaRef}
              placeholder={window.innerWidth < 640 ? "Prompt your search" : (isAIMode ? (placeholder || "Ask me anything: 'Find CNC machines', 'Show automotive suppliers', 'Electronics companies in Germany'...") : "Prompt your search")}
              value={animationActive && !query ? typedPlaceholder : query}
              onChange={(e) => {
                updateQuery(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch(e);
                }
              }}
              onMouseDown={() => {
                setAnimationActive(false);
                if (textareaRef.current) textareaRef.current.style.height = defaultHeight();
              }}
              onFocus={() => setAnimationActive(false)}
              rows={1}
              className={cn(
                "pl-12 sm:pl-16 pr-28 sm:pr-44 text-xs sm:text-lg font-medium border-0 focus:ring-0 focus:outline-none resize-none overflow-y-hidden",
                "bg-white/95 dark:bg-black/95 focus:bg-white/95 dark:focus:bg-black/95 backdrop-blur-xl rounded-xl shadow-inner placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0",
                animationActive && !query ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
              )}
              style={{
                height: window.innerWidth < 640 ? '40px' : '56px',
                minHeight: window.innerWidth < 640 ? '40px' : '56px',
                maxHeight: '120px',
                lineHeight: window.innerWidth < 640 ? '20px' : '24px',
                padding: window.innerWidth < 640 ? '10px 0' : '16px 0',
                paddingLeft: window.innerWidth < 640 ? '3rem' : '4rem',
                paddingRight: window.innerWidth < 640 ? '7rem' : '11rem',
              }}
            />

            {/* Live AI Typing Indicator */}
            {isAIMode && isAILoading && (
              <div className="absolute right-24 sm:right-36 top-1/2 -translate-y-1/2 flex items-center space-x-1 sm:space-x-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 font-medium">AI thinking...</span>
              </div>
            )}

            {/* DeepSearch Badge - Opens DeepSearch page directly */}
            <div className="absolute right-1.5 sm:right-4 top-1/2 -translate-y-1/2 z-10">
              <button
                type="button"
                onClick={() => {
                  if (textareaRef.current) {
                    textareaRef.current.style.height = window.innerWidth < 640 ? '40px' : '56px';
                  }
                  if (query.trim()) {
                    setLocation(`/deepsearch?q=${encodeURIComponent(query.trim())}`);
                  } else {
                    setLocation('/deepsearch');
                  }
                }}
                className="flex items-center px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-md shadow-sm shadow-blue-500/25 border border-white/10 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                <span className="text-[10px] sm:text-xs font-medium text-white ml-1">DeepSearch</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* DeepSearch Examples Link — anchored just below the collapsed bar, outside the growing form container */}
      {isHomePage && (
        <p
          className="absolute left-0 right-0 text-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 z-20"
          style={{ top: formWrapperHeight + 8 }}
        >
          Need inspiration?{" "}
          <button
            type="button"
            onClick={() => {
              const isHomePageNow = window.location.pathname === '/home';
              if (isHomePageNow) {
                const element = document.getElementById('deepsearch-examples');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              } else {
                setLocation('/home#deepsearch-examples');
              }
            }}
            className="text-blue-500 hover:text-blue-400 hover:underline transition-colors cursor-pointer"
            data-testid="link-deepsearch-examples"
          >
            See DeepSearch Prompt Examples
          </button>
        </p>
      )}

      {/* Product AI Chat Modal */}
      {showProductAI && selectedProductForAI && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] sm:max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
                Ask AI about {selectedProductForAI.name}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowProductAI(false);
                  setSelectedProductForAI(null);
                  setProductAIQuery("");
                }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-3 sm:p-4">
              <div className="mb-3 sm:mb-4">
                <h4 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">{selectedProductForAI.name}</h4>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{selectedProductForAI.category}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{selectedProductForAI.description}</p>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <Input
                    placeholder="Ask anything about this product..."
                    value={productAIQuery}
                    onChange={(e) => setProductAIQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && productAIQuery.trim()) {
                        // Handle product AI query
                        setProductAIQuery("");
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (productAIQuery.trim()) {
                        // Handle product AI query
                        setProductAIQuery("");
                      }
                    }}
                    disabled={!productAIQuery.trim()}
                    className="flex items-center justify-center space-x-1 w-full sm:w-auto"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-sm">Ask</span>
                  </Button>
                </div>
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Try asking: "What are the specifications?", "Is this compatible with...", "What's the price?"
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
