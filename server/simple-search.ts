import { storage } from "./storage";
import { getEnhancedUserContext, retrieveContext } from "./services/ai-service.js";
import { semanticSearch, ensureSemanticSearchInitialized } from "./services/semantic-search.js";

// Business intent patterns for intelligent search
const BUSINESS_INTENT_PATTERNS = {
  sourcing: ['supplier', 'vendor', 'source', 'buy', 'purchase', 'procurement'],
  technology: ['innovation', 'technology', 'solution', 'system', 'equipment'],
  partnership: ['partner', 'collaborate', 'alliance', 'joint', 'cooperation'],
  automation: ['automate', 'robot', 'automated', 'smart', 'intelligent'],
  manufacturing: ['manufacture', 'production', 'assembly', 'fabrication'],
  quality: ['quality', 'precision', 'certification', 'standard', 'testing'],
  location: ['near', 'local', 'region', 'country', 'location', 'area']
};

// Enhanced search with business intelligence and semantic search
export async function simpleSearch(
  query: string, 
  userId?: string, 
  context?: any
): Promise<{ companies: any[], products: any[], metadata: any }> {
  try {
    console.log(`🔍 Starting intelligent search for: "${query}"`);
    
    // Ensure semantic search is initialized
    await ensureSemanticSearchInitialized();
    
    // Get user context for personalization
    let userContext = null;
    if (userId) {
      userContext = await getEnhancedUserContext(userId);
    }
    
    // Analyze search intent
    const searchIntent = analyzeSearchIntent(query);
    
    // Run keyword search
    const keywordResults = await storage.searchAll(query);
    
    // Run semantic search in parallel
    let semanticResults: any[] = [];
    try {
      semanticResults = await semanticSearch(query, 30);
    } catch (error) {
      console.warn("Semantic search failed, using keyword-only results:", error);
    }
    
    // Merge and deduplicate results using hybrid approach
    const mergedResults = mergeSearchResults(keywordResults, semanticResults, query);
    
    // Apply intelligent ranking with business context
    const rankedResults = await applyIntelligentRanking(
      mergedResults, 
      query, 
      searchIntent, 
      userContext
    );
    
    // Get AI-enhanced context for better understanding
    let aiContext = [];
    try {
      aiContext = await retrieveContext(query, undefined, 5, userContext);
    } catch (error) {
      console.warn("AI context retrieval failed:", error);
    }
    
    console.log(`🔍 Intelligent search for "${query}" found:`, {
      companies: rankedResults.companies.length,
      products: rankedResults.products.length,
      intent: searchIntent.primary,
      semanticMatches: semanticResults.length,
      aiContextItems: aiContext.length
    });

    return {
      ...rankedResults,
      metadata: {
        searchIntent,
        userContext: userContext?.userProfile || null,
        aiContextItems: aiContext.length,
        semanticMatches: semanticResults.length,
        totalResults: rankedResults.companies.length + rankedResults.products.length,
        query,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error("Intelligent search error:", error);
    return { 
      companies: [], 
      products: [], 
      metadata: { 
        error: 'Search failed', 
        searchIntent: { primary: 'unknown', confidence: 0, keywords: [] },
        query,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Merge keyword and semantic search results with hybrid scoring
function mergeSearchResults(
  keywordResults: { companies: any[], products: any[] },
  semanticResults: any[],
  query: string
): { companies: any[], products: any[] } {
  const companiesMap = new Map<number, any>();
  const productsMap = new Map<number, any>();
  
  // Add keyword results with keyword score
  for (const company of keywordResults.companies) {
    companiesMap.set(company.id, {
      ...company,
      _keywordScore: 1.0,
      _semanticScore: 0,
    });
  }
  
  for (const product of keywordResults.products) {
    productsMap.set(product.id, {
      ...product,
      _keywordScore: 1.0,
      _semanticScore: 0,
    });
  }
  
  // Merge in semantic results with similarity scores
  for (const result of semanticResults) {
    if (result.entityType === 'company') {
      const existing = companiesMap.get(result.entityId);
      if (existing) {
        existing._semanticScore = result.similarityScore;
      } else {
        companiesMap.set(result.entityId, {
          ...result.entity,
          _keywordScore: 0,
          _semanticScore: result.similarityScore,
        });
      }
    } else if (result.entityType === 'product') {
      const existing = productsMap.get(result.entityId);
      if (existing) {
        existing._semanticScore = result.similarityScore;
      } else {
        productsMap.set(result.entityId, {
          ...result.entity,
          _keywordScore: 0,
          _semanticScore: result.similarityScore,
        });
      }
    }
  }
  
  // Calculate hybrid scores (weighted combination)
  const companies = Array.from(companiesMap.values()).map(company => ({
    ...company,
    _hybridScore: (company._keywordScore * 0.6) + (company._semanticScore * 0.4)
  }));
  
  const products = Array.from(productsMap.values()).map(product => ({
    ...product,
    _hybridScore: (product._keywordScore * 0.6) + (product._semanticScore * 0.4)
  }));
  
  // Sort by hybrid score
  companies.sort((a, b) => b._hybridScore - a._hybridScore);
  products.sort((a, b) => b._hybridScore - a._hybridScore);
  
  return {
    companies: companies.map(({ _keywordScore, _semanticScore, _hybridScore, ...company }) => company),
    products: products.map(({ _keywordScore, _semanticScore, _hybridScore, ...product }) => product)
  };
}

// Analyze business intent from search query
function analyzeSearchIntent(query: string): {
  primary: string;
  confidence: number;
  keywords: string[];
} {
  const lowerQuery = query.toLowerCase();
  const detectedIntents: { intent: string; score: number; matches: string[] }[] = [];
  
  // Check each intent pattern
  for (const [intent, patterns] of Object.entries(BUSINESS_INTENT_PATTERNS)) {
    const matches = patterns.filter(pattern => lowerQuery.includes(pattern));
    if (matches.length > 0) {
      detectedIntents.push({
        intent,
        score: matches.length / patterns.length,
        matches
      });
    }
  }
  
  // Sort by score and get primary intent
  detectedIntents.sort((a, b) => b.score - a.score);
  
  if (detectedIntents.length > 0) {
    const primary = detectedIntents[0];
    return {
      primary: primary.intent,
      confidence: Math.min(primary.score * (primary.matches.length * 0.5), 1.0),
      keywords: primary.matches
    };
  }
  
  return {
    primary: 'general',
    confidence: 0.3,
    keywords: []
  };
}

// Apply intelligent ranking based on business context
async function applyIntelligentRanking(
  results: { companies: any[], products: any[] },
  query: string,
  searchIntent: any,
  userContext: any
): Promise<{ companies: any[], products: any[] }> {
  
  // Get user's followed companies for prioritization
  let followedCompanyIds: Set<number> = new Set();
  if (userContext?.userId) {
    try {
      const follows = await storage.getUserFollows(userContext.userId);
      followedCompanyIds = new Set(follows.map(f => f.companyId));
    } catch (error) {
      console.warn("Failed to fetch user follows:", error);
    }
  }
  
  // Enhanced company ranking
  const rankedCompanies = results.companies.map(company => {
    let score = 1; // Base score
    
    // Boost followed companies significantly
    if (followedCompanyIds.has(company.id)) {
      score += 0.8; // Strong boost for followed companies
    }
    
    // Intent-based scoring
    if (searchIntent.primary === 'sourcing' && company.capabilities?.length > 0) {
      score += 0.3;
    }
    if (searchIntent.primary === 'partnership' && company.employeeCount === 'Large') {
      score += 0.2;
    }
    if (searchIntent.primary === 'location' && userContext?.businessContext?.companyLocation) {
      if (company.location?.includes(userContext.businessContext.companyLocation)) {
        score += 0.4;
      }
    }
    
    // User context scoring
    if (userContext?.userProfile?.industry === company.industry) {
      score += 0.25; // Same industry bonus
    }
    
    // Query relevance in description
    const queryWords = query.toLowerCase().split(' ');
    let descriptionMatches = 0;
    for (const word of queryWords) {
      if (company.description?.toLowerCase().includes(word)) {
        descriptionMatches++;
      }
    }
    score += (descriptionMatches / queryWords.length) * 0.2;
    
    return { ...company, _searchScore: score };
  })
  .sort((a, b) => b._searchScore - a._searchScore)
  .map(({ _searchScore, ...company }) => company); // Remove score from final result
  
  // Enhanced product ranking
  const rankedProducts = results.products.map(product => {
    let score = 1; // Base score
    
    // Boost products from followed companies significantly
    if (product.companyId && followedCompanyIds.has(product.companyId)) {
      score += 1.0; // Very strong boost for products from followed companies
    }
    
    // Intent-based scoring
    if (searchIntent.primary === 'automation' && product.category?.toLowerCase().includes('robot')) {
      score += 0.3;
    }
    if (searchIntent.primary === 'technology' && product.description?.toLowerCase().includes('innovation')) {
      score += 0.2;
    }
    
    // User behavior scoring
    if (userContext?.userBehavior?.preferredCategories?.includes(product.category)) {
      score += 0.3;
    }
    
    // Query relevance
    const queryWords = query.toLowerCase().split(' ');
    let matches = 0;
    for (const word of queryWords) {
      if (product.name?.toLowerCase().includes(word) || 
          product.description?.toLowerCase().includes(word)) {
        matches++;
      }
    }
    score += (matches / queryWords.length) * 0.25;
    
    return { ...product, _searchScore: score };
  })
  .sort((a, b) => b._searchScore - a._searchScore)
  .map(({ _searchScore, ...product }) => product); // Remove score from final result
  
  return {
    companies: rankedCompanies,
    products: rankedProducts
  };
}

// Legacy function for backward compatibility
export async function legacySimpleSearch(query: string): Promise<{ companies: any[], products: any[] }> {
  const result = await simpleSearch(query);
  return {
    companies: result.companies,
    products: result.products
  };
}