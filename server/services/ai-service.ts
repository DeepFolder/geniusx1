import OpenAI from 'openai';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { companies, products, companyDocuments, users, userDownloads, searchQueries } from '../../shared/schema.js';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage.js';
import { ragRetrieval, type RetrievedChunk } from './rag-retrieval.js';
// PDF parsing for document processing
let pdfParse: any;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('PDF parsing not available - document embeddings will be limited');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types for AI service
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  context?: any;
}

export interface ChatContext {
  type: 'global' | 'personal' | 'company' | 'product' | 'document';
  id?: number;
  data?: any;
  sessionId: string;
  userId?: string;
  userProfile?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    companyId?: number;
    companyName?: string;
    industry?: string;
  };
  userBehavior?: {
    recentSearches: string[];
    favoriteCompanies: number[];
    downloadedProducts: number[];
    interactionHistory: any[];
    preferredIndustries: string[];
    preferredCategories: string[];
    interests: string[];
  };
}

export interface RetrievalResult {
  id: number;
  type: 'company' | 'product' | 'document';
  content: string;
  name: string;
  score: number;
  url: string;
  documentInfo?: {
    chunkIndex?: number;
    totalChunks?: number;
    category?: string;
  };
}

export interface AIResponse {
  content: string;
  citations: RetrievalResult[];
  suggestions: string[];
  confidence: number;
  metadata: {
    model: string;
    tokens: number;
    retrievalTime: number;
    generationTime: number;
  };
}

// Enhanced storage for conversations, embeddings, and user context
const conversations: Map<string, ChatMessage[]> = new Map();
const embeddings: Map<string, { vector: number[]; metadata: any }> = new Map();
const userContextCache: Map<string, any> = new Map();
const businessRelationships: Map<string, any[]> = new Map();

// Text chunking utility for document processing
function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 200): string[] {
  if (!text || text.trim().length === 0) return [];
  
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // If adding this sentence would exceed max size, save current chunk and start new one
    if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 6)); // Rough word estimate
      currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  // If no sentence-based chunking worked, split by character count
  if (chunks.length === 0 && text.trim().length > 0) {
    for (let i = 0; i < text.length; i += maxChunkSize - overlap) {
      const chunk = text.substring(i, i + maxChunkSize);
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
    }
  }
  
  return chunks;
}

// Business context scoring for intelligent retrieval
function applyBusinessContextScoring(
  baseSimilarity: number, 
  itemMetadata: any, 
  userContext: any, 
  query: string
): number {
  let enhancedScore = baseSimilarity;
  
  if (!userContext) return enhancedScore;
  
  // Industry relevance boost
  if (userContext.userProfile?.industry && itemMetadata.type === 'company') {
    if (itemMetadata.industry === userContext.userProfile.industry) {
      enhancedScore += 0.2; // Same industry bonus
    }
  }
  
  // User behavior pattern matching
  if (userContext.userBehavior) {
    // Search pattern matching
    const queryLower = query.toLowerCase();
    for (const interest of userContext.userBehavior.interests || []) {
      if (queryLower.includes(interest.toLowerCase())) {
        enhancedScore += 0.15;
      }
    }
    
    // Category preference matching
    if (itemMetadata.category) {
      for (const prefCategory of userContext.userBehavior.preferredCategories || []) {
        if (itemMetadata.category.toLowerCase().includes(prefCategory.toLowerCase())) {
          enhancedScore += 0.1;
        }
      }
    }
    
    // Company interaction history
    if (itemMetadata.type === 'company' && userContext.userBehavior.favoriteCompanies) {
      if (userContext.userBehavior.favoriteCompanies.includes(itemMetadata.id)) {
        enhancedScore += 0.25; // Strong preference for companies user has shown interest in
      }
    }
  }
  
  // Role-based relevance
  if (userContext.userProfile?.role) {
    const role = userContext.userProfile.role;
    
    // Admin users get priority for management-related content
    if (role.includes('admin') && itemMetadata.text?.toLowerCase().includes('manage')) {
      enhancedScore += 0.1;
    }
    
    // Company members get priority for their own company's content
    if (role.includes('company') && itemMetadata.companyId === userContext.userProfile.companyId) {
      enhancedScore += 0.3;
    }
  }
  
  // Recency boost for newer content
  if (itemMetadata.createdAt) {
    const daysSinceCreated = (Date.now() - new Date(itemMetadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 30) {
      enhancedScore += 0.05 * (30 - daysSinceCreated) / 30;
    }
  }
  
  return Math.min(enhancedScore, 1.0); // Cap at 1.0
}

// Simple vector similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Enhanced user context retrieval with business intelligence
export async function getEnhancedUserContext(userId: string): Promise<any> {
  if (!userId) return null;
  
  // Check cache first
  const cached = userContextCache.get(userId);
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
    return cached.data;
  }
  
  try {
    // Get user profile with company info
    const userResult = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      companyId: users.companyId
    }).from(users).where(eq(users.id, userId)).limit(1);
    
    if (userResult.length === 0) return null;
    
    const user = userResult[0];
    let userCompany = null;
    
    // Get user's company info if they have one
    if (user.companyId) {
      const companyResult = await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1);
      if (companyResult.length > 0) {
        userCompany = companyResult[0];
      }
    }
    
    // Get user behavior data
    const recentSearches = await db.select()
      .from(searchQueries)
      .where(eq(searchQueries.userId, userId))
      .orderBy(desc(searchQueries.createdAt))
      .limit(10);
    
    const recentDownloads = await db.select()
      .from(userDownloads)
      .where(eq(userDownloads.userId, userId))
      .orderBy(desc(userDownloads.createdAt))
      .limit(20);
    
    // Extract behavioral patterns
    const searchPatterns = recentSearches.map(s => s.query);
    const downloadedProductIds = recentDownloads.map(d => d.productId);
    
    // Get industry patterns and preferences
    const interactionHistory = await analyzeBehavioralPatterns(userId, searchPatterns, downloadedProductIds);
    
    const context = {
      userProfile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        companyName: userCompany?.name,
        industry: userCompany?.industry
      },
      userBehavior: {
        recentSearches: searchPatterns,
        downloadedProducts: downloadedProductIds,
        interactionHistory,
        preferredIndustries: interactionHistory.industries || [],
        preferredCategories: interactionHistory.categories || []
      },
      businessContext: {
        companySize: userCompany?.employeeCount,
        companyLocation: userCompany?.location,
        companyCapabilities: userCompany?.capabilities || []
      }
    };
    
    // Cache for 5 minutes
    userContextCache.set(userId, {
      data: context,
      timestamp: Date.now()
    });
    
    return context;
  } catch (error) {
    console.error('Error getting enhanced user context:', error);
    return null;
  }
}

