import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Type definitions for RSS news integration
interface NewsArticle {
  id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  date: string;
  readTime: string;
  tags: string[];
  priority: string;
  trending?: boolean;
  companyLogo: string;
  company: string;
  gradient: string;
  confidence?: number;
  link: string;
  image?: string;
}

interface NewsData {
  trending: NewsArticle[];
  insights: NewsArticle[];
  predictions: NewsArticle[];
}

interface RSSArticle {
  title: string;
  description: string;
  pubDate: Date;
  link: string;
  image?: string;
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  Brain, 
  BarChart3,
  Calendar, 
  ExternalLink,
  ArrowRight,
  Star,
  Clock,
  Building,
  Package
} from "lucide-react";

export default function NewsUpdatesPage() {
  const [activeTab, setActiveTab] = useState("trending");

  // Fallback content must be defined before use
  
  // Gradient themes for different news categories
  const gradientThemes = [
    'from-blue-600 via-purple-600 to-indigo-800',
    'from-orange-400 via-red-500 to-pink-600', 
    'from-green-500 via-emerald-600 to-teal-700',
    'from-gray-700 via-gray-800 to-black',
    'from-purple-600 via-violet-600 to-purple-800',
    'from-indigo-600 via-purple-700 to-pink-700'
  ];

  // Categorize articles based on keywords
  const categorizeArticle = (title: string, description: string) => {
    const content = `${title} ${description || ''}`.toLowerCase();
    
    // Prediction keywords
    if (content.match(/will|predict|forecast|future|2025|2026|expect|trend|likely/)) {
      return {
        category: 'predictions',
        confidence: Math.floor(Math.random() * 20) + 70 // 70-90%
      };
    }
    
    // Insights keywords  
    if (content.match(/analysis|study|research|report|insight|data|market|survey/)) {
      return { category: 'insights' };
    }
    
    // Default to trending
    return { category: 'trending' };
  };

  // Extract company from title/description
  const extractCompany = (title: string, description: string) => {
    const content = `${title} ${description || ''}`;
    const companies = ['Apple', 'Google', 'Microsoft', 'Amazon', 'Tesla', 'Meta', 'OpenAI', 'Anthropic', 'NVIDIA', 'Intel'];
    
    for (const company of companies) {
      if (content.includes(company)) {
        return company;
      }
    }
    
    return 'TechNews';
  };

  // Helper functions for processing articles
  const getCategoryName = (category: string, title: string) => {
    if (category === 'predictions') {
      if (title.toLowerCase().includes('ai')) return 'AI Prediction';
      if (title.toLowerCase().includes('tech')) return 'Technology Forecast';
      return 'Market Prediction';
    }
    if (category === 'insights') {
      if (title.toLowerCase().includes('market')) return 'Market Analysis';
      if (title.toLowerCase().includes('tech')) return 'Technology Trends';
      return 'Business Insights';
    }
    return 'Breaking News';
  };
  
  const extractTags = (title: string, description: string) => {
    const content = `${title} ${description || ''}`.toLowerCase();
    const allTags = ['AI', 'Technology', 'Manufacturing', 'Business', 'Innovation', 'Market', 'Investment', 'Startup'];
    
    return allTags.filter(tag => content.includes(tag.toLowerCase())).slice(0, 3);
  };

  // Fetch live RSS news using React Query - moved after fallback data definitions
  const { data: newsData, isLoading: loading, error, refetch: fetchLiveNews } = useQuery({
    queryKey: ['/api/news'],
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchInterval: 15 * 60 * 1000, // Auto-refresh every 15 minutes
    retry: 2
  });

  // Fallback static content (original beautiful design preserved)
  const fallbackTrendingNews = [
    {
      id: 1,
      title: "DeepFolder to follow Revolut and Klarna with launch of mobile banking platform",
      description: "Revolutionary AI-powered platform transforms B2B manufacturing discovery with neural network-driven recommendations and real-time market insights.",
      category: "Legal Proceeding",
      type: "announcement",
      date: "2025-01-20",
      readTime: "4 min read", 
      tags: ["AI", "Manufacturing", "B2B"],
      priority: "high",
      trending: true,
      companyLogo: "M",
      company: "Monzo",
      image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=300&fit=crop",
      gradient: "from-orange-400 via-red-500 to-pink-600"
    },
    {
      id: 2,
      title: "It is probable that Anthropic will raise funding at $60B valuation",
      description: "Major funding round expected as AI company continues rapid growth in enterprise market with Claude AI assistant technology.",
      category: "Funding Prediction",
      type: "prediction",
      date: "2025-01-19",
      readTime: "3 min read",
      tags: ["Funding", "AI", "Valuation"],
      priority: "high",
      trending: true,
      companyLogo: "A",
      company: "Anthropic",
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=300&fit=crop",
      gradient: "from-blue-600 via-purple-600 to-indigo-800"
    },
    {
      id: 3,
      title: "CoreWeave secures $12B in data center expansion",
      description: "AI cloud infrastructure company announces massive expansion to meet growing demand for GPU computing resources.",
      category: "Infrastructure",
      type: "expansion",
      date: "2025-01-18",
      readTime: "5 min read",
      tags: ["Infrastructure", "Cloud", "AI"],
      priority: "medium",
      trending: true,
      companyLogo: "CW",
      company: "CoreWeave",
      image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=300&fit=crop",
      gradient: "from-gray-700 via-gray-800 to-black"
    }
  ];

  const fallbackInsights = [
    {
      id: 4,
      title: "European Investment Bank increases funding for clean tech",
      description: "Major financial institution commits €15B to sustainable technology initiatives across manufacturing and energy sectors.",
      category: "Investment",
      type: "insight",
      date: "2025-01-17",
      readTime: "6 min read",
      tags: ["CleanTech", "Investment", "Europe"],
      priority: "high",
      companyLogo: "EIB",
      company: "European Investment Bank",
      gradient: "from-green-600 via-emerald-600 to-teal-700"
    },
    {
      id: 5,
      title: "Manufacturing automation reaches 85% adoption in Germany",
      description: "Comprehensive study reveals rapid digitalization of production facilities across automotive and industrial sectors.",
      category: "Market Analysis",
      type: "analysis",
      date: "2025-01-16",
      readTime: "8 min read",
      tags: ["Automation", "Germany", "Manufacturing"],
      priority: "medium",
      gradient: "from-blue-500 via-cyan-500 to-blue-600"
    },
    {
      id: 6,
      title: "B2B platforms see 340% growth in AI adoption",
      description: "Enterprise software companies integrate machine learning capabilities to enhance user experience and operational efficiency.",
      category: "Technology Trends",
      type: "trend",
      date: "2025-01-15",
      readTime: "7 min read",
      tags: ["B2B", "AI Adoption", "Enterprise"],
      priority: "medium",
      gradient: "from-purple-600 via-violet-600 to-purple-800"
    }
  ];

  const fallbackPredictions = [
    {
      id: 7,
      title: "Quantum computing will revolutionize supply chain optimization by 2028",
      description: "Advanced algorithms expected to reduce logistics costs by 45% through real-time route optimization and demand forecasting.",
      category: "Quantum Computing",
      type: "prediction",
      date: "2025-01-14",
      readTime: "9 min read",
      tags: ["Quantum", "Supply Chain", "Optimization"],
      priority: "high",
      confidence: 78,
      gradient: "from-indigo-600 via-purple-700 to-pink-700"
    },
    {
      id: 8,
      title: "Sustainable manufacturing will capture 60% market share",
      description: "Green production methods predicted to dominate industrial sectors driven by regulatory requirements and cost advantages.",
      category: "Sustainability",
      type: "prediction",
      date: "2025-01-13",
      readTime: "6 min read",
      tags: ["Sustainability", "Manufacturing", "Market"],
      priority: "medium",
      confidence: 85,
      gradient: "from-green-500 via-emerald-600 to-teal-700"
    },
    {
      id: 9,
      title: "AI assistants will handle 70% of B2B customer interactions",
      description: "Intelligent chatbots and virtual assistants expected to transform business communication and support workflows.",
      category: "AI Automation",
      type: "prediction",
      date: "2025-01-12",
      readTime: "5 min read",
      tags: ["AI", "Customer Service", "Automation"],
      priority: "medium",
      confidence: 72,
      gradient: "from-blue-600 via-indigo-600 to-purple-700"
    }
  ];

  // Fallback to static content if RSS fails
  const fallbackNewsData = {
    trending: fallbackTrendingNews.map(item => ({ ...item, link: '#' })),
    insights: fallbackInsights.map(item => ({ ...item, link: '#' })),
    predictions: fallbackPredictions.map(item => ({ ...item, link: '#' }))
  };

  const getNewsData = () => {
    // Use live RSS data or fallback to static content
    const currentData = newsData || fallbackNewsData;
    
    if (loading || !currentData) {
      return [];
    }
    
    switch (activeTab) {
      case "trending":
        return currentData.trending || [];
      case "insights":
        return currentData.insights || [];
      case "predictions":
        return currentData.predictions || [];
      default:
        return currentData.trending || [];
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const NewsCard = ({ item, isLarge = false }: { item: any, isLarge?: boolean }) => (
    <Card className={`group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-white dark:bg-gray-900 overflow-hidden ${
      isLarge ? 'col-span-2 row-span-2' : ''
    }`}>
      <div className="relative">
        {/* Background gradient or image */}
        <div className={`h-${isLarge ? '48' : '32'} bg-gradient-to-br ${item.gradient || 'from-blue-600 to-purple-700'} relative overflow-hidden`}>
          {item.image && (
            <img 
              src={item.image} 
              alt={item.title}
              className="w-full h-full object-cover opacity-60"
            />
          )}
          {/* Company logo/icon */}
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-black/20 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {item.companyLogo || item.company?.charAt(0) || 'D'}
              </span>
            </div>
            <span className="text-white font-semibold text-lg">
              {item.company || 'DeepFolder'}
            </span>
          </div>
          
          {/* Category badge */}
          <div className="absolute bottom-4 left-4">
            <Badge 
              variant="secondary" 
              className="bg-white/90 text-gray-900 hover:bg-white border-0"
            >
              {activeTab === 'predictions' && item.confidence && (
                <BarChart3 className="w-3 h-3 mr-1" />
              )}
              {item.category}
            </Badge>
          </div>

          {/* Confidence for predictions */}
          {activeTab === 'predictions' && item.confidence && (
            <div className="absolute top-4 right-4">
              <Badge variant="outline" className="bg-white/10 border-white/20 text-white">
                {item.confidence}% confidence
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="w-4 h-4" />
              {formatDate(item.date)}
              <span>•</span>
              <Clock className="w-4 h-4" />
              {item.readTime}
            </div>
            {item.trending && (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                <TrendingUp className="w-3 h-3 mr-1" />
                Trending
              </Badge>
            )}
          </div>

          <h3 className={`font-bold text-gray-900 dark:text-white mb-3 group-hover:text-blue-600 transition-colors ${
            isLarge ? 'text-xl' : 'text-lg'
          }`}>
            {item.title}
          </h3>

          <p className={`text-gray-600 dark:text-gray-300 mb-4 ${
            isLarge ? 'text-base' : 'text-sm'
          }`}>
            {item.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 3).map((tag: string, index: number) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-blue-600 hover:text-blue-700 p-2"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );

  return (
    <div className="relative min-h-screen">
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Business Intelligence & Market Insights
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Stay informed with the latest trends, insights, and predictions in manufacturing and B2B technology
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-white dark:bg-gray-900 p-1 rounded-xl shadow-sm">
            <TabsTrigger 
              value="trending" 
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <TrendingUp className="w-4 h-4" />
              Trending
            </TabsTrigger>
            <TabsTrigger 
              value="insights" 
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <Brain className="w-4 h-4" />
              Insights
              <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 text-xs">
                New
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="predictions" 
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <BarChart3 className="w-4 h-4" />
              Predictions
              <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 text-xs">
                New
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value={activeTab} className="mt-0">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Loading skeletons */}
                {[...Array(6)].map((_, index) => (
                  <Card key={index} className="bg-white dark:bg-gray-900 overflow-hidden animate-pulse">
                    <div className="h-32 bg-gray-300 dark:bg-gray-700"></div>
                    <CardContent className="p-4">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded mb-2"></div>
                      <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded mb-4"></div>
                      <div className="flex gap-2">
                        <div className="h-6 w-16 bg-gray-300 dark:bg-gray-700 rounded"></div>
                        <div className="h-6 w-20 bg-gray-300 dark:bg-gray-700 rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                  <CardContent className="p-6">
                    <Clock className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                      News Loading
                    </h3>
                    <p className="text-yellow-600 dark:text-yellow-300 mb-4">
                      {error?.message || 'Failed to load news'}
                    </p>
                    <Button 
                      onClick={() => fetchLiveNews()}
                      variant="outline" 
                      className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                    >
                      Retry Loading News
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getNewsData().map((item: any, index: number) => (
                  <NewsCard 
                    key={item.id} 
                    item={item} 
                    isLarge={index === 0 && activeTab === 'trending'}
                  />
                ))}
                
                {/* Live News Indicator */}
                <div className="col-span-full mt-4">
                  <div className="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                    Live news updated every 15 minutes • Last refresh: {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Call to Action */}
        <div className="mt-12 text-center">
          <Card className="bg-gradient-to-r from-blue-600 to-purple-700 border-0 text-white">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">
                Learn about the companies that matter to you (for free)
              </h3>
              <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
                Get personalized private market analysis and stay ahead of industry trends with AI-powered insights
              </p>
              <Button 
                size="lg" 
                className="bg-white text-blue-600 hover:bg-gray-100 font-semibold"
              >
                Get personalized private market analysis 
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}