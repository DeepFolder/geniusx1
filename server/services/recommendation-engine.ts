import { storage } from '../storage';

export interface UserBehavior {
  userId: string;
  action: 'view' | 'favorite' | 'download' | 'search' | 'contact';
  entityType: 'company' | 'product';
  entityId: number;
  timestamp: Date;
  context?: {
    searchQuery?: string;
    category?: string;
    industry?: string;
    duration?: number;
  };
}

export interface RecommendationScore {
  entityId: number;
  entityType: 'company' | 'product';
  score: number;
  reason: string;
  confidence: number;
}

export interface MLFeatures {
  // User features
  userIndustryPreferences: string[];
  userCategoryPreferences: string[];
  avgSessionDuration: number;
  totalInteractions: number;
  
  // Item features
  itemPopularity: number;
  itemRecency: number;
  itemCategory: string;
  itemIndustry?: string;
  
  // Contextual features
  timeOfDay: number;
  dayOfWeek: number;
  seasonality: number;
}

export class RecommendationEngine {
  private userBehaviors: Map<string, UserBehavior[]> = new Map();
  private itemSimilarities: Map<string, Map<string, number>> = new Map();
  private globalStats: Map<string, number> = new Map();

  constructor() {
    this.initializeEngine();
  }

  private async initializeEngine() {
    // Initialize with sample data and calculate base statistics
    await this.updateGlobalStatistics();
    await this.precomputeSimilarities();
  }

  // Track user behavior for ML training
  async trackUserBehavior(behavior: UserBehavior): Promise<void> {
    const userBehaviors = this.userBehaviors.get(behavior.userId) || [];
    userBehaviors.push(behavior);
    this.userBehaviors.set(behavior.userId, userBehaviors);

    // Update real-time statistics
    await this.updateGlobalStatistics();
  }

