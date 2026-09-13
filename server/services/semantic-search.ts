import OpenAI from 'openai';
import { createLazyOpenAI } from "./openai-client.js";
import { db } from '../db.js';
import { searchEmbeddings, companies, products } from '../../shared/schema.js';
import { eq, and, sql, or, ilike } from 'drizzle-orm';

const openai = createLazyOpenAI();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Query intent types for knowledge graph
export type QueryIntent = 
  | 'find_company' 
  | 'find_product' 
  | 'find_products_by_company'
  | 'find_companies_by_category'
  | 'general_search'
  | 'question';

export interface ParsedQuery {
  intent: QueryIntent;
  entity?: string;
  entityType?: 'company' | 'product' | 'category';
  originalQuery: string;
  extractedTerms: string[];
  confidence: number;
}

export interface SemanticSearchResult {
  entityType: 'company' | 'product';
  entityId: number;
  similarityScore: number;
  entity: any;
}

// Knowledge Graph for intelligent entity recognition
class KnowledgeGraph {
  private companyNames: Map<string, number> = new Map();
  private productNames: Map<string, number> = new Map();
  private categories: Set<string> = new Set();
  private companyAliases: Map<string, string> = new Map();
  private lastUpdate: number = 0;
  private updateInterval: number = 60000; // 1 minute

  async initialize() {
    await this.updateGraph();
  }

  async updateGraph() {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }

    try {
      const allCompanies = await db.select().from(companies);
      this.companyNames.clear();
      this.companyAliases.clear();
      
      for (const company of allCompanies) {
        const lowerName = company.name.toLowerCase();
        this.companyNames.set(lowerName, company.id);
        
        // Extract word variations
        const words = lowerName.split(/\s+/);
        for (const word of words) {
          if (word.length > 3) {
            this.companyAliases.set(word, lowerName);
          }
        }
        
        // Handle compressed names like "DeepFolder" -> "deepfolder"
        const compressedName = lowerName.replace(/\s+/g, '');
        if (compressedName !== lowerName) {
          this.companyAliases.set(compressedName, lowerName);
        }
      }

      const allProducts = await db.select().from(products);
      this.productNames.clear();
      this.categories.clear();
      
      for (const product of allProducts) {
        this.productNames.set(product.name.toLowerCase(), product.id);
        if (product.category) {
          this.categories.add(product.category.toLowerCase());
        }
      }

      this.lastUpdate = now;
      console.log(`📊 Knowledge graph updated: ${this.companyNames.size} companies, ${this.productNames.size} products`);
    } catch (error) {
      console.error('Failed to update knowledge graph:', error);
    }
  }

  findCompany(query: string): { name: string; id: number } | null {
    const lowerQuery = query.toLowerCase().trim();
    
    // Direct match
    if (this.companyNames.has(lowerQuery)) {
      return { name: lowerQuery, id: this.companyNames.get(lowerQuery)! };
    }
    
    // Alias match
    if (this.companyAliases.has(lowerQuery)) {
      const officialName = this.companyAliases.get(lowerQuery)!;
      return { name: officialName, id: this.companyNames.get(officialName)! };
    }
    
    // Partial match
    for (const [name, id] of this.companyNames.entries()) {
      if (name.includes(lowerQuery) || lowerQuery.includes(name)) {
        return { name, id };
      }
    }
    
    return null;
  }

  findProduct(query: string): { name: string; id: number } | null {
    const lowerQuery = query.toLowerCase().trim();
    
    if (this.productNames.has(lowerQuery)) {
      return { name: lowerQuery, id: this.productNames.get(lowerQuery)! };
    }
    
    for (const [name, id] of this.productNames.entries()) {
      if (name.includes(lowerQuery) || lowerQuery.includes(name)) {
        return { name, id };
      }
    }
    
    return null;
  }

  findCategory(query: string): string | null {
    const lowerQuery = query.toLowerCase().trim();
    
    for (const category of this.categories) {
      if (category.includes(lowerQuery) || lowerQuery.includes(category)) {
        return category;
      }
    }
    
    return null;
  }
}