// Analyze behavioral patterns for business intelligence
async function analyzeBehavioralPatterns(userId: string, searches: string[], productIds: number[]): Promise<any> {
  try {
    const patterns = {
      industries: new Set<string>(),
      categories: new Set<string>(),
      interests: new Set<string>()
    };
    
    // Analyze search patterns
    for (const search of searches) {
      const lowerSearch = search.toLowerCase();
      if (lowerSearch.includes('cnc') || lowerSearch.includes('machining')) {
        patterns.interests.add('precision_manufacturing');
        patterns.categories.add('CNC Machines');
      }
      if (lowerSearch.includes('robot') || lowerSearch.includes('automation')) {
        patterns.interests.add('automation');
        patterns.categories.add('Robotics');
      }
      if (lowerSearch.includes('sensor') || lowerSearch.includes('iot')) {
        patterns.interests.add('monitoring');
        patterns.categories.add('Sensors');
      }
    }
    
    // Analyze product downloads
    if (productIds.length > 0) {
      const downloadedProducts = await db.select()
        .from(products)
        .where(inArray(products.id, productIds));
      
      for (const product of downloadedProducts) {
        if (product.category) patterns.categories.add(product.category);
        
        // Get company industry for this product
        if (product.companyId) {
          const company = await db.select().from(companies).where(eq(companies.id, product.companyId)).limit(1);
          if (company.length > 0 && company[0].industry) {
            patterns.industries.add(company[0].industry);
          }
        }
      }
    }
    
    return {
      industries: [...patterns.industries],
      categories: [...patterns.categories],
      interests: [...patterns.interests]
    };
  } catch (error) {
    console.error('Error analyzing behavioral patterns:', error);
    return { industries: [], categories: [], interests: [] };
  }
}

