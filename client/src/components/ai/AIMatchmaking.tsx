import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Users, 
  TrendingUp, 
  Target, 
  Zap, 
  Star,
  ArrowRight,
  Brain,
  Handshake
} from "lucide-react";

interface MatchingSuggestion {
  id: string;
  type: 'partnership' | 'supplier' | 'customer' | 'collaboration';
  company: {
    id: number;
    name: string;
    industry: string;
    location: string;
    colorTheme: string;
    logoPath?: string;
  };
  matchScore: number;
  reasons: string[];
  potentialValue: string;
  actionItems: string[];
  compatibility: {
    industry: number;
    location: number;
    scale: number;
    expertise: number;
  };
}

interface AIMatchmakingProps {
  companyId: number;
}

export default function AIMatchmaking({ companyId }: AIMatchmakingProps) {
  const [activeTab, setActiveTab] = useState<'partnerships' | 'suppliers' | 'customers'>('partnerships');
  
  const { data: suggestions, isLoading } = useQuery<MatchingSuggestion[]>({
    queryKey: ['/api/ai/matchmaking', companyId, activeTab],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: insights } = useQuery({
    queryKey: ['/api/ai/market-insights', companyId],
    refetchInterval: 600000, // Refresh every 10 minutes
  });

  const getMatchTypeIcon = (type: string) => {
    switch (type) {
      case 'partnership': return <Handshake className="w-4 h-4" />;
      case 'supplier': return <Target className="w-4 h-4" />;
      case 'customer': return <Users className="w-4 h-4" />;
      default: return <Brain className="w-4 h-4" />;
    }
  };

  const getMatchTypeColor = (type: string) => {
    switch (type) {
      case 'partnership': return 'bg-blue-500';
      case 'supplier': return 'bg-green-500';
      case 'customer': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI-Powered Matchmaking</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Discover strategic partnerships and business opportunities
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
            <Zap className="w-3 h-3 mr-1" />
            AI Active
          </Badge>
        </div>
      </div>

      {/* Market Insights */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <span>Market Insights</span>
            </CardTitle>
            <CardDescription>
              AI-powered analysis of current market trends and opportunities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Industry Growth</div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">+{insights.growthRate}%</div>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-sm font-medium text-green-700 dark:text-green-300">New Opportunities</div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100">{insights.opportunities}</div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div className="text-sm font-medium text-purple-700 dark:text-purple-300">Match Score</div>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{insights.avgMatchScore}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {[
          { key: 'partnerships', label: 'Strategic Partnerships', icon: Handshake },
          { key: 'suppliers', label: 'Potential Suppliers', icon: Target },
          { key: 'customers', label: 'Target Customers', icon: Users }
        ].map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeTab === key ? 'default' : 'ghost'}
            onClick={() => setActiveTab(key as any)}
            className="flex-1 flex items-center justify-center space-x-2"
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>

      {/* Suggestions */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gray-300 dark:bg-gray-700 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          suggestions?.map((suggestion) => (
            <Card key={suggestion.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Company Logo/Avatar */}
                    <div className="relative">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: suggestion.company.colorTheme }}
                      >
                        {suggestion.company.logoPath ? (
                          <img 
                            src={suggestion.company.logoPath} 
                            alt={suggestion.company.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          suggestion.company.name.charAt(0)
                        )}
                      </div>
                      <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${getMatchTypeColor(suggestion.type)}`}>
                        {getMatchTypeIcon(suggestion.type)}
                      </div>
                    </div>

                    {/* Company Info */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {suggestion.company.name}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {suggestion.company.industry}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {suggestion.company.location}
                      </p>

                      {/* Match Score */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Match Score
                          </span>
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            {suggestion.matchScore}%
                          </span>
                        </div>
                        <Progress value={suggestion.matchScore} className="h-2" />
                      </div>

                      {/* Compatibility Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        {Object.entries(suggestion.compatibility).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {key}
                            </div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              {value}%
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Reasons */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Why this match:
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.reasons.map((reason, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Potential Value */}
                      <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">
                          Potential Value
                        </div>
                        <div className="text-sm text-green-600 dark:text-green-400">
                          {suggestion.potentialValue}
                        </div>
                      </div>

                      {/* Action Items */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Recommended Actions:
                        </h4>
                        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          {suggestion.actionItems.map((item, index) => (
                            <li key={index} className="flex items-start">
                              <ArrowRight className="w-3 h-3 mr-2 mt-0.5 text-blue-500 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col space-y-2">
                    <Link href={`/company/${suggestion.company.id}`}>
                      <Button size="sm" className="w-full">
                        View Profile
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="w-full">
                      Connect
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Empty State */}
      {!isLoading && (!suggestions || suggestions.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              No matches found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Our AI is analyzing the market for new opportunities. Check back soon!
            </p>
            <Button variant="outline">
              Refresh Analysis
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}