const knowledgeGraph = new KnowledgeGraph();

// Semantic query parser with pattern matching
export async function parseSemanticQuery(query: string): Promise<ParsedQuery> {
  await knowledgeGraph.updateGraph();
  
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  
  // Pattern matching for common query structures
  const patterns = [
    {
      regex: /(?:find|show|get|search|look\s+for)\s+(?:me\s+)?(?:the\s+)?company\s+(.+)/i,
      intent: 'find_company' as QueryIntent,
      extract: (match: RegExpMatchArray) => match[1]
    },
    {
      regex: /(?:find|show|get|search|look\s+for)\s+(?:me\s+)?(?:the\s+)?product\s+(.+)/i,
      intent: 'find_product' as QueryIntent,
      extract: (match: RegExpMatchArray) => match[1]
    },
    {
      regex: /(?:find|show|get|search)\s+(?:me\s+)?(?:products|items)\s+(?:from|by|of)\s+(.+)/i,
      intent: 'find_products_by_company' as QueryIntent,
      extract: (match: RegExpMatchArray) => match[1]
    },
    {
      regex: /(?:what|which)\s+companies\s+(?:make|manufacture|produce|sell)\s+(.+)/i,
      intent: 'find_companies_by_category' as QueryIntent,
      extract: (match: RegExpMatchArray) => match[1]
    },
  ];

  // Try pattern matching
  for (const pattern of patterns) {
    const match = query.match(pattern.regex);
    if (match) {
      const entityQuery = pattern.extract(match);
      
      // Try to resolve entity
      if (pattern.intent === 'find_company' || pattern.intent === 'find_products_by_company') {
        const company = knowledgeGraph.findCompany(entityQuery);
        if (company) {
          return {
            intent: pattern.intent,
            entity: company.name,
            entityType: 'company',
            originalQuery: query,
            extractedTerms: [company.name],
            confidence: 0.95
          };
        }
      } else if (pattern.intent === 'find_product') {
        const product = knowledgeGraph.findProduct(entityQuery);
        if (product) {
          return {
            intent: pattern.intent,
            entity: product.name,
            entityType: 'product',
            originalQuery: query,
            extractedTerms: [product.name],
            confidence: 0.95
          };
        }
      } else if (pattern.intent === 'find_companies_by_category') {
        const category = knowledgeGraph.findCategory(entityQuery);
        if (category) {
          return {
            intent: pattern.intent,
            entity: category,
            entityType: 'category',
            originalQuery: query,
            extractedTerms: [category],
            confidence: 0.9
          };
        }
      }
      
      // Pattern matched but entity not found
      return {
        intent: pattern.intent,
        entity: entityQuery,
        entityType: pattern.intent.includes('company') ? 'company' : 'product',
        originalQuery: query,
        extractedTerms: entityQuery.split(/\s+/),
        confidence: 0.7
      };
    }
  }

  // Check if it's a question
  if (lowerQuery.match(/^(?:what|why|how|when|where|who|which|can|do|does|is|are)/)) {
    return {
      intent: 'question',
      originalQuery: query,
      extractedTerms: words.filter(w => w.length > 3),
      confidence: 0.8
    };
  }

  // Try entity recognition without patterns
  const company = knowledgeGraph.findCompany(query);
  if (company) {
    return {
      intent: 'find_company',
      entity: company.name,
      entityType: 'company',
      originalQuery: query,
      extractedTerms: [company.name],
      confidence: 0.85
    };
  }

  const product = knowledgeGraph.findProduct(query);
  if (product) {
    return {
      intent: 'find_product',
      entity: product.name,
      entityType: 'product',
      originalQuery: query,
      extractedTerms: [product.name],
      confidence: 0.85
    };
  }

  // Fallback to general search
  return {
    intent: 'general_search',
    originalQuery: query,
    extractedTerms: words.filter(w => w.length > 2),
    confidence: 0.5
  };
}