// Initialize embeddings index with companies, products, and documents
export async function initializeEmbeddingsIndex(): Promise<void> {
  try {
    console.log('🔍 Building comprehensive embeddings index...');
    
    // Fetch all companies and products
    const allCompanies = await db.select().from(companies);
    const allProducts = await db.select().from(products);
    
    const documents: Array<{ id: string; text: string; type: 'company' | 'product' | 'document'; metadata: any }> = [];
    
    // Prepare company documents
    for (const company of allCompanies) {
      documents.push({
        id: `company_${company.id}`,
        text: `${company.name} - ${company.description} - Industry: ${company.industry} - Location: ${company.location} - Capabilities: ${company.capabilities?.join(', ') || 'N/A'}`,
        type: 'company',
        metadata: company
      });
    }
    
    // Prepare product documents
    for (const product of allProducts) {
      documents.push({
        id: `product_${product.id}`,
        text: `${product.name} - ${product.description} - Category: ${product.category || 'N/A'} - Company ID: ${product.companyId}`,
        type: 'product',
        metadata: product
      });
    }
    
    // Fetch and process company documents
    try {
      const allDocuments = await db.select().from(companyDocuments);
      console.log(`📄 Processing ${allDocuments.length} company documents...`);
      
      for (const doc of allDocuments) {
        if (doc.extractedText && doc.extractedText.trim()) {
          // Use pre-extracted text if available
          const chunks = chunkText(doc.extractedText, 1000, 200); // 1000 chars with 200 char overlap
          chunks.forEach((chunk, index) => {
            documents.push({
              id: `document_${doc.id}_chunk_${index}`,
              text: `${doc.originalName} - ${doc.description || ''} - ${chunk}`,
              type: 'document',
              metadata: {
                ...doc,
                chunkIndex: index,
                totalChunks: chunks.length,
                originalText: chunk
              }
            });
          });
        } else if (doc.fileType === 'application/pdf' && doc.filePath && pdfParse) {
          // Process PDF files if no extracted text exists
          try {
            const filePath = path.resolve(doc.filePath);
            if (fs.existsSync(filePath)) {
              const dataBuffer = fs.readFileSync(filePath);
              const pdfData = await pdfParse(dataBuffer);
              
              if (pdfData.text && pdfData.text.trim()) {
                const chunks = chunkText(pdfData.text, 1000, 200);
                chunks.forEach((chunk, index) => {
                  documents.push({
                    id: `document_${doc.id}_chunk_${index}`,
                    text: `${doc.originalName} - ${doc.description || ''} - ${chunk}`,
                    type: 'document',
                    metadata: {
                      ...doc,
                      chunkIndex: index,
                      totalChunks: chunks.length,
                      originalText: chunk,
                      extractedFromPdf: true
                    }
                  });
                });
                
                // Update database with extracted text for future use
                try {
                  await db.update(companyDocuments)
                    .set({ 
                      extractedText: pdfData.text,
                      isProcessedForAI: true 
                    })
                    .where(eq(companyDocuments.id, doc.id));
                } catch (updateError) {
                  console.warn(`Failed to update document ${doc.id} with extracted text:`, updateError);
                }
              }
            }
          } catch (pdfError) {
            console.warn(`Failed to process PDF document ${doc.originalName}:`, pdfError);
            // Add basic metadata without content for failed PDFs
            documents.push({
              id: `document_${doc.id}_metadata`,
              text: `${doc.originalName} - ${doc.description || ''} - ${doc.category || 'Document'} - PDF file (content not accessible)`,
              type: 'document',
              metadata: { ...doc, processingFailed: true }
            });
          }
        } else {
          // Add metadata for non-PDF or inaccessible documents
          documents.push({
            id: `document_${doc.id}_metadata`,
            text: `${doc.originalName} - ${doc.description || ''} - ${doc.category || 'Document'} - ${doc.tags?.join(', ') || ''}`,
            type: 'document',
            metadata: doc
          });
        }
      }
    } catch (docError) {
      console.warn('Failed to fetch company documents:', docError);
    }
    
    // Generate embeddings in batches
    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch.map(doc => doc.text),
          encoding_format: 'float'
        });
        
        batch.forEach((doc, idx) => {
          embeddings.set(doc.id, {
            vector: response.data[idx].embedding,
            metadata: {
              ...doc.metadata,
              type: doc.type,
              text: doc.text
            }
          });
        });
        
        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error generating embeddings for batch ${i}:`, error);
      }
    }
    
    console.log(`✅ Embeddings index built with ${embeddings.size} documents`);
  } catch (error) {
    console.error('❌ Failed to initialize embeddings index:', error);
  }
}

// Enhanced intelligent retrieval with business context
export async function retrieveContext(
  query: string, 
  contextType?: string, 
  limit: number = 5, 
  userContext?: any
): Promise<RetrievalResult[]> {
  const startTime = Date.now();
  
  try {
    // Generate query embedding
    const queryResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float'
    });
    
    const queryVector = queryResponse.data[0].embedding;
    const results: RetrievalResult[] = [];
    
    // Enhanced scoring with business context
    for (const [id, data] of Array.from(embeddings.entries())) {
      let similarity = cosineSimilarity(queryVector, data.vector);
      
      // Filter by context type if specified
      if (contextType && data.metadata.type !== contextType) {
        continue;
      }
      
      // Apply business intelligence scoring
      similarity = applyBusinessContextScoring(similarity, data.metadata, userContext, query);
      
      let url = '';
      let name = '';
      let documentInfo = {};
      
      if (data.metadata.type === 'company') {
        url = `/company/${data.metadata.id}`;
        name = data.metadata.name;
      } else if (data.metadata.type === 'product') {
        url = `/products/${data.metadata.id}`;
        name = data.metadata.name;
      } else if (data.metadata.type === 'document') {
        url = `/company/${data.metadata.companyId}#documents`; // Link to company documents section
        name = data.metadata.originalName || data.metadata.filename;
        documentInfo = {
          chunkIndex: data.metadata.chunkIndex,
          totalChunks: data.metadata.totalChunks,
          category: data.metadata.category
        };
      }
      
      results.push({
        id: data.metadata.id,
        type: data.metadata.type,
        content: data.metadata.text,
        name,
        score: similarity,
        url,
        documentInfo: Object.keys(documentInfo).length > 0 ? documentInfo : undefined
      });
    }
    
    // Sort by similarity and return top results
    const topResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    console.log(`🔍 Retrieved ${topResults.length} results in ${Date.now() - startTime}ms`);
    return topResults;
  } catch (error) {
    console.error('❌ Retrieval failed:', error);
    return [];
  }
}

