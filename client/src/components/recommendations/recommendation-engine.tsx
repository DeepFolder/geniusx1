import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Users, Building2, Package, TrendingUp, Eye, MessageCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';

interface RecommendationItem {
  id: number;
  score: number;
  reasons: string[];
  isViewed: boolean;
  isActedUpon: boolean;
  createdAt: string;
}

interface CompanyRecommendation extends RecommendationItem {
  company: {
    id: number;
    name: string;
    industry: string;
    location: string;
    description: string;
    logoUrl?: string;
    capabilities?: string[];
  };
}

interface UserRecommendation extends RecommendationItem {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    headline?: string;
    location?: string;
    profileImageUrl?: string;
    companyId?: number;
    skills?: string[];
  };
}

interface ProductRecommendation extends RecommendationItem {
  product: {
    id: number;
    name: string;
    category: string;
    description: string;
    imageUrl?: string;
    companyId: number;
  };
}

const reasonLabels: Record<string, string> = {
  same_industry: 'Same Industry',
  same_location: 'Same Location',
  common_capabilities: 'Common Capabilities',
  skill_match: 'Skill Match',
  same_company: 'Same Company',
  common_skills: 'Common Skills',
  industry_peer: 'Industry Peer',
  industry_relevant: 'Industry Relevant',
  skill_relevant: 'Skill Relevant',
  capability_match: 'Capability Match'
};

export default function RecommendationEngine() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('companies');

  const { data: companyRecommendations, isLoading: loadingCompanies } = useQuery<CompanyRecommendation[]>({
    queryKey: ['/api/recommendations/companies'],
    enabled: isAuthenticated,
  });

  const { data: connectionRecommendations, isLoading: loadingConnections } = useQuery<UserRecommendation[]>({
    queryKey: ['/api/recommendations/connections'],
    enabled: isAuthenticated,
  });

  const { data: productRecommendations, isLoading: loadingProducts } = useQuery<ProductRecommendation[]>({
    queryKey: ['/api/recommendations/products'],
    enabled: isAuthenticated,
  });

  const trackInteractionMutation = useMutation({
    mutationFn: async (interaction: any) => {
      return apiRequest('/api/interactions', {
        method: 'POST',
        body: JSON.stringify(interaction),
      });
    },
  });

  const markViewedMutation = useMutation({
    mutationFn: async (recommendationId: number) => {
      return apiRequest(`/api/recommendations/${recommendationId}/viewed`, {
        method: 'PUT',
      });
    },
  });

  const markActedUponMutation = useMutation({
    mutationFn: async (recommendationId: number) => {
      return apiRequest(`/api/recommendations/${recommendationId}/acted`, {
        method: 'PUT',
      });
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: async (connectionData: any) => {
      return apiRequest('/api/connections', {
        method: 'POST',
        body: JSON.stringify(connectionData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] });
    },
  });

  const handleRecommendationView = (recommendationId: number, targetType: string, targetId: string) => {
    // Track view interaction
    trackInteractionMutation.mutate({
      targetType,
      targetId,
      interactionType: 'view',
      duration: 0,
      score: 1
    });

    // Mark recommendation as viewed
    markViewedMutation.mutate(recommendationId);
  };

  const handleConnect = (userId: string, recommendationId?: number) => {
    createConnectionMutation.mutate({
      toUserId: userId,
      connectionType: 'potential_lead',
      strength: 1
    });

    if (recommendationId) {
      markActedUponMutation.mutate(recommendationId);
    }

    // Track connection interaction
    trackInteractionMutation.mutate({
      targetType: 'user',
      targetId: userId,
      interactionType: 'contact',
      score: 5
    });
  };

  const handleFollowCompany = (companyId: number, recommendationId?: number) => {
    // Track follow interaction
    trackInteractionMutation.mutate({
      targetType: 'company',
      targetId: companyId.toString(),
      interactionType: 'follow',
      score: 3
    });

    if (recommendationId) {
      markActedUponMutation.mutate(recommendationId);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-blue-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please log in to view personalized recommendations.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Intelligent Recommendations
        </h1>
        <p className="text-muted-foreground mt-2">
          AI-powered suggestions based on your industry, skills, and networking patterns
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="companies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="connections" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            People
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="space-y-4">
          {loadingCompanies ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {companyRecommendations?.map((rec: CompanyRecommendation) => (
                <Card 
                  key={rec.company.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleRecommendationView(rec.id, 'company', rec.company.id.toString())}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{rec.company.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getScoreColor(rec.score)}`}></div>
                        <span className="text-xs font-medium">{rec.score}%</span>
                      </div>
                    </div>
                    <CardDescription>{rec.company.industry}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {rec.company.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-1">
                      {rec.reasons.map((reason) => (
                        <Badge key={reason} variant="secondary" className="text-xs">
                          {reasonLabels[reason] || reason}
                        </Badge>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{rec.company.location}</span>
                      <Button 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFollowCompany(rec.company.id, rec.id);
                        }}
                      >
                        <TrendingUp className="h-4 w-4 mr-1" />
                        Follow
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          {loadingConnections ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectionRecommendations?.map((rec: UserRecommendation) => (
                <Card 
                  key={rec.user.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleRecommendationView(rec.id, 'user', rec.user.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={rec.user.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {rec.user.firstName?.[0]}{rec.user.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {rec.user.firstName} {rec.user.lastName}
                        </CardTitle>
                        <CardDescription>{rec.user.headline}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getScoreColor(rec.score)}`}></div>
                        <span className="text-xs font-medium">{rec.score}%</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {rec.reasons.map((reason) => (
                        <Badge key={reason} variant="secondary" className="text-xs">
                          {reasonLabels[reason] || reason}
                        </Badge>
                      ))}
                    </div>

                    {rec.user.skills && rec.user.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rec.user.skills.slice(0, 3).map((skill) => (
                          <Badge key={skill} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {rec.user.skills.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{rec.user.skills.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}

                    <Separator />

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{rec.user.location}</span>
                      <Button 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(rec.user.id, rec.id);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Connect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          {loadingProducts ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {productRecommendations?.map((rec: ProductRecommendation) => (
                <Card 
                  key={rec.product.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleRecommendationView(rec.id, 'product', rec.product.id.toString())}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{rec.product.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getScoreColor(rec.score)}`}></div>
                        <span className="text-xs font-medium">{rec.score}%</span>
                      </div>
                    </div>
                    <CardDescription>{rec.product.category}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {rec.product.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-1">
                      {rec.reasons.map((reason) => (
                        <Badge key={reason} variant="secondary" className="text-xs">
                          {reasonLabels[reason] || reason}
                        </Badge>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Navigate to product details
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}