// Execute semantic search based on parsed query
export async function executeSemanticSearch(parsedQuery: ParsedQuery): Promise<any> {
  try {
    switch (parsedQuery.intent) {
      case 'find_company': {
        // Use originalQuery to find ALL matching companies
        const searchTerm = parsedQuery.originalQuery;
        const results = await db.select().from(companies)
          .where(
            or(
              ilike(companies.name, `%${searchTerm}%`),
              ilike(companies.description, `%${searchTerm}%`)
            )
          );
        
        return { companies: results, products: [] };
      }

      case 'find_product': {
        // Use originalQuery instead of entity to find ALL matching products
        // This ensures "gearbox" finds both "Worm Gearbox" and "Gearbox AI"
        const searchTerm = parsedQuery.originalQuery;
        const results = await db.select().from(products)
          .where(
            or(
              ilike(products.name, `%${searchTerm}%`),
              ilike(products.description, `%${searchTerm}%`)
            )
          );
        
        return { companies: [], products: results };
      }

      case 'find_products_by_company': {
        const companyResults = await db.select().from(companies)
          .where(ilike(companies.name, `%${parsedQuery.entity}%`));
        
        if (companyResults.length > 0) {
          const companyId = companyResults[0].id;
          const productResults = await db.select().from(products)
            .where(eq(products.companyId, companyId));
          
          return { companies: companyResults, products: productResults };
        }
        
        return { companies: [], products: [] };
      }

      case 'find_companies_by_category': {
        const productResults = await db.select().from(products)
          .where(ilike(products.category, `%${parsedQuery.entity}%`));
        
        const companyIds = [...new Set(productResults.map(p => p.companyId))].filter(id => id !== null);
        if (companyIds.length > 0) {
          const companyResults = await db.select().from(companies)
            .where(sql`${companies.id} = ANY(${companyIds})`);
          
          return { companies: companyResults, products: productResults };
        }
        
        return { companies: [], products: productResults };
      }

      case 'general_search':
      default: {
        // Guard against empty extractedTerms
        if (parsedQuery.extractedTerms.length === 0) {
          return { companies: [], products: [] };
        }
        
        const companyResults = await db.select().from(companies)
          .where(
            or(
              ...parsedQuery.extractedTerms.map(term =>
                or(
                  ilike(companies.name, `%${term}%`),
                  ilike(companies.description, `%${term}%`),
                  ilike(companies.industry, `%${term}%`)
                )
              )
            )
          );
        
        const productResults = await db.select().from(products)
          .where(
            or(
              ...parsedQuery.extractedTerms.map(term =>
                or(
                  ilike(products.name, `%${term}%`),
                  ilike(products.description, `%${term}%`),
                  ilike(products.category, `%${term}%`)
                )
              )
            )
          );
        
        return { companies: companyResults, products: productResults };
      }
    }
  } catch (error) {
    console.error('Semantic search execution error:', error);
    return { companies: [], products: [] };
  }
}