// Get conversation history
export function getConversationHistory(sessionId: string, limit: number = 10): ChatMessage[] {
  const history = conversations.get(sessionId) || [];
  return history.slice(-limit);
}

// Add message to conversation
export function addMessage(sessionId: string, message: ChatMessage): void {
  const history = conversations.get(sessionId) || [];
  history.push(message);
  
  // Keep only last 20 messages to prevent memory issues
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
  
  conversations.set(sessionId, history);
}

// Generate intelligent, adaptive system prompt based on context
function generateSystemPrompt(context: ChatContext, retrievalResults: RetrievalResult[], ragChunks: RetrievedChunk[] = []): string {
  const userProfile = context.userProfile;
  const userBehavior = context.userBehavior;
  
  // Dynamic personality based on user role and context
  let personalityPrompt = 'You are DeepFolder\'s intelligent AI assistant, specialized in B2B industrial connections and manufacturing intelligence.';
  
  if (userProfile?.role === 'admin') {
    personalityPrompt += ' You\'re speaking with a platform administrator, so provide comprehensive insights and platform management guidance.';
  } else if (userProfile?.role?.includes('company')) {
    personalityPrompt += ' You\'re speaking with a company representative, so focus on business opportunities, partnerships, and market insights.';
  } else {
    personalityPrompt += ' You\'re speaking with a platform user exploring business opportunities.';
  }
  
  // Personalized context based on user profile
  let contextualPrompt = '';
  if (userProfile) {
    contextualPrompt += `\n\nUSER CONTEXT:\n`;
    contextualPrompt += `- Name: ${userProfile.firstName || 'User'} ${userProfile.lastName || ''}`;
    contextualPrompt += `\n- Role: ${userProfile.role}`;
    
    if (userProfile.companyName) {
      contextualPrompt += `\n- Company: ${userProfile.companyName}`;
      if (userProfile.industry) {
        contextualPrompt += ` (${userProfile.industry})`;
      }
    }
    
    // Add behavioral insights
    if (userBehavior && userBehavior.preferredCategories && userBehavior.preferredCategories.length > 0) {
      contextualPrompt += `\n- Interests: ${userBehavior.preferredCategories.slice(0, 3).join(', ')}`;
    }
    
    if (userBehavior && userBehavior.interests && userBehavior.interests.length > 0) {
      contextualPrompt += `\n- Focus areas: ${userBehavior.interests.slice(0, 3).join(', ')}`;
    }
  }
  
  const basePrompt = `${personalityPrompt}${contextualPrompt}

CRITICAL RULES:
- Maximum 1-2 sentences ONLY - be extremely brief
- Get straight to the point - no extra words
- ONE key fact per response
- No long explanations or details
- Cite sources using [D1], [D2] for documents or [S1], [S2] for data sources

FORMATTING:
- Include links: [Name](/company/123) or [Product](/products/456)
- No lists, no verbose descriptions`;

  let contextPrompt = '';
  
  switch (context.type) {
    case 'company':
      contextPrompt = `\n\nCONTEXT: User is asking about a specific company. Focus on that company's products, capabilities, and business information.`;
      break;
    case 'product':
      contextPrompt = `\n\nCONTEXT: User is asking about a specific product. Provide technical details, specifications, and related company information.`;
      break;
    case 'personal':
      contextPrompt = `\n\nCONTEXT: Personal AI assistant conversation. Help with platform navigation, recommendations, and business insights.`;
      break;
    default:
      contextPrompt = `\n\nCONTEXT: Global search and discovery. Help users find relevant companies and products.`;
  }
  
  // Add RAG document excerpts (priority information source)
  if (ragChunks.length > 0) {
    // Filter to high-confidence chunks (>0.65 score) or top 2-3
    const highConfidenceChunks = ragChunks.filter(c => c.relevanceScore > 0.65);
    const topChunks = (highConfidenceChunks.length > 0 ? highConfidenceChunks : ragChunks).slice(0, 3);
    
    const documentData = topChunks
      .map((chunk, idx) => {
        const metadata: string[] = [];
        if (chunk.pageNumber) metadata.push(`p.${chunk.pageNumber}`);
        if (chunk.sectionHeading) metadata.push(chunk.sectionHeading);
        const metaStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
        
        // Condense chunk to ~200 chars
        let text = chunk.chunkText;
        if (text.length > 200) {
          text = text.substring(0, 197) + '...';
        }
        
        return `[D${idx + 1}] ${chunk.documentName} - ${chunk.companyName}${metaStr}: ${text}`;
      })
      .join('\n');
    
    contextPrompt += `\n\nDOCUMENT EXCERPTS (prioritize these):\n${documentData}`;
    
    // Reduce semantic results when RAG chunks exist
    if (retrievalResults.length > 0) {
      const limitedResults = retrievalResults.slice(0, 2); // Top 2 only
      const contextData = limitedResults
        .map((result, idx) => `[S${idx + 1}] ${result.type.toUpperCase()}: ${result.name} (${result.url}) - ${result.content}`)
        .join('\n');
      
      contextPrompt += `\n\nRELEVANT DATA:\n${contextData}`;
    }
  } else if (retrievalResults.length > 0) {
    // No RAG chunks, use full semantic results
    const contextData = retrievalResults
      .map((result, idx) => `[S${idx + 1}] ${result.type.toUpperCase()}: ${result.name} (${result.url}) - ${result.content}`)
      .join('\n');
    
    contextPrompt += `\n\nRELEVANT DATA:\n${contextData}`;
  }
  
  return basePrompt + contextPrompt;
}

