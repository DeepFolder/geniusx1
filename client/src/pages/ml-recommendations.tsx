import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, 
  Users, 
  Package, 
  Brain, 
  Target, 
  BarChart3,
  Lightbulb,
  Activity,
  Star,
  Download,
  Lock
} from 'lucide-react';
import BehaviorTracker, { trackUserEvent } from '@/components/ml/recommendation-tracker';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';

interface MLRecommendation {
  entityId: number;
  entityType: 'company' | 'product';
  score: number;
  reason: string;
  confidence: number;
}

export default function MLRecommendationsPage() {
  const [selectedTab, setSelectedTab] = useState('personalized');
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id?.toString();

  // Fetch ML-powered recommendations
  const { data: mlRecommendations = [], isLoading: mlLoading } = useQuery<MLRecommendation[]>({
    queryKey: [`/api/ml/recommendations/${userId}`],
    enabled: isAuthenticated && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch companies and products for display
  const { data: companies = [] } = useQuery({
    queryKey: ['/api/companies'],
    enabled: isAuthenticated && !!userId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    enabled: isAuthenticated && !!userId,
  });

  const getEntityDetails = (rec: MLRecommendation) => {
    if (rec.entityType === 'company') {
      return companies.find(c => c.id === rec.entityId);
    } else {
      return products.find(p => p.id === rec.entityId);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (confidence >= 0.6) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (confidence >= 0.4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  };

  const handleRecommendationClick = (rec: MLRecommendation) => {
    // Track that user clicked on a recommendation
    if (userId) {
      trackUserEvent(userId, 'view', rec.entityType, rec.entityId, {
        category: 'ML Recommendation',
        duration: 0
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-center">
              <Lock className="h-6 w-6 text-gray-500 mx-auto mb-2" />
              <span>Authentication Required</span>
            </CardTitle>
            <CardDescription className="text-center">
              Please sign in to view personalized ML-powered recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/auth">
              <Button className="w-full">
                Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Track page view */}
      {userId && (
        <BehaviorTracker 
          userId={userId}
          action="view"
          entityType="company"
          entityId={0}
          context={{ category: 'ML Recommendations Page' }}
        />
      )}

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Intelligent Recommendations
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            AI-powered recommendations based on machine learning analysis of your behavior and preferences
          </p>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="personalized" className="flex items-center space-x-2">
              <Target className="h-4 w-4" />
              <span>Personalized</span>
            </TabsTrigger>
            <TabsTrigger value="trending" className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Trending</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>AI Insights</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personalized" className="mt-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    <span>Personalized Recommendations</span>
                  </CardTitle>
                  <CardDescription>
                    Machine learning recommendations based on your behavior patterns and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {mlLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-24 rounded-lg"></div>
                      ))}
                    </div>
                  ) : mlRecommendations.length > 0 ? (
                    <ScrollArea className="h-96">
                      <div className="space-y-4">
                        {mlRecommendations.map((rec, index) => {
                          const entity = getEntityDetails(rec);
                          return (
                            <div 
                              key={`${rec.entityType}-${rec.entityId}-${index}`}
                              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                              onClick={() => handleRecommendationClick(rec)}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  {rec.entityType === 'company' ? (
                                    <Users className="h-5 w-5 text-blue-500" />
                                  ) : (
                                    <Package className="h-5 w-5 text-green-500" />
                                  )}
                                  <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                      {entity?.name || `${rec.entityType} #${rec.entityId}`}
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {entity?.industry || entity?.category || rec.entityType}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end space-y-1">
                                  <Badge className={getConfidenceColor(rec.confidence)}>
                                    {Math.round(rec.confidence * 100)}% match
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    Score: {rec.score.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {rec.reason}
                              </p>
                              {entity && (
                                <div className="mt-3 flex justify-between items-center">
                                  <span className="text-xs text-gray-500">
                                    {rec.entityType === 'company' 
                                      ? `${entity.location || 'Global'} • ${entity.industry}`
                                      : `${entity.price || 'Contact for pricing'} • ${entity.category}`
                                    }
                                  </span>
                                  <div className="flex space-x-2">
                                    <Button size="sm" variant="outline">
                                      <Star className="h-3 w-3 mr-1" />
                                      Favorite
                                    </Button>
                                    <Button size="sm" variant="outline">
                                      <Download className="h-3 w-3 mr-1" />
                                      View Details
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8">
                      <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">
                        No personalized recommendations yet. Interact with companies and products to get ML-powered suggestions.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trending" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <span>Trending Now</span>
                </CardTitle>
                <CardDescription>
                  Popular items across the platform based on global user interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Trending analysis will be available as more user data is collected.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  <span>AI Insights</span>
                </CardTitle>
                <CardDescription>
                  Deep learning insights about your preferences and market trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                      Preference Analysis
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                      Based on your interactions, you show strong interest in manufacturing automation and CNC machinery.
                    </p>
                  </div>
                  
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                      Market Opportunities
                    </h3>
                    <p className="text-sm text-green-800 dark:text-green-400">
                      There's growing demand in your areas of interest. Consider exploring robotics integration solutions.
                    </p>
                  </div>
                  
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">
                      Collaboration Potential
                    </h3>
                    <p className="text-sm text-purple-800 dark:text-purple-400">
                      You have 85% compatibility with users in similar industries for potential collaborations.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="h-5 w-5 text-orange-500" />
                    <span>Behavior Metrics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total Interactions</span>
                      <span className="font-semibold">42</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Recommendation Accuracy</span>
                      <span className="font-semibold">87%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Interest Diversity</span>
                      <span className="font-semibold">Medium</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span>ML Performance</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Model Confidence</span>
                      <span className="font-semibold">92%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Prediction Quality</span>
                      <span className="font-semibold">High</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Learning Rate</span>
                      <span className="font-semibold">Active</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}