// Initialize knowledge graph
export async function initializeKnowledgeGraph() {
  await knowledgeGraph.initialize();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('❌ Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

export async function saveEmbedding(
  entityType: 'company' | 'product',
  entityId: number,
  textContent: string
): Promise<void> {
  try {
    const embedding = await generateEmbedding(textContent);
    const embeddingJson = JSON.stringify(embedding);
    
    await db.insert(searchEmbeddings)
      .values({
        entityType,
        entityId,
        embedding: embeddingJson,
        textContent,
      })
      .onConflictDoUpdate({
        target: [searchEmbeddings.entityType, searchEmbeddings.entityId],
        set: {
          embedding: embeddingJson,
          textContent,
          updatedAt: new Date(),
        },
      });
    
    console.log(`✅ Saved embedding for ${entityType} ${entityId}`);
  } catch (error) {
    console.error(`❌ Error saving embedding for ${entityType} ${entityId}:`, error);
    throw error;
  }
}

export async function semanticSearch(
  query: string,
  limit: number = 20
): Promise<SemanticSearchResult[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    const allEmbeddings = await db.select().from(searchEmbeddings);
    
    const results: SemanticSearchResult[] = [];
    
    for (const embeddingRow of allEmbeddings) {
      const storedEmbedding = JSON.parse(embeddingRow.embedding);
      const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
      
      let entity;
      if (embeddingRow.entityType === 'company') {
        const companyResults = await db.select()
          .from(companies)
          .where(eq(companies.id, embeddingRow.entityId))
          .limit(1);
        entity = companyResults[0];
      } else {
        const productResults = await db.select()
          .from(products)
          .where(eq(products.id, embeddingRow.entityId))
          .limit(1);
        entity = productResults[0];
      }
      
      if (entity) {
        results.push({
          entityType: embeddingRow.entityType,
          entityId: embeddingRow.entityId,
          similarityScore: similarity,
          entity,
        });
      }
    }
    
    results.sort((a, b) => b.similarityScore - a.similarityScore);
    
    return results.slice(0, limit);
  } catch (error) {
    console.error('❌ Semantic search error:', error);
    return [];
  }
}

export async function generateCompanyEmbedding(company: any): Promise<void> {
  const textContent = `${company.name} - ${company.description} - Industry: ${company.industry} - Location: ${company.location} - Capabilities: ${company.capabilities?.join(', ') || 'N/A'} - Services: ${company.servicesOffered?.join(', ') || 'N/A'}`;
  await saveEmbedding('company', company.id, textContent);
}

export async function generateProductEmbedding(product: any): Promise<void> {
  const textContent = `${product.name} - ${product.description} - Category: ${product.category || 'N/A'} - Specifications: ${product.specifications || 'N/A'}`;
  await saveEmbedding('product', product.id, textContent);
}

export async function initializeSemanticSearchIndex(): Promise<void> {
  try {
    console.log('🚀 Initializing semantic search index...');
    
    const allCompanies = await db.select().from(companies);
    const allProducts = await db.select().from(products);
    
    console.log(`📊 Found ${allCompanies.length} companies and ${allProducts.length} products`);
    
    let companyCount = 0;
    for (const company of allCompanies) {
      try {
        await generateCompanyEmbedding(company);
        companyCount++;
        if (companyCount % 5 === 0) {
          console.log(`  ✓ Processed ${companyCount}/${allCompanies.length} companies`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to generate embedding for company ${company.id}:`, error);
      }
    }
    
    let productCount = 0;
    for (const product of allProducts) {
      try {
        await generateProductEmbedding(product);
        productCount++;
        if (productCount % 10 === 0) {
          console.log(`  ✓ Processed ${productCount}/${allProducts.length} products`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to generate embedding for product ${product.id}:`, error);
      }
    }
    
    console.log(`✅ Semantic search index initialized: ${companyCount} companies, ${productCount} products`);
  } catch (error) {
    console.error('❌ Error initializing semantic search index:', error);
  }
}

let isInitializing = false;

export async function ensureSemanticSearchInitialized(): Promise<void> {
  if (isInitializing) {
    console.log('⏳ Semantic search initialization already in progress...');
    return;
  }
  
  try {
    const existingCount = await db.select({ count: sql<number>`count(*)` })
      .from(searchEmbeddings);
    
    if (existingCount[0]?.count === 0) {
      isInitializing = true;
      console.log('🔄 No embeddings found, initializing semantic search index...');
      await initializeSemanticSearchIndex();
      isInitializing = false;
    } else {
      console.log(`✓ Semantic search ready with ${existingCount[0]?.count} embeddings`);
    }
  } catch (error) {
    isInitializing = false;
    console.error('❌ Error checking semantic search initialization:', error);
  }
}