/**
 * Get company IDs accessible to the current user for RAG access control
 * IMPORTANT: Users can only access documents from:
 * 1. Their own company (if they belong to one)
 * 2. Companies they have explicit access to (future: partnerships, paid access, etc.)
 * 
 * This function currently returns ONLY the user's own company to prevent unauthorized access.
 * In the future, this can be expanded to include shared companies or public catalogs.
 */
async function getUserAccessibleCompanyIds(userId?: string, companyId?: number): Promise<number[]> {
  const accessibleCompanyIds: number[] = [];
  
  // CRITICAL: Only include the user's own company
  // Users should NOT have access to other companies' documents unless explicitly granted
  if (companyId) {
    accessibleCompanyIds.push(companyId);
  }
  
  // TODO: In the future, add logic for:
  // - Shared companies (partnerships)
  // - Public catalog access (if company allows public document access)
  // - Paid access tiers
  // - Admin override (platform admins can access all)
  
  return accessibleCompanyIds;
}

/**
 * Condense document chunk for prompt inclusion (~200 chars max)
 */
function condenseChunk(chunk: RetrievedChunk, index: number): string {
  const maxLength = 200;
  let condensed = chunk.chunkText;
  
  if (condensed.length > maxLength) {
    condensed = condensed.substring(0, maxLength - 3) + '...';
  }
  
  // Add citation reference and metadata
  const metadata: string[] = [];
  if (chunk.pageNumber) metadata.push(`p.${chunk.pageNumber}`);
  if (chunk.sectionHeading) metadata.push(chunk.sectionHeading);
  
  const metaStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
  return `[${index + 1}] ${condensed}${metaStr}`;
}