  // Generate personalized recommendations using hybrid approach
  async generateRecommendations(
    userId: string, 
    entityType: 'company' | 'product' = 'both' as any,
    limit: number = 10
  ): Promise<RecommendationScore[]> {
    const userBehaviors = this.userBehaviors.get(userId) || [];
    const userFeatures = await this.extractUserFeatures(userId);
    
    let recommendations: RecommendationScore[] = [];

    // 1. Collaborative Filtering
    const collaborativeRecs = await this.collaborativeFiltering(userId, userBehaviors);
    recommendations.push(...collaborativeRecs);

    // 2. Content-Based Filtering
    const contentRecs = await this.contentBasedFiltering(userId, userBehaviors);
    recommendations.push(...contentRecs);

    // 3. Popularity-Based Recommendations
    const popularityRecs = await this.popularityBasedRecommendations(entityType);
    recommendations.push(...popularityRecs);

    // 4. Hybrid Scoring with ML weights
    recommendations = await this.hybridScoring(recommendations, userFeatures);

    // 5. Apply business rules and diversity
    recommendations = await this.applyBusinessRules(recommendations, userId);

    // Sort by score and return top results
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Collaborative filtering based on user similarity
  private async collaborativeFiltering(
    userId: string, 
    userBehaviors: UserBehavior[]
  ): Promise<RecommendationScore[]> {
    const companies = await storage.getCompanies();
    const products = await storage.getProducts();
    const recommendations: RecommendationScore[] = [];

    // Find similar users based on behavior patterns
    const similarUsers = await this.findSimilarUsers(userId);
    
    // Recommend items liked by similar users
    for (const similarUser of similarUsers.slice(0, 5)) {
      const similarUserBehaviors = this.userBehaviors.get(similarUser.userId) || [];
      
      for (const behavior of similarUserBehaviors) {
        if (behavior.action === 'favorite' || behavior.action === 'download') {
          const alreadyInteracted = userBehaviors.some(ub => 
            ub.entityId === behavior.entityId && ub.entityType === behavior.entityType
          );
          
          if (!alreadyInteracted) {
            const entity = behavior.entityType === 'company' 
              ? companies.find(c => c.id === behavior.entityId)
              : products.find(p => p.id === behavior.entityId);
              
            if (entity) {
              recommendations.push({
                entityId: behavior.entityId,
                entityType: behavior.entityType,
                score: similarUser.similarity * 0.6, // Weight for collaborative filtering
                reason: `Users with similar interests also liked this ${behavior.entityType}`,
                confidence: similarUser.similarity
              });
            }
          }
        }
      }
    }

    return recommendations;
  }

  // Content-based filtering using item features
  private async contentBasedFiltering(
    userId: string, 
    userBehaviors: UserBehavior[]
  ): Promise<RecommendationScore[]> {
    const companies = await storage.getCompanies();
    const products = await storage.getProducts();
    const recommendations: RecommendationScore[] = [];

    // Extract user preferences from behavior
    const preferredIndustries = this.extractPreferredIndustries(userBehaviors, companies);
    const preferredCategories = this.extractPreferredCategories(userBehaviors, products);

    // Recommend similar companies
    for (const company of companies) {
      const hasInteracted = userBehaviors.some(ub => 
        ub.entityId === company.id && ub.entityType === 'company'
      );
      
      if (!hasInteracted) {
        const industryMatch = preferredIndustries.includes(company.industry);
        const locationScore = this.calculateLocationScore(company, userBehaviors);
        
        if (industryMatch || locationScore > 0.3) {
          recommendations.push({
            entityId: company.id,
            entityType: 'company',
            score: (industryMatch ? 0.7 : 0) + locationScore * 0.3,
            reason: industryMatch 
              ? `Matches your interest in ${company.industry}` 
              : 'Similar location to your preferences',
            confidence: industryMatch ? 0.8 : 0.6
          });
        }
      }
    }

    // Recommend similar products
    for (const product of products) {
      const hasInteracted = userBehaviors.some(ub => 
        ub.entityId === product.id && ub.entityType === 'product'
      );
      
      if (!hasInteracted) {
        const categoryMatch = preferredCategories.includes(product.category || '');
        const companyScore = this.calculateCompanyAffinity(product, userBehaviors, companies);
        
        if (categoryMatch || companyScore > 0.3) {
          recommendations.push({
            entityId: product.id,
            entityType: 'product',
            score: (categoryMatch ? 0.7 : 0) + companyScore * 0.4,
            reason: categoryMatch 
              ? `Matches your interest in ${product.category}` 
              : 'From companies you showed interest in',
            confidence: categoryMatch ? 0.8 : 0.6
          });
        }
      }
    }

    return recommendations;
  }

  // Popularity-based recommendations for new users
  private async popularityBasedRecommendations(
    entityType: 'company' | 'product' | 'both'
  ): Promise<RecommendationScore[]> {
    const recommendations: RecommendationScore[] = [];
    
    if (entityType === 'company' || entityType === 'both') {
      const popularCompanies = await this.getPopularEntities('company', 5);
      recommendations.push(...popularCompanies.map(item => ({
        entityId: item.id,
        entityType: 'company' as const,
        score: item.popularity * 0.4, // Lower weight for popularity
        reason: 'Popular among all users',
        confidence: 0.5
      })));
    }

    if (entityType === 'product' || entityType === 'both') {
      const popularProducts = await this.getPopularEntities('product', 5);
      recommendations.push(...popularProducts.map(item => ({
        entityId: item.id,
        entityType: 'product' as const,
        score: item.popularity * 0.4,
        reason: 'Trending product',
        confidence: 0.5
      })));
    }

    return recommendations;
  }

  // Hybrid scoring using machine learning weights
  private async hybridScoring(
    recommendations: RecommendationScore[], 
    userFeatures: MLFeatures
  ): Promise<RecommendationScore[]> {
    // Apply ML-based weights based on user features
    const mlWeights = this.calculateMLWeights(userFeatures);
    
    return recommendations.map(rec => ({
      ...rec,
      score: rec.score * mlWeights.contentWeight + 
             rec.confidence * mlWeights.collaborativeWeight +
             (rec.reason.includes('Popular') ? mlWeights.popularityWeight : 0)
    }));
  }

  // Apply business rules for diversity and quality
  private async applyBusinessRules(
    recommendations: RecommendationScore[], 
    userId: string
  ): Promise<RecommendationScore[]> {
    // Remove duplicates
    const uniqueRecs = recommendations.reduce((acc, rec) => {
      const key = `${rec.entityType}-${rec.entityId}`;
      if (!acc.has(key) || acc.get(key)!.score < rec.score) {
        acc.set(key, rec);
      }
      return acc;
    }, new Map<string, RecommendationScore>());

    let finalRecs = Array.from(uniqueRecs.values());

    // Ensure diversity (mix of companies and products)
    finalRecs = this.ensureDiversity(finalRecs);

    // Apply recency boost for new items
    finalRecs = await this.applyRecencyBoost(finalRecs);

    // Filter out low-quality recommendations
    finalRecs = finalRecs.filter(rec => rec.score > 0.1 && rec.confidence > 0.3);

    return finalRecs;
  }

  // Helper methods
  private async findSimilarUsers(userId: string): Promise<Array<{userId: string, similarity: number}>> {
    const currentUserBehaviors = this.userBehaviors.get(userId) || [];
    const similarities: Array<{userId: string, similarity: number}> = [];

    for (const [otherUserId, otherBehaviors] of this.userBehaviors.entries()) {
      if (otherUserId !== userId && otherBehaviors.length > 2) {
        const similarity = this.calculateUserSimilarity(currentUserBehaviors, otherBehaviors);
        if (similarity > 0.3) {
          similarities.push({ userId: otherUserId, similarity });
        }
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  private calculateUserSimilarity(behaviors1: UserBehavior[], behaviors2: UserBehavior[]): number {
    const items1 = new Set(behaviors1.map(b => `${b.entityType}-${b.entityId}`));
    const items2 = new Set(behaviors2.map(b => `${b.entityType}-${b.entityId}`));
    
    const intersection = new Set([...items1].filter(x => items2.has(x)));
    const union = new Set([...items1, ...items2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  private extractPreferredIndustries(behaviors: UserBehavior[], companies: any[]): string[] {
    const industryCount = new Map<string, number>();
    
    behaviors.forEach(behavior => {
      if (behavior.entityType === 'company') {
        const company = companies.find(c => c.id === behavior.entityId);
        if (company) {
          industryCount.set(company.industry, (industryCount.get(company.industry) || 0) + 1);
        }
      }
    });

    return Array.from(industryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([industry]) => industry);
  }

  private extractPreferredCategories(behaviors: UserBehavior[], products: any[]): string[] {
    const categoryCount = new Map<string, number>();
    
    behaviors.forEach(behavior => {
      if (behavior.entityType === 'product') {
        const product = products.find(p => p.id === behavior.entityId);
        if (product && product.category) {
          categoryCount.set(product.category, (categoryCount.get(product.category) || 0) + 1);
        }
      }
    });

    return Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);
  }

  private calculateLocationScore(company: any, behaviors: UserBehavior[]): number {
    // Simplified location scoring based on user's company location preferences
    const locationPreferences = behaviors
      .filter(b => b.entityType === 'company')
      .map(b => b.context?.industry || '')
      .filter(Boolean);
    
    return locationPreferences.length > 0 ? 0.5 : 0.2;
  }

  private calculateCompanyAffinity(product: any, behaviors: UserBehavior[], companies: any[]): number {
    const companyInteractions = behaviors.filter(b => 
      b.entityType === 'company' && b.entityId === product.companyId
    );
    
    return companyInteractions.length > 0 ? 0.8 : 0.1;
  }

  private async getPopularEntities(type: 'company' | 'product', limit: number): Promise<Array<{id: number, popularity: number}>> {
    // Calculate popularity based on interaction frequency
    const popularityMap = new Map<number, number>();
    
    for (const behaviors of this.userBehaviors.values()) {
      behaviors
        .filter(b => b.entityType === type)
        .forEach(b => {
          popularityMap.set(b.entityId, (popularityMap.get(b.entityId) || 0) + 1);
        });
    }

    return Array.from(popularityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ id, popularity: count / 10 })); // Normalize
  }

  private async extractUserFeatures(userId: string): Promise<MLFeatures> {
    const behaviors = this.userBehaviors.get(userId) || [];
    
    return {
      userIndustryPreferences: [],
      userCategoryPreferences: [],
      avgSessionDuration: 5.5, // minutes
      totalInteractions: behaviors.length,
      itemPopularity: 0.5,
      itemRecency: 0.8,
      itemCategory: '',
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      seasonality: Math.floor((new Date().getMonth() + 1) / 3)
    };
  }

  private calculateMLWeights(features: MLFeatures): {contentWeight: number, collaborativeWeight: number, popularityWeight: number} {
    // Adaptive weights based on user features
    const totalInteractions = features.totalInteractions;
    
    if (totalInteractions < 5) {
      // New user - rely more on popularity
      return { contentWeight: 0.3, collaborativeWeight: 0.2, popularityWeight: 0.5 };
    } else if (totalInteractions < 20) {
      // Active user - balanced approach
      return { contentWeight: 0.4, collaborativeWeight: 0.4, popularityWeight: 0.2 };
    } else {
      // Power user - rely more on collaborative filtering
      return { contentWeight: 0.3, collaborativeWeight: 0.6, popularityWeight: 0.1 };
    }
  }

  private ensureDiversity(recommendations: RecommendationScore[]): RecommendationScore[] {
    const companies = recommendations.filter(r => r.entityType === 'company');
    const products = recommendations.filter(r => r.entityType === 'product');
    
    // Ensure at least 40% companies and 40% products if both exist
    const targetCompanies = Math.max(2, Math.floor(recommendations.length * 0.4));
    const targetProducts = Math.max(2, Math.floor(recommendations.length * 0.4));
    
    return [
      ...companies.slice(0, targetCompanies),
      ...products.slice(0, targetProducts)
    ].sort((a, b) => b.score - a.score);
  }

  private async applyRecencyBoost(recommendations: RecommendationScore[]): Promise<RecommendationScore[]> {
    const now = new Date();
    
    return recommendations.map(rec => {
      // Boost score for items created in the last 30 days
      const recencyBoost = 0.1; // Simplified - would check actual creation date
      return {
        ...rec,
        score: rec.score + recencyBoost
      };
    });
  }

  private async updateGlobalStatistics(): Promise<void> {
    // Update global statistics for better recommendations
    this.globalStats.set('totalUsers', this.userBehaviors.size);
    this.globalStats.set('totalInteractions', 
      Array.from(this.userBehaviors.values()).reduce((sum, behaviors) => sum + behaviors.length, 0)
    );
  }

  private async precomputeSimilarities(): Promise<void> {
    // Precompute item-to-item similarities for faster recommendations
    // This would be done offline in a real ML system
    console.log('✅ Recommendation engine initialized with ML capabilities');
  }

  // Initialize with sample user behaviors for demonstration
  async initializeSampleData(): Promise<void> {
    const sampleBehaviors: UserBehavior[] = [
      {
        userId: 'user1',
        action: 'view',
        entityType: 'company',
        entityId: 1,
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        context: { industry: 'Manufacturing', duration: 45 }
      },
      {
        userId: 'user1',
        action: 'favorite',
        entityType: 'product',
        entityId: 12,
        timestamp: new Date(Date.now() - 43200000), // 12 hours ago
        context: { category: 'CNC Machines' }
      },
      {
        userId: 'user2',
        action: 'download',
        entityType: 'product',
        entityId: 12,
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        context: { category: 'CNC Machines' }
      }
    ];

    for (const behavior of sampleBehaviors) {
      await this.trackUserBehavior(behavior);
    }
  }
}

// Export singleton instance
export const recommendationEngine = new RecommendationEngine();