// Enhanced main chat function with intelligent context
export async function* streamChat(
  message: string,
  context: ChatContext,
  temperature: number = 0.3
): AsyncGenerator<{ type: 'token' | 'citation' | 'suggestion' | 'metadata'; content: any }> {
  const startTime = Date.now();
  let totalTokens = 0;
  
  try {
    // Get enhanced user context for personalization
    let enhancedContext = context;
    if (context.userId) {
      const userContextData = await getEnhancedUserContext(context.userId);
      if (userContextData) {
        enhancedContext = {
          ...context,
          userProfile: userContextData.userProfile,
          userBehavior: userContextData.userBehavior
        };
      }
    }
    
    // Parallel retrieval: semantic search + RAG document chunks
    const retrievalStartTime = Date.now();
    
    // Determine RAG retrieval options based on context
    const enableRAG = context.type !== 'personal'; // Skip RAG for personal chats
    const accessibleCompanyIds = enableRAG 
      ? await getUserAccessibleCompanyIds(context.userId, enhancedContext.userProfile?.companyId)
      : [];
    
    // CRITICAL: Initialize ragOptions with explicit company access control
    // ALWAYS set companyIds to prevent unrestricted access - empty array means NO access
    const ragOptions: any = {
      topK: 4, // Top 4 most relevant chunks
      minSimilarityScore: 0.5,
      hybridAlpha: 0.4, // 60% keyword, 40% semantic
      companyIds: [], // DEFAULT: No access (must be explicitly granted)
    };
    
    // Apply context-specific filters with access control validation
    if (context.type === 'company' && context.id) {
      // CRITICAL: Validate that user has access to this company before allowing RAG retrieval
      if (accessibleCompanyIds.includes(context.id)) {
        ragOptions.companyIds = [context.id];
      } else {
        // User doesn't have access to this company - block RAG retrieval
        console.warn(`⚠️  Access denied: User attempted to access company ${context.id} documents without permission`);
        // ragOptions.companyIds already set to [] (deny all)
      }
    } else if (context.type === 'product' && context.id) {
      // CRITICAL: For products, validate company access
      if (accessibleCompanyIds.length > 0) {
        ragOptions.productIds = [context.id];
        ragOptions.companyIds = accessibleCompanyIds; // Filter by accessible companies
      } else {
        console.warn(`⚠️  Access denied: User has no company access for product ${context.id}`);
        // ragOptions.companyIds already set to [] (deny all)
        // ragOptions.productIds not set (deny all)
      }
    } else if (context.type === 'global') {
      // Global context: Only allow access to user's own company
      if (accessibleCompanyIds.length > 0) {
        ragOptions.companyIds = accessibleCompanyIds;
      }
      // If accessibleCompanyIds is empty, ragOptions.companyIds stays [] (deny all)
    }
    // For 'personal' context, RAG is disabled entirely (enableRAG = false)
    
    // Run retrievals in parallel
    const [retrievalResults, ragChunks] = await Promise.all([
      retrieveContext(
        message, 
        context.type === 'global' ? undefined : context.type,
        8,
        enhancedContext.userProfile || enhancedContext.userBehavior ? enhancedContext : undefined
      ),
      enableRAG ? ragRetrieval.retrieveChunks(message, ragOptions).catch(err => {
        console.error('⚠️  RAG retrieval error:', err);
        return [] as RetrievedChunk[];
      }) : Promise.resolve([] as RetrievedChunk[])
    ]);
    
    const retrievalTime = Date.now() - retrievalStartTime;
    console.log(`📊 Retrieval: ${retrievalResults.length} semantic + ${ragChunks.length} RAG chunks in ${retrievalTime}ms`);
    
    // Get conversation history
    const history = getConversationHistory(context.sessionId, 8);
    
    // Generate intelligent system prompt with enhanced context + RAG
    const systemPrompt = generateSystemPrompt(enhancedContext, retrievalResults, ragChunks);
    
    // Prepare messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: message }
    ];
    
    // Start streaming response
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and efficient
      messages,
      temperature,
      max_tokens: 80, // Very short responses - 1-2 sentences max
      stream: true
    });
    
    let fullResponse = '';
    
    // Stream tokens
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        yield { type: 'token', content };
      }
      
      // Track token usage (approximate)
      totalTokens += content?.length || 0;
    }
    
    // Add messages to conversation history
    const userMessage: ChatMessage = {
      id: `${Date.now()}_user`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      context
    };
    
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}_assistant`,
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date(),
      context: { retrievalResults, ragChunks }
    };
    
    addMessage(context.sessionId, userMessage);
    addMessage(context.sessionId, assistantMessage);
    
    // Yield citations (prioritize RAG chunks, then semantic results)
    const allCitations: any[] = [];
    
    // Add RAG chunk citations first (labeled [D1], [D2], [D3])
    if (ragChunks.length > 0) {
      const topRagChunks = ragChunks.slice(0, 3);
      const ragCitations = topRagChunks.map((chunk, idx) => ({
        type: 'document',
        label: `D${idx + 1}`,
        name: chunk.documentName,
        url: `/company/${chunk.companyId}`,
        company: chunk.companyName,
        page: chunk.pageNumber,
        section: chunk.sectionHeading,
        excerpt: chunk.chunkText.substring(0, 200) + (chunk.chunkText.length > 200 ? '...' : ''),
        relevanceScore: chunk.relevanceScore
      }));
      allCitations.push(...ragCitations);
    }
    
    // Add semantic search citations (labeled [S1], [S2])
    if (retrievalResults.length > 0) {
      const limit = ragChunks.length > 0 ? 2 : 3; // Limit to 2 if we have RAG chunks
      const semanticCitations = retrievalResults.slice(0, limit).map((result, idx) => ({
        type: result.type,
        label: `S${idx + 1}`,
        name: result.name,
        url: result.url,
        content: result.content
      }));
      allCitations.push(...semanticCitations);
    }
    
    if (allCitations.length > 0) {
      yield { 
        type: 'citation', 
        content: allCitations
      };
    }
    
    // Generate intelligent follow-up suggestions
    const suggestions = generateIntelligentSuggestions(message, enhancedContext, retrievalResults);
    if (suggestions.length > 0) {
      yield { type: 'suggestion', content: suggestions };
    }
    
    // Yield metadata
    yield { 
      type: 'metadata', 
      content: {
        model: 'gpt-4o-mini',
        tokens: Math.floor(totalTokens / 4), // Rough estimate
        retrievalTime,
        generationTime: Date.now() - startTime,
        citationCount: retrievalResults.length + ragChunks.length,
        ragChunksFound: ragChunks.length,
        semanticResultsFound: retrievalResults.length
      }
    };
    
  } catch (error) {
    console.error('❌ AI Chat Error:', error);
    
    // Intelligent fallback response based on context
    const fallbackResponse = generateIntelligentFallback(message, context, error);
    yield { 
      type: 'token', 
      content: fallbackResponse 
    };
    
    // Provide helpful suggestions even during errors
    const fallbackSuggestions = generateFallbackSuggestions(context);
    if (fallbackSuggestions.length > 0) {
      yield { type: 'suggestion', content: fallbackSuggestions };
    }
  }
}

// Generate intelligent, context-aware suggestions
function generateIntelligentSuggestions(
  message: string, 
  context: ChatContext, 
  results: RetrievalResult[]
): string[] {
  const suggestions: string[] = [];
  const lowercaseMessage = message.toLowerCase();
  const userProfile = context.userProfile;
  const userBehavior = context.userBehavior;
  
  // Role-based suggestions
  if (userProfile?.role === 'admin') {
    suggestions.push(
      "Show platform analytics",
      "What companies need attention?",
      "Show recent user activity"
    );
  } else if (userProfile?.role?.includes('company_admin')) {
    suggestions.push(
      "Update my company profile",
      "Show competitor analysis",
      "What products should we add?"
    );
  }
  
  // Context-specific intelligent suggestions
  if (context.type === 'company' && results.length > 0) {
    const companyResult = results.find(r => r.type === 'company');
    if (companyResult) {
      suggestions.push(
        `Show products from ${companyResult.name}`,
        "Find similar companies",
        "What are their specialties?"
      );
    }
  } else if (context.type === 'product' && results.length > 0) {
    suggestions.push(
      "Show technical specifications", 
      "Find alternative products",
      "Download product documentation"
    );
  }
  
  // Industry-specific suggestions based on user context
  if (userProfile?.industry) {
    const industry = userProfile.industry.toLowerCase();
    if (industry.includes('manufacturing')) {
      suggestions.push(
        "Show automation solutions",
        "Find precision equipment",
        "What's new in manufacturing?"
      );
    } else if (industry.includes('automotive')) {
      suggestions.push(
        "Show automotive suppliers",
        "Find testing equipment",
        "What's trending in automotive?"
      );
    }
  }
  
  // Behavior-based suggestions
  if (userBehavior && userBehavior.interests && userBehavior.interests.length > 0) {
    for (const interest of userBehavior.interests) {
      if (interest === 'automation' && !suggestions.some(s => s.includes('automation'))) {
        suggestions.push("Explore automation technologies");
      } else if (interest === 'precision_manufacturing') {
        suggestions.push("Find precision manufacturing solutions");
      } else if (interest === 'monitoring') {
        suggestions.push("Show monitoring and sensor solutions");
      }
    }
  }
  
  // Content-based intelligent suggestions
  if (lowercaseMessage.includes('cnc') || lowercaseMessage.includes('machining')) {
    suggestions.push(
      "Compare CNC manufacturers", 
      "Show precision machining capabilities",
      "Find tooling suppliers"
    );
  } else if (lowercaseMessage.includes('robot') || lowercaseMessage.includes('automation')) {
    suggestions.push(
      "Compare robotics solutions",
      "Show integration services",
      "Find automation consultants"
    );
  } else if (lowercaseMessage.includes('sensor') || lowercaseMessage.includes('iot')) {
    suggestions.push(
      "Compare sensor technologies",
      "Show IoT platforms",
      "Find system integrators"
    );
  }
  
  // Location-based suggestions if user has company location
  if (userProfile?.companyId && results.length > 0) {
    suggestions.push("Find local suppliers");
  }
  
  // Fallback suggestions for general exploration
  if (suggestions.length === 0) {
    if (userProfile?.role?.includes('company')) {
      suggestions.push(
        "Explore business opportunities",
        "Find potential partners",
        "Discover new technologies"
      );
    } else {
      suggestions.push(
        "Explore featured companies",
        "Discover popular products",
        "What's trending now?"
      );
    }
  }
  
  // Remove duplicates and limit to 3 most relevant suggestions
  const uniqueSuggestions = suggestions.filter((item, index) => suggestions.indexOf(item) === index);
  return uniqueSuggestions.slice(0, 3);
}

// Generate intelligent fallback responses based on context
function generateIntelligentFallback(
  message: string, 
  context: ChatContext, 
  error: any
): string {
  const userProfile = context.userProfile;
  const errorType = error?.message || error?.toString() || 'unknown';
  
  // Personalized greeting based on user context
  let greeting = "I apologize for the technical difficulty";
  if (userProfile?.firstName) {
    greeting = `Hi ${userProfile.firstName}, I apologize for the technical difficulty`;
  }
  
  // Context-aware assistance
  let assistance = "";
  if (context.type === 'company') {
    assistance = " While I resolve this, you can explore company profiles and their product catalogs directly.";
  } else if (context.type === 'product') {
    assistance = " You can still browse product specifications and download technical documents.";
  } else if (context.type === 'personal') {
    assistance = " You can continue exploring companies and products on the platform.";
  } else {
    assistance = " Please try browsing our companies and products manually, or try your search again in a moment.";
  }
  
  // Role-specific guidance
  let roleGuidance = "";
  if (userProfile?.role?.includes('admin')) {
    roleGuidance = " You can also check the platform analytics for any system-wide issues.";
  } else if (userProfile?.role?.includes('company')) {
    roleGuidance = " Consider updating your company profile or exploring potential business partnerships.";
  }
  
  // API limit specific guidance
  if (errorType.includes('rate') || errorType.includes('limit')) {
    return `${greeting}. Our AI service is experiencing high demand right now. ${assistance} The AI assistant will be available again shortly.${roleGuidance}`;
  }
  
  // Network/connection errors
  if (errorType.includes('network') || errorType.includes('timeout')) {
    return `${greeting}. There seems to be a connectivity issue. ${assistance} Please try again in a moment.${roleGuidance}`;
  }
  
  // General fallback
  return `${greeting}. ${assistance} I'll be back online shortly to provide intelligent assistance.${roleGuidance}`;
}

// Generate helpful fallback suggestions
function generateFallbackSuggestions(context: ChatContext): string[] {
  const suggestions: string[] = [];
  const userProfile = context.userProfile;
  
  // Role-based fallback suggestions
  if (userProfile?.role === 'admin') {
    suggestions.push(
      "Check platform status",
      "Review user activity",
      "Browse system analytics"
    );
  } else if (userProfile?.role?.includes('company')) {
    suggestions.push(
      "Update your company profile", 
      "Explore business opportunities",
      "Browse competitor analysis"
    );
  } else {
    suggestions.push(
      "Browse featured companies",
      "Discover popular products", 
      "Explore by industry"
    );
  }
  
  return suggestions;
}

// Cleanup old conversations (call periodically)
export function cleanupConversations(): void {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const cutoff = new Date(Date.now() - maxAge);
  
  for (const [sessionId, messages] of Array.from(conversations.entries())) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.timestamp < cutoff) {
      conversations.delete(sessionId);
    }
  }
  
  console.log(`🧹 Cleaned up old conversations. Active sessions: ${conversations.size}`);
}

// Performance metrics
export function getMetrics() {
  return {
    activeConversations: conversations.size,
    embeddingsCount: embeddings.size,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  };
}

// Initialize the service
console.log('🤖 Initializing AI Service...');
initializeEmbeddingsIndex().catch(console.error);

// Cleanup conversations every hour
setInterval(cleanupConversations, 60 * 60 * 1000);