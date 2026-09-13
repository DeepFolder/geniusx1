import {
  companies,
  products,
  catalogues,
  restrictedDocuments,
  productCategories,
  productGroups,
  quoteRequests,
  chatMessages,
  users,
  userDownloads,
  searchQueries,
  companyRequests,
  userFollows,
  companyPosts,
  postLikes,
  postComments,
  commentLikes,
  userFavorites,
  userActivity,
  userInteractions,
  networkConnections,
  recommendationScores,
  industryConnections,
  companyDocuments,
  companyInquiries,
  posts,
  aiChatSessions,
  postShares,
  productConfigurations,
  configurationDownloads,
  type Company,
  type InsertCompany,
  type Product,
  type InsertProduct,
  type ProductCategory,
  type InsertProductCategory,
  type ProductGroup,
  type InsertProductGroup,
  type QuoteRequest,
  type InsertQuoteRequest,
  type ChatMessage,
  type InsertChatMessage,
  type User,
  type UpsertUser,
  type UserDownload,
  type InsertUserDownload,
  type SearchQuery,
  type InsertSearchQuery,
  type CompanyRequest,
  type InsertCompanyRequest,
  type UserFollow,
  type InsertUserFollow,
  type CompanyPost,
  type InsertCompanyPost,
  type PostLike,
  type InsertPostLike,
  type PostComment,
  type InsertPostComment,
  type CommentLike,
  type InsertCommentLike,
  type UserRegistration,
  type UserLogin,
  type UserProfileUpdate,
  type UserFavorite,
  type InsertUserFavorite,
  type UserInteraction,
  type InsertUserInteraction,
  type NetworkConnection,
  type InsertNetworkConnection,
  type RecommendationScore,
  type InsertRecommendationScore,
  type IndustryConnection,
  type InsertIndustryConnection,
  type CompanyDocument,
  type InsertCompanyDocument,
  type CompanyInquiry,
  type InsertCompanyInquiry,
  type Post,
  type InsertPost,
  type PostShare,
  type InsertPostShare,
  type ProductConfiguration,
  type InsertProductConfiguration,
  type ConfigurationDownload,
  type InsertConfigurationDownload
} from "@shared/schema";
import { db } from "./db";
import { eq, or, ilike, desc, asc, sql, and, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";

export interface IStorage {
  // User authentication operations
  registerUser(userData: UserRegistration): Promise<User>;
  loginUser(credentials: UserLogin): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  updateUserEmail(userId: string, newEmail: string): Promise<User | undefined>;
  
  // User profile operations
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(userId: string, profileData: UserProfileUpdate): Promise<User | undefined>;
  getUsersByCompany(companyId: number): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;

  // Company operations
  getCompanies(): Promise<Company[]>;
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<boolean>;

  // Product Category operations
  getProductCategories(companyId: number): Promise<ProductCategory[]>;
  getProductCategory(id: number): Promise<ProductCategory | undefined>;
  createProductCategory(category: InsertProductCategory): Promise<ProductCategory>;
  updateProductCategory(id: number, category: Partial<InsertProductCategory>): Promise<ProductCategory | undefined>;
  deleteProductCategory(id: number): Promise<boolean>;

  // Product Group operations
  getProductGroups(companyId: number, categoryId?: number): Promise<ProductGroup[]>;
  getProductGroup(id: number): Promise<ProductGroup | undefined>;
  createProductGroup(group: InsertProductGroup): Promise<ProductGroup>;
  updateProductGroup(id: number, group: Partial<InsertProductGroup>): Promise<ProductGroup | undefined>;
  deleteProductGroup(id: number): Promise<boolean>;

  // Product operations
  getProducts(): Promise<Product[]>;
  getAllProducts(): Promise<Product[]>;
  getProductsByCompany(companyId: number): Promise<Product[]>;
  getProductsByCategory(categoryId: number): Promise<Product[]>;
  getProductsByGroup(groupId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getCompanyProducts(companyId: number): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Catalogue operations
  getCompanyCatalogues(companyId: number): Promise<any[]>;
  createCatalogue(catalogue: any): Promise<any>;
  deleteCatalogue(id: number): Promise<boolean>;

  // Restricted document operations (AI training only)
  getCompanyRestrictedDocuments(companyId: number): Promise<any[]>;
  createRestrictedDocument(document: any): Promise<any>;
  deleteRestrictedDocument(id: number): Promise<boolean>;

  // Quote request operations
  getQuoteRequests(): Promise<QuoteRequest[]>;
  getQuoteRequestsByCompany(companyId: number): Promise<QuoteRequest[]>;
  createQuoteRequest(quoteRequest: InsertQuoteRequest): Promise<QuoteRequest>;
  updateQuoteRequestStatus(id: number, status: string): Promise<QuoteRequest | undefined>;

  // Chat operations
  getChatMessages(fromCompanyId: number, toCompanyId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Company affiliation operations
  createCompanyRequest(request: InsertCompanyRequest): Promise<CompanyRequest>;
  getCompanyRequests(companyId: number): Promise<CompanyRequest[]>;
  getUserCompanyRequests(userId: string): Promise<CompanyRequest[]>;
  updateCompanyRequestStatus(requestId: number, status: string, reviewedBy: string): Promise<CompanyRequest | undefined>;
  
  // Following operations
  followCompany(userId: string, companyId: number): Promise<UserFollow>;
  unfollowCompany(userId: string, companyId: number): Promise<boolean>;
  getUserFollows(userId: string): Promise<UserFollow[]>;
  getCompanyFollowers(companyId: number): Promise<UserFollow[]>;
  
  // Company posts/news operations
  createCompanyPost(post: InsertCompanyPost): Promise<CompanyPost>;
  getCompanyPosts(companyId: number): Promise<CompanyPost[]>;
  getUserFeed(userId: string): Promise<CompanyPost[]>;
  updateCompanyPost(postId: number, updates: Partial<InsertCompanyPost>): Promise<CompanyPost | undefined>;
  deleteCompanyPost(postId: number): Promise<boolean>;
  
  // Post interaction operations
  likePost(userId: string, postId: number): Promise<PostLike>;
  unlikePost(userId: string, postId: number): Promise<boolean>;
  isPostLikedByUser(userId: string, postId: number): Promise<boolean>;
  getPostLikes(postId: number): Promise<PostLike[]>;
  
  // Comment operations
  createComment(comment: InsertPostComment): Promise<PostComment>;
  getPostComments(postId: number): Promise<PostComment[]>;
  updateComment(commentId: number, content: string): Promise<PostComment | undefined>;
  deleteComment(commentId: number): Promise<boolean>;
  
  // Comment interaction operations
  likeComment(userId: string, commentId: number): Promise<CommentLike>;
  unlikeComment(userId: string, commentId: number): Promise<boolean>;
  isCommentLikedByUser(userId: string, commentId: number): Promise<boolean>;

  // MySpace operations
  getUserActivity(userId: string): Promise<any[]>;
  trackUserActivity(userId: string, activity: any): Promise<any>;
  getUserStats(userId: string): Promise<any>;
  getRecentAdminActivity(since: Date): Promise<any[]>;

  // Search operations
  searchAll(query: string): Promise<{ companies: Company[], products: Product[] }>;
  logSearchQuery(searchQuery: InsertSearchQuery): Promise<SearchQuery>;

  // Download operations
  logDownload(download: InsertUserDownload): Promise<UserDownload>;
  getUserDownloads(userId: string): Promise<UserDownload[]>;
  getUserDownloadsWithProducts(userId: string): Promise<Array<UserDownload & { product: Product }>>;

  // Favorites operations
  addToFavorites(userId: string, favoriteType: 'company' | 'product', favoriteId: number, externalData?: Record<string, any> | null, externalCanonicalKey?: string | null): Promise<UserFavorite>;
  removeFromFavorites(userId: string, favoriteType: 'company' | 'product', favoriteId: number, externalKey?: string | null): Promise<boolean>;
  getUserFavorites(userId: string): Promise<{ companies: Company[], products: Product[] }>;
  isFavorited(userId: string, favoriteType: 'company' | 'product', favoriteId: number): Promise<boolean>;

  // Document operations
  uploadCompanyDocument(document: InsertCompanyDocument): Promise<CompanyDocument>;
  getCompanyDocuments(companyId: number): Promise<CompanyDocument[]>;
  getCompanyDocument(documentId: number): Promise<CompanyDocument | undefined>;
  updateCompanyDocument(documentId: number, updates: Partial<InsertCompanyDocument>): Promise<CompanyDocument | undefined>;
  deleteCompanyDocument(documentId: number): Promise<boolean>;
  getDocumentsByType(companyId: number, fileType: string): Promise<CompanyDocument[]>;

  // Inquiry operations
  createCompanyInquiry(inquiry: InsertCompanyInquiry): Promise<CompanyInquiry>;
  getCompanyInquiries(companyId: number): Promise<CompanyInquiry[]>;
  getCompanyInquiry(inquiryId: number): Promise<CompanyInquiry | undefined>;
  updateInquiryStatus(inquiryId: number, status: string, respondedBy?: string, responseMessage?: string): Promise<CompanyInquiry | undefined>;
  getUserInquiries(userId: string): Promise<CompanyInquiry[]>;

  // Public search operations
  searchCompaniesByFilters(filters: {
    industry?: string;
    country?: string;
    keywords?: string;
    companySize?: string;
    servicesOffered?: string[];
  }): Promise<Company[]>;

  // Recommendation Engine operations
  trackUserInteraction(interaction: InsertUserInteraction): Promise<UserInteraction>;
  createNetworkConnection(connection: InsertNetworkConnection): Promise<NetworkConnection>;
  updateNetworkConnection(connectionId: number, updates: Partial<InsertNetworkConnection>): Promise<NetworkConnection | undefined>;
  getUserConnections(userId: string): Promise<NetworkConnection[]>;
  getRecommendations(userId: string, type?: string, limit?: number): Promise<RecommendationScore[]>;
  generateRecommendations(userId: string): Promise<void>;
  markRecommendationViewed(recommendationId: number): Promise<boolean>;
  markRecommendationActedUpon(recommendationId: number): Promise<boolean>;
  getIndustryConnections(industry: string): Promise<IndustryConnection[]>;
  updateIndustryConnection(connection: InsertIndustryConnection): Promise<IndustryConnection>;
  getUserInteractionHistory(userId: string, limit?: number): Promise<UserInteraction[]>;
  getSuggestedConnections(userId: string, limit?: number): Promise<{ user: User, score: number, reasons: string[] }[]>;
  getCompanyRecommendations(userId: string, limit?: number): Promise<{ company: Company, score: number, reasons: string[] }[]>;
  getProductRecommendations(userId: string, limit?: number): Promise<{ product: Product, score: number, reasons: string[] }[]>;

  // Product configurator operations
  createProductConfiguration(config: InsertProductConfiguration): Promise<ProductConfiguration>;
  getProductConfigurations(productId: number): Promise<ProductConfiguration[]>;
  getProductConfiguration(id: number): Promise<ProductConfiguration | undefined>;
  updateProductConfiguration(id: number, config: Partial<InsertProductConfiguration>): Promise<ProductConfiguration | undefined>;
  deleteProductConfiguration(id: number): Promise<boolean>;
  trackConfigurationDownload(download: InsertConfigurationDownload): Promise<ConfigurationDownload>;
  getConfigurationDownloads(userId?: string, productId?: number): Promise<ConfigurationDownload[]>;
}

export class DatabaseStorage implements IStorage {
  // User authentication operations
  async registerUser(userData: UserRegistration & { companyId?: number }): Promise<User> {
    const { password, ...userInfo } = userData;
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = nanoid();
    
    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        headline: userData.headline,
        location: userData.location,
        role: userData.role || 'public',
        companyId: userData.companyId,
        passwordHash,
      })
      .returning();
    return user;
  }

  async loginUser(credentials: UserLogin): Promise<User | null> {
    console.log("STORAGE LOGIN - Email:", credentials.email);
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, credentials.email));
    
    if (!user) {
      console.log("STORAGE LOGIN - User not found");
      return null;
    }
    
    console.log("STORAGE LOGIN - User found:", user.id, "Has password:", !!user.passwordHash);
    
    if (!user.passwordHash) {
      console.log("STORAGE LOGIN - No password hash");
      return null;
    }
    
    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
    console.log("STORAGE LOGIN - Password valid:", isValid);
    
    return isValid ? user : null;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserEmail(userId: string, newEmail: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // User profile operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserProfile(userId: string, profileData: UserProfileUpdate): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUsersByCompany(companyId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.companyId, companyId));
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete all related data in the correct order to avoid foreign key constraint violations
    
    // 1. Delete user follows
    await db.delete(userFollows).where(eq(userFollows.userId, id));
    
    // 2. Delete user favorites
    await db.delete(userFavorites).where(eq(userFavorites.userId, id));
    
    // 3. Delete user downloads
    await db.delete(userDownloads).where(eq(userDownloads.userId, id));
    
    // 4. Delete search queries
    await db.delete(searchQueries).where(eq(searchQueries.userId, id));
    
    // 5. Delete company posts authored by this user
    await db.delete(companyPosts).where(eq(companyPosts.authorId, id));
    
    // 6. Delete post likes
    await db.delete(postLikes).where(eq(postLikes.userId, id));
    
    // 7. Delete post comments (uses userId, not authorId)
    await db.delete(postComments).where(eq(postComments.userId, id));
    
    // 8. Delete comment likes
    await db.delete(commentLikes).where(eq(commentLikes.userId, id));
    
    // 9. Delete user interactions (only as actor, not as target since targetId is string-based)
    await db.delete(userInteractions).where(eq(userInteractions.userId, id));
    
    // 10. Delete network connections (fromUserId and toUserId)
    await db.delete(networkConnections).where(
      or(
        eq(networkConnections.fromUserId, id),
        eq(networkConnections.toUserId, id)
      )
    );
    
    // 11. Delete recommendation scores
    await db.delete(recommendationScores).where(eq(recommendationScores.userId, id));
    
    // 12. Delete company requests
    await db.delete(companyRequests).where(eq(companyRequests.userId, id));
    
    // 13. Delete user activity records (entityType = 'user')
    await db.delete(userActivity).where(
      and(
        eq(userActivity.entityType, 'user'),
        eq(userActivity.entityId, id)
      )
    );
    
    // 14. Delete all other user activity (where user is the actor)
    await db.delete(userActivity).where(eq(userActivity.userId, id));
    
    // 15. Delete AI chat sessions (messages cascade via onDelete: "cascade")
    await db.delete(aiChatSessions).where(eq(aiChatSessions.userId, id));

    // 16. Delete social wall posts authored by this user
    await db.delete(posts).where(eq(posts.authorId, id));

    // 17. Finally, delete the user
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Company operations
  async getCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [newCompany] = await db.insert(companies).values(company).returning();
    return newCompany;
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined> {
    // Filter out problematic timestamp fields and handle them properly
    const cleanData = { ...data };
    
    // Remove fields that shouldn't be updated or cause timestamp issues
    delete cleanData.id;
    delete cleanData.createdAt;
    
    // Ensure updatedAt is a proper Date object if provided
    if (cleanData.updatedAt) {
      cleanData.updatedAt = new Date();
    } else {
      cleanData.updatedAt = new Date();
    }
    
    console.log('Updating company with clean data:', cleanData);
    
    const [updated] = await db
      .update(companies)
      .set(cleanData)
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async deleteCompany(id: number): Promise<boolean> {
    // Delete all related data in the correct order to avoid foreign key constraint violations
    
    // 1. Update users to remove company association (set companyId to null)
    await db
      .update(users)
      .set({ companyId: null, role: 'public' })
      .where(eq(users.companyId, id));
    
    // Get all product IDs for this company
    const companyProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.companyId, id));
    
    const productIds = companyProducts.map(p => p.id);
    
    if (productIds.length > 0) {
      // Get all configuration IDs for these products
      const productConfigs = await db
        .select({ id: productConfigurations.id })
        .from(productConfigurations)
        .where(inArray(productConfigurations.productId, productIds));
      
      const configIds = productConfigs.map(c => c.id);
      
      // 2. Delete configuration downloads
      if (configIds.length > 0) {
        await db
          .delete(configurationDownloads)
          .where(inArray(configurationDownloads.configurationId, configIds));
      }
      
      // 3. Delete product configurations
      await db
        .delete(productConfigurations)
        .where(inArray(productConfigurations.productId, productIds));
      
      // 4. Delete all favorites for these products
      await db
        .delete(userFavorites)
        .where(inArray(userFavorites.productId, productIds));
      
      // 5. Delete all downloads for these products
      await db
        .delete(userDownloads)
        .where(inArray(userDownloads.productId, productIds));
      
      // 6. Delete all activity records for these products (entityType = 'product')
      const productIdStrings = productIds.map(String);
      await db
        .delete(userActivity)
        .where(
          and(
            eq(userActivity.entityType, 'product'),
            inArray(userActivity.entityId, productIdStrings)
          )
        );
    }
    
    // 7. Delete all products belonging to this company
    await db.delete(products).where(eq(products.companyId, id));
    
    // 8. Delete all follows for this company
    await db.delete(userFollows).where(eq(userFollows.companyId, id));
    
    // 9. Delete all activity records for this company (entityType = 'company')
    await db
      .delete(userActivity)
      .where(
        and(
          eq(userActivity.entityType, 'company'),
          eq(userActivity.entityId, String(id))
        )
      );
    
    // 10. Delete all product categories for this company
    await db.delete(productCategories).where(eq(productCategories.companyId, id));
    
    // 11. Delete all product groups for this company
    await db.delete(productGroups).where(eq(productGroups.companyId, id));
    
    // 12. Delete all company documents
    await db.delete(companyDocuments).where(eq(companyDocuments.companyId, id));
    
    // 13. Delete all catalogues for this company
    await db.delete(catalogues).where(eq(catalogues.companyId, id));
    
    // 14. Finally, delete the company itself
    const result = await db.delete(companies).where(eq(companies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Product Category operations
  async getProductCategories(companyId: number): Promise<ProductCategory[]> {
    return await db.select().from(productCategories)
      .where(eq(productCategories.companyId, companyId))
      .orderBy(productCategories.displayOrder, productCategories.name);
  }

  async getProductCategory(id: number): Promise<ProductCategory | undefined> {
    const [category] = await db.select().from(productCategories).where(eq(productCategories.id, id));
    return category;
  }

  async createProductCategory(category: InsertProductCategory): Promise<ProductCategory> {
    const [newCategory] = await db.insert(productCategories).values({
      ...category,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newCategory;
  }

  async updateProductCategory(id: number, category: Partial<InsertProductCategory>): Promise<ProductCategory | undefined> {
    const [updated] = await db
      .update(productCategories)
      .set({ ...category, updatedAt: new Date() })
      .where(eq(productCategories.id, id))
      .returning();
    return updated;
  }

  async deleteProductCategory(id: number): Promise<boolean> {
    const result = await db.delete(productCategories).where(eq(productCategories.id, id));
    return result.rowCount > 0;
  }

  // Product Group operations
  async getProductGroups(companyId: number, categoryId?: number): Promise<ProductGroup[]> {
    let query = db.select().from(productGroups).where(eq(productGroups.companyId, companyId));
    
    if (categoryId) {
      query = query.where(eq(productGroups.categoryId, categoryId));
    }
    
    return await query.orderBy(productGroups.displayOrder, productGroups.name);
  }

  async getProductGroup(id: number): Promise<ProductGroup | undefined> {
    const [group] = await db.select().from(productGroups).where(eq(productGroups.id, id));
    return group;
  }

  async createProductGroup(group: InsertProductGroup): Promise<ProductGroup> {
    const [newGroup] = await db.insert(productGroups).values({
      ...group,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newGroup;
  }

  async updateProductGroup(id: number, group: Partial<InsertProductGroup>): Promise<ProductGroup | undefined> {
    const [updated] = await db
      .update(productGroups)
      .set({ ...group, updatedAt: new Date() })
      .where(eq(productGroups.id, id))
      .returning();
    return updated;
  }

  async deleteProductGroup(id: number): Promise<boolean> {
    const result = await db.delete(productGroups).where(eq(productGroups.id, id));
    return result.rowCount > 0;
  }

  // Product operations
  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProductsByCompany(companyId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.companyId, companyId));
  }

  async getProductsByCategory(categoryId: number): Promise<Product[]> {
    return await db.select().from(products)
      .where(eq(products.categoryId, categoryId))
      .orderBy(products.displayOrder, products.name);
  }

  async getProductsByGroup(groupId: number): Promise<Product[]> {
    return await db.select().from(products)
      .where(eq(products.groupId, groupId))
      .orderBy(products.displayOrder, products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getCompanyProducts(companyId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.companyId, companyId));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values({
      ...product,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return result.rowCount > 0;
  }

  // Catalogue operations
  async getCompanyCatalogues(companyId: number): Promise<any[]> {
    return await db.select().from(catalogues).where(eq(catalogues.companyId, companyId));
  }

  async createCatalogue(catalogue: any): Promise<any> {
    const [newCatalogue] = await db.insert(catalogues).values({
      ...catalogue,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newCatalogue;
  }

  async deleteCatalogue(id: number): Promise<boolean> {
    const result = await db.delete(catalogues).where(eq(catalogues.id, id));
    return result.rowCount > 0;
  }

  // Restricted document operations (AI training only)
  async getCompanyRestrictedDocuments(companyId: number): Promise<any[]> {
    return await db.select().from(restrictedDocuments).where(eq(restrictedDocuments.companyId, companyId));
  }

  async createRestrictedDocument(document: any): Promise<any> {
    const [newDocument] = await db.insert(restrictedDocuments).values({
      ...document,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newDocument;
  }

  async deleteRestrictedDocument(id: number): Promise<boolean> {
    const result = await db.delete(restrictedDocuments).where(eq(restrictedDocuments.id, id));
    return result.rowCount > 0;
  }

  // Quote request operations
  async getQuoteRequests(): Promise<QuoteRequest[]> {
    return await db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt));
  }

  async getQuoteRequestsByCompany(companyId: number): Promise<QuoteRequest[]> {
    return await db.select().from(quoteRequests).where(eq(quoteRequests.companyId, companyId));
  }

  async createQuoteRequest(quoteRequest: InsertQuoteRequest): Promise<QuoteRequest> {
    const [newQuote] = await db.insert(quoteRequests).values(quoteRequest).returning();
    return newQuote;
  }

  async updateQuoteRequestStatus(id: number, status: string): Promise<QuoteRequest | undefined> {
    const [updated] = await db
      .update(quoteRequests)
      .set({ status })
      .where(eq(quoteRequests.id, id))
      .returning();
    return updated;
  }

  // Chat operations
  async getChatMessages(fromCompanyId: number, toCompanyId: number): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(
        or(
          sql`(${chatMessages.fromCompanyId} = ${fromCompanyId} AND ${chatMessages.toCompanyId} = ${toCompanyId})`,
          sql`(${chatMessages.fromCompanyId} = ${toCompanyId} AND ${chatMessages.toCompanyId} = ${fromCompanyId})`
        )
      )
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }

  // Search operations
  async searchAll(query: string): Promise<{ companies: Company[], products: Product[] }> {
    // Enhanced AI-powered search with location intelligence
    const lowerQuery = query.toLowerCase();
    
    // Location mappings for smart search
    const locationMappings: { [key: string]: string[] } = {
      'detroit': ['Detroit', 'Michigan', 'MI'],
      'michigan': ['Detroit', 'Michigan', 'MI'],
      'boston': ['Boston', 'Massachusetts', 'MA'],
      'massachusetts': ['Boston', 'Massachusetts', 'MA'],
      'san jose': ['San Jose', 'California', 'CA'],
      'california': ['San Jose', 'California', 'CA'],
      'silicon valley': ['San Jose', 'California', 'CA'],
      'usa': ['United States', 'America', 'US'],
      'us': ['United States', 'America', 'US']
    };
    
    // Industry and capability mappings
    const industryMappings: { [key: string]: string[] } = {
      'manufacturing': ['Manufacturing Equipment', 'Industrial', 'Production'],
      'robotics': ['Robotics & Automation', 'Industrial Robotics', 'Automation'],
      'automation': ['Robotics & Automation', 'Automated', 'Industrial'],
      '3d printing': ['Additive Manufacturing', '3D Printing', 'Rapid Prototyping'],
      'additive': ['Additive Manufacturing', '3D Printing', 'Metal Printing'],
      'cnc': ['CNC Machining', 'Precision Manufacturing', 'Machining'],
      'machining': ['CNC Machining', 'Precision Manufacturing', 'Manufacturing']
    };
    
    // Company name variations
    const companyMappings: { [key: string]: string[] } = {
      'techno': ['TechnoForge', 'TechnoForge Industries'],
      'forge': ['TechnoForge', 'TechnoForge Industries'],
      'tech': ['TechnoForge', 'RoboTech'],
      'robo': ['RoboTech', 'RoboTech Solutions'],
      'robot': ['RoboTech', 'RoboTech Solutions'],
      'print': ['PrintMaster', 'PrintMaster Corporation'],
      'master': ['PrintMaster', 'PrintMaster Corporation'],
      'deep': ['DeepFolder'],
      'folder': ['DeepFolder'],
      'deepfolder': ['DeepFolder']
    };
    
    // Build comprehensive search terms
    const searchTerms = [
      `%${query}%`,
      `%${query.replace(/[^a-zA-Z0-9\s]/g, '')}%`,
      `%${lowerQuery}%`
    ];
    
    // Add location-based terms
    Object.entries(locationMappings).forEach(([key, values]) => {
      if (lowerQuery.includes(key)) {
        values.forEach(location => {
          searchTerms.push(`%${location}%`);
        });
      }
    });
    
    // Add industry-based terms
    Object.entries(industryMappings).forEach(([key, values]) => {
      if (lowerQuery.includes(key)) {
        values.forEach(industry => {
          searchTerms.push(`%${industry}%`);
        });
      }
    });
    
    // Add company name variations
    Object.entries(companyMappings).forEach(([key, values]) => {
      if (lowerQuery.includes(key)) {
        values.forEach(company => {
          searchTerms.push(`%${company}%`);
        });
      }
    });
    
    // Intelligent word analysis for capabilities
    const words = lowerQuery.split(' ');
    const stopWords = ['find', 'me', 'the', 'a', 'an', 'for', 'with', 'in', 'company', 'companies', 'product', 'products'];
    
    words.forEach(word => {
      const cleanWord = word.trim();
      if (cleanWord.length > 2) {
        // Add individual words as search terms (skip common stop words)
        if (!stopWords.includes(cleanWord)) {
          searchTerms.push(`%${cleanWord}%`);
        }
        
        // Add fuzzy matching for capabilities
        if (cleanWord.includes('automat')) searchTerms.push('%automation%', '%automated%');
        if (cleanWord.includes('precis')) searchTerms.push('%precision%', '%accurate%');
        if (cleanWord.includes('qualit')) searchTerms.push('%quality%', '%QC%', '%inspection%');
        if (cleanWord.includes('certif')) searchTerms.push('%ISO%', '%certification%', '%certified%');
        if (cleanWord.includes('metal')) searchTerms.push('%metal%', '%steel%', '%aluminum%');
      }
    });
    
    // Remove duplicates and create database conditions
    const uniqueTerms = Array.from(new Set(searchTerms));
    
    const companyConditions = uniqueTerms.map(term => 
      or(
        ilike(companies.name, term),
        ilike(companies.description, term),
        ilike(companies.industry, term),
        ilike(companies.location, term),
        ilike(companies.email, term),
        ilike(companies.website, term)
      )
    );
    
    const productConditions = uniqueTerms.map(term =>
      or(
        ilike(products.name, term),
        ilike(products.description, term),
        ilike(products.category, term)
      )
    );
    
    // Execute searches with error handling
    let companiesResult: Company[] = [];
    let productsResult: Product[] = [];
    
    try {
      if (companyConditions.length > 0) {
        companiesResult = await db.select().from(companies).where(or(...companyConditions));
      }
      if (productConditions.length > 0) {
        productsResult = await db.select().from(products).where(or(...productConditions));
      }
    } catch (error) {
      console.error('Search execution error:', error);
      // Fallback to simple search
      companiesResult = await db.select().from(companies).where(
        or(
          ilike(companies.name, `%${lowerQuery}%`),
          ilike(companies.industry, `%${lowerQuery}%`),
          ilike(companies.location, `%${lowerQuery}%`)
        )
      );
      productsResult = await db.select().from(products).where(
        or(
          ilike(products.name, `%${lowerQuery}%`),
          ilike(products.description, `%${lowerQuery}%`)
        )
      );
    }

    // Smart ranking based on relevance
    const rankCompanies = (companies: Company[]) => {
      return companies.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        
        // Exact name match gets highest score
        if (a.name.toLowerCase().includes(lowerQuery)) scoreA += 10;
        if (b.name.toLowerCase().includes(lowerQuery)) scoreB += 10;
        
        // Location match gets high score
        if (a.location.toLowerCase().includes(lowerQuery)) scoreA += 8;
        if (b.location.toLowerCase().includes(lowerQuery)) scoreB += 8;
        
        // Industry match gets medium score
        if (a.industry.toLowerCase().includes(lowerQuery)) scoreA += 5;
        if (b.industry.toLowerCase().includes(lowerQuery)) scoreB += 5;
        
        // Description match gets low score
        if (a.description.toLowerCase().includes(lowerQuery)) scoreA += 2;
        if (b.description.toLowerCase().includes(lowerQuery)) scoreB += 2;
        
        return scoreB - scoreA;
      });
    };

    return {
      companies: rankCompanies(companiesResult),
      products: productsResult
    };
  }

  async logSearchQuery(searchQuery: InsertSearchQuery): Promise<SearchQuery> {
    const [newQuery] = await db.insert(searchQueries).values(searchQuery).returning();
    return newQuery;
  }

  // Download operations
  async logDownload(download: InsertUserDownload): Promise<UserDownload> {
    const [newDownload] = await db.insert(userDownloads).values(download).returning();
    return newDownload;
  }

  async getUserDownloads(userId: string): Promise<UserDownload[]> {
    return await db.select().from(userDownloads).where(eq(userDownloads.userId, userId));
  }

  async getUserDownloadsWithProducts(userId: string): Promise<Array<UserDownload & { product: Product }>> {
    const downloads = await db
      .select()
      .from(userDownloads)
      .leftJoin(products, eq(userDownloads.productId, products.id))
      .where(eq(userDownloads.userId, userId))
      .orderBy(desc(userDownloads.createdAt))
      .limit(20);
    
    return downloads
      .filter(row => row.products !== null)
      .map(row => ({
        ...row.user_downloads,
        product: row.products!
      }));
  }

  // Company affiliation operations
  async createCompanyRequest(request: InsertCompanyRequest): Promise<CompanyRequest> {
    const [newRequest] = await db.insert(companyRequests).values(request).returning();
    return newRequest;
  }

  async getCompanyRequests(companyId: number): Promise<CompanyRequest[]> {
    return await db.select().from(companyRequests).where(eq(companyRequests.companyId, companyId)).orderBy(desc(companyRequests.createdAt));
  }

  async getUserCompanyRequests(userId: string): Promise<CompanyRequest[]> {
    return await db.select().from(companyRequests).where(eq(companyRequests.userId, userId)).orderBy(desc(companyRequests.createdAt));
  }

  async updateCompanyRequestStatus(requestId: number, status: string, reviewedBy: string): Promise<CompanyRequest | undefined> {
    const [request] = await db
      .update(companyRequests)
      .set({ 
        status, 
        reviewedBy, 
        reviewedAt: new Date() 
      })
      .where(eq(companyRequests.id, requestId))
      .returning();
    
    // If approved, update user's company affiliation
    if (status === 'approved' && request) {
      await db
        .update(users)
        .set({ 
          companyId: request.companyId,
          role: 'company_member',
          updatedAt: new Date()
        })
        .where(eq(users.id, request.userId));
    }
    
    return request;
  }
  
  // Following operations
  async followCompany(userId: string, companyId: number): Promise<UserFollow> {
    const [follow] = await db
      .insert(userFollows)
      .values({ userId, companyId })
      .onConflictDoNothing()
      .returning();
    return follow;
  }

  async unfollowCompany(userId: string, companyId: number): Promise<boolean> {
    const result = await db
      .delete(userFollows)
      .where(and(
        eq(userFollows.userId, userId),
        eq(userFollows.companyId, companyId)
      ));
    return (result.rowCount || 0) > 0;
  }

  async getUserFollows(userId: string): Promise<UserFollow[]> {
    return await db
      .select({
        id: userFollows.id,
        userId: userFollows.userId,
        companyId: userFollows.companyId,
        createdAt: userFollows.createdAt,
        company: companies
      })
      .from(userFollows)
      .innerJoin(companies, eq(userFollows.companyId, companies.id))
      .where(eq(userFollows.userId, userId))
      .orderBy(desc(userFollows.createdAt));
  }

  async getCompanyFollowers(companyId: number): Promise<UserFollow[]> {
    return await db.select().from(userFollows).where(eq(userFollows.companyId, companyId));
  }
  
  // Company posts/news operations
  async createCompanyPost(post: InsertCompanyPost): Promise<CompanyPost> {
    const [newPost] = await db.insert(companyPosts).values(post).returning();
    return newPost;
  }

  async getCompanyPosts(companyId: number): Promise<CompanyPost[]> {
    return await db.select().from(companyPosts)
      .where(and(
        eq(companyPosts.companyId, companyId),
        eq(companyPosts.isPublished, true)
      ))
      .orderBy(desc(companyPosts.createdAt));
  }

  async getUserFeed(userId: string): Promise<CompanyPost[]> {
    // Get posts from companies the user follows
    const follows = await this.getUserFollows(userId);
    if (follows.length === 0) return [];
    
    const companyIds = follows.map(f => f.companyId);
    return await db.select().from(companyPosts)
      .where(and(
        sql`${companyPosts.companyId} = ANY(${companyIds})`,
        eq(companyPosts.isPublished, true)
      ))
      .orderBy(desc(companyPosts.createdAt))
      .limit(50);
  }

  async updateCompanyPost(postId: number, updates: Partial<InsertCompanyPost>): Promise<CompanyPost | undefined> {
    const [post] = await db
      .update(companyPosts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(companyPosts.id, postId))
      .returning();
    return post;
  }

  async deleteCompanyPost(postId: number): Promise<boolean> {
    const result = await db.delete(companyPosts).where(eq(companyPosts.id, postId));
    return (result.rowCount || 0) > 0;
  }

  // Post interaction operations
  async likePost(userId: string, postId: number): Promise<PostLike> {
    // Check if already liked
    const existingLike = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)))
      .limit(1);

    if (existingLike.length > 0) {
      return existingLike[0];
    }

    // Create like and increment counter
    const [like] = await db.insert(postLikes).values({ userId, postId }).returning();
    
    // Increment likes count
    await db
      .update(companyPosts)
      .set({ likesCount: sql`${companyPosts.likesCount} + 1` })
      .where(eq(companyPosts.id, postId));

    return like;
  }

  async unlikePost(userId: string, postId: number): Promise<boolean> {
    const result = await db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));

    if (result.rowCount && result.rowCount > 0) {
      // Decrement likes count
      await db
        .update(companyPosts)
        .set({ likesCount: sql`${companyPosts.likesCount} - 1` })
        .where(eq(companyPosts.id, postId));
      return true;
    }
    return false;
  }

  async isPostLikedByUser(userId: string, postId: number): Promise<boolean> {
    const like = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)))
      .limit(1);
    return like.length > 0;
  }

  async getPostLikes(postId: number): Promise<PostLike[]> {
    return await db.select().from(postLikes).where(eq(postLikes.postId, postId));
  }

  // Comment operations
  async createComment(comment: InsertPostComment): Promise<PostComment> {
    const [newComment] = await db.insert(postComments).values(comment).returning();
    
    // Increment comments count
    await db
      .update(companyPosts)
      .set({ commentsCount: sql`${companyPosts.commentsCount} + 1` })
      .where(eq(companyPosts.id, comment.postId));

    return newComment;
  }

  async getPostComments(postId: number): Promise<PostComment[]> {
    return await db
      .select()
      .from(postComments)
      .where(eq(postComments.postId, postId))
      .orderBy(desc(postComments.createdAt));
  }

  async updateComment(commentId: number, content: string): Promise<PostComment | undefined> {
    const [updatedComment] = await db
      .update(postComments)
      .set({ content, updatedAt: new Date() })
      .where(eq(postComments.id, commentId))
      .returning();
    return updatedComment;
  }

  async deleteComment(commentId: number): Promise<boolean> {
    const comment = await db
      .select()
      .from(postComments)
      .where(eq(postComments.id, commentId))
      .limit(1);

    if (comment.length === 0) return false;

    const result = await db.delete(postComments).where(eq(postComments.id, commentId));
    
    if (result.rowCount && result.rowCount > 0) {
      // Decrement comments count
      await db
        .update(companyPosts)
        .set({ commentsCount: sql`${companyPosts.commentsCount} - 1` })
        .where(eq(companyPosts.id, comment[0].postId));
      return true;
    }
    return false;
  }

  // Comment interaction operations
  async likeComment(userId: string, commentId: number): Promise<CommentLike> {
    // Check if already liked
    const existingLike = await db
      .select()
      .from(commentLikes)
      .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)))
      .limit(1);

    if (existingLike.length > 0) {
      return existingLike[0];
    }

    // Create like and increment counter
    const [like] = await db.insert(commentLikes).values({ userId, commentId }).returning();
    
    // Increment likes count
    await db
      .update(postComments)
      .set({ likesCount: sql`${postComments.likesCount} + 1` })
      .where(eq(postComments.id, commentId));

    return like;
  }

  async unlikeComment(userId: string, commentId: number): Promise<boolean> {
    const result = await db
      .delete(commentLikes)
      .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));

    if (result.rowCount && result.rowCount > 0) {
      // Decrement likes count
      await db
        .update(postComments)
        .set({ likesCount: sql`${postComments.likesCount} - 1` })
        .where(eq(postComments.id, commentId));
      return true;
    }
    return false;
  }

  async isCommentLikedByUser(userId: string, commentId: number): Promise<boolean> {
    const like = await db
      .select()
      .from(commentLikes)
      .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)))
      .limit(1);
    return like.length > 0;
  }

  // Favorites operations
  async addToFavorites(userId: string, favoriteType: 'company' | 'product', favoriteId: number, externalData?: Record<string, any> | null, externalCanonicalKey?: string | null): Promise<UserFavorite> {
    // For external products, check for an existing row by the dedicated column first.
    // This is collision-proof: two distinct products with the same integer hash but different
    // URLs will have different externalCanonicalKey values and can both be stored.
    if (externalCanonicalKey) {
      const existing = await db
        .select()
        .from(userFavorites)
        .where(
          and(
            eq(userFavorites.userId, userId),
            eq(userFavorites.favoriteType, favoriteType),
            eq(userFavorites.externalCanonicalKey, externalCanonicalKey)
          )
        )
        .limit(1);
      if (existing.length > 0) return existing[0];
    }

    const [favorite] = await db
      .insert(userFavorites)
      .values({
        userId,
        favoriteType,
        favoriteId,
        externalCanonicalKey: externalCanonicalKey ?? null,
        externalData: externalData ?? null,
      })
      .onConflictDoNothing()
      .returning();

    // When onConflictDoNothing fires (legacy integer-ID collision), fetch the existing row
    // and backfill externalCanonicalKey so future removes use the fast column-based path.
    if (!favorite) {
      const [existing] = await db
        .select()
        .from(userFavorites)
        .where(
          and(
            eq(userFavorites.userId, userId),
            eq(userFavorites.favoriteType, favoriteType),
            eq(userFavorites.favoriteId, favoriteId)
          )
        )
        .limit(1);
      if (existing && externalCanonicalKey && !existing.externalCanonicalKey) {
        await db
          .update(userFavorites)
          .set({ externalCanonicalKey })
          .where(eq(userFavorites.id, existing.id));
      }
      return existing;
    }

    return favorite;
  }

  async removeFromFavorites(userId: string, favoriteType: 'company' | 'product', favoriteId: number, externalKey?: string | null): Promise<boolean> {
    // For external products, delete by the dedicated column (collision-proof).
    // Falls back to the integer favoriteId for legacy rows that predate the column.
    if (externalKey) {
      const byKey = await db
        .delete(userFavorites)
        .where(
          and(
            eq(userFavorites.userId, userId),
            eq(userFavorites.favoriteType, favoriteType),
            eq(userFavorites.externalCanonicalKey, externalKey)
          )
        );
      if ((byKey.rowCount ?? 0) > 0) return true;
      // Legacy row without externalCanonicalKey: fall through to integer-ID delete.
    }

    const result = await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.favoriteType, favoriteType),
          eq(userFavorites.favoriteId, favoriteId)
        )
      );
    return (result.rowCount ?? 0) > 0;
  }

  async getUserFavorites(userId: string): Promise<{ companies: Company[], products: Product[] }> {
    // Get favorite companies
    const favoriteCompanies = await db
      .select({
        company: companies
      })
      .from(userFavorites)
      .innerJoin(companies, eq(userFavorites.favoriteId, companies.id))
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.favoriteType, 'company')
        )
      );

    // Get all product favorites (both internal & external snapshots)
    const allProductFavorites = await db
      .select()
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.favoriteType, 'product')
        )
      );

    const internalIds = allProductFavorites
      .filter(f => f.externalData == null)
      .map(f => f.favoriteId);

    const internalProducts = internalIds.length > 0
      ? await db.select().from(products).where(inArray(products.id, internalIds))
      : [];
    const internalProductMap = new Map(internalProducts.map(p => [p.id, p]));

    const mergedProducts: Product[] = allProductFavorites.flatMap(fav => {
      if (fav.externalData == null) {
        const p = internalProductMap.get(fav.favoriteId);
        return p ? [p] : [];
      }
      // Synthesize a Product-shaped record from the external snapshot
      const ext = fav.externalData as Record<string, any>;
      return [{
        id: fav.favoriteId,
        companyId: 0,
        categoryId: null,
        groupId: null,
        name: ext.name ?? 'External Product',
        description: ext.description ?? '',
        category: ext.category ?? 'Product',
        imagePath: ext.imagePath ?? null,
        catalogPath: ext.catalogPath ?? null,
        modelPath: ext.modelPath ?? null,
        modelType: null,
        productWebLink: ext.productWebLink ?? null,
        contactEmail: null,
        orderLinks: null,
        documentPaths: ext.documentPaths ?? null,
        stepFilePaths: null,
        additionalImagePaths: null,
        specifications: null,
        price: null,
        isActive: true,
        displayOrder: 0,
        tags: null,
        createdAt: fav.createdAt,
        updatedAt: fav.createdAt,
        // Extra fields for external products (not on the DB schema but used by UI)
        companyName: ext.companyName ?? null,
        companyWebsite: ext.companyWebsite ?? null,
        isExternal: true,
      } as unknown as Product];
    });

    return {
      companies: favoriteCompanies.map(row => row.company),
      products: mergedProducts
    };
  }

  async isFavorited(userId: string, favoriteType: 'company' | 'product', favoriteId: number): Promise<boolean> {
    const favorite = await db
      .select()
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.favoriteType, favoriteType),
          eq(userFavorites.favoriteId, favoriteId)
        )
      )
      .limit(1);
    return favorite.length > 0;
  }

  // Recommendation Engine Implementation
  async trackUserInteraction(interaction: InsertUserInteraction): Promise<UserInteraction> {
    const [result] = await db
      .insert(userInteractions)
      .values(interaction)
      .returning();
    return result;
  }

  async createNetworkConnection(connection: InsertNetworkConnection): Promise<NetworkConnection> {
    const [result] = await db
      .insert(networkConnections)
      .values(connection)
      .returning();
    return result;
  }

  async updateNetworkConnection(connectionId: number, updates: Partial<InsertNetworkConnection>): Promise<NetworkConnection | undefined> {
    const [result] = await db
      .update(networkConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(networkConnections.id, connectionId))
      .returning();
    return result;
  }

  async getUserConnections(userId: string): Promise<NetworkConnection[]> {
    return await db
      .select()
      .from(networkConnections)
      .where(
        or(
          eq(networkConnections.fromUserId, userId),
          eq(networkConnections.toUserId, userId)
        )
      )
      .orderBy(desc(networkConnections.lastInteraction));
  }

  async getRecommendations(userId: string, type?: string, limit: number = 10): Promise<RecommendationScore[]> {
    let query = db
      .select()
      .from(recommendationScores)
      .where(eq(recommendationScores.userId, userId));

    if (type) {
      query = query.where(eq(recommendationScores.recommendedType, type));
    }

    return await query
      .orderBy(desc(recommendationScores.score))
      .limit(limit);
  }

  async generateRecommendations(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    // Clear old recommendations
    await db
      .delete(recommendationScores)
      .where(eq(recommendationScores.userId, userId));

    // Get user's interaction history
    const interactions = await this.getUserInteractionHistory(userId, 100);
    const userConnections = await this.getUserConnections(userId);

    // Generate recommendations based on user behavior patterns
    await this.generateCompanyRecommendationsInternal(user, interactions);
    await this.generateUserConnectionRecommendationsInternal(user, userConnections, interactions);
    await this.generateProductRecommendationsInternal(user, interactions);
  }

  private async generateCompanyRecommendationsInternal(user: User, interactions: UserInteraction[]): Promise<void> {
    const companyInteractions = interactions.filter(i => i.targetType === 'company');
    const interactedCompanyIds = new Set(companyInteractions.map(i => i.targetId));

    const allCompanies = await this.getCompanies();
    const userCompany = user.companyId ? await this.getCompany(user.companyId) : null;

    for (const company of allCompanies) {
      if (interactedCompanyIds.has(company.id.toString()) || company.id === user.companyId) {
        continue;
      }

      let score = 0;
      const reasons: string[] = [];

      // Industry similarity scoring
      if (userCompany && company.industry === userCompany.industry) {
        score += 30;
        reasons.push('same_industry');
      }

      // Location proximity scoring
      if (userCompany && company.location === userCompany.location) {
        score += 20;
        reasons.push('same_location');
      }

      // Capability overlap analysis
      if (userCompany?.capabilities && company.capabilities) {
        const commonCapabilities = userCompany.capabilities.filter(cap => 
          company.capabilities?.includes(cap)
        );
        if (commonCapabilities.length > 0) {
          score += commonCapabilities.length * 10;
          reasons.push('common_capabilities');
        }
      }

      // User skill alignment with company needs
      if (user.skills && company.capabilities) {
        const skillMatch = user.skills.filter(skill => 
          company.capabilities?.some(cap => cap.toLowerCase().includes(skill.toLowerCase()))
        );
        if (skillMatch.length > 0) {
          score += skillMatch.length * 15;
          reasons.push('skill_match');
        }
      }

      if (score > 10) {
        await db.insert(recommendationScores).values({
          userId: user.id,
          recommendedType: 'company',
          recommendedId: company.id.toString(),
          score: Math.min(score, 100),
          reasons,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
      }
    }
  }

  private async generateUserConnectionRecommendationsInternal(user: User, connections: NetworkConnection[], interactions: UserInteraction[]): Promise<void> {
    const connectedUserIds = new Set([
      ...connections.map(c => c.fromUserId),
      ...connections.map(c => c.toUserId)
    ]);

    // Get users in same company
    const companyUsers = user.companyId ? await this.getUsersByCompany(user.companyId) : [];

    // Get users from companies user has interacted with
    const companyInteractions = interactions.filter(i => i.targetType === 'company');
    const interactedCompanies = await Promise.all(
      companyInteractions.map(i => this.getCompany(parseInt(i.targetId))).filter(Boolean)
    );

    const potentialConnections = new Set<User>();

    // Add company colleagues
    companyUsers.forEach(u => {
      if (u.id !== user.id && !connectedUserIds.has(u.id)) {
        potentialConnections.add(u);
      }
    });

    // Add users from interacted companies
    for (const company of interactedCompanies) {
      if (!company) continue;
      const users = await this.getUsersByCompany(company.id);
      users.forEach(u => {
        if (u.id !== user.id && !connectedUserIds.has(u.id)) {
          potentialConnections.add(u);
        }
      });
    }

    for (const potentialConnection of potentialConnections) {
      let score = 0;
      const reasons: string[] = [];

      // Same company connections
      if (potentialConnection.companyId === user.companyId) {
        score += 50;
        reasons.push('same_company');
      }

      // Similar skills analysis
      if (user.skills && potentialConnection.skills) {
        const commonSkills = user.skills.filter(skill => 
          potentialConnection.skills?.includes(skill)
        );
        if (commonSkills.length > 0) {
          score += commonSkills.length * 10;
          reasons.push('common_skills');
        }
      }

      // Geographic proximity
      if (user.location && potentialConnection.location === user.location) {
        score += 15;
        reasons.push('same_location');
      }

      // Industry peer connections
      const userCompany = user.companyId ? await this.getCompany(user.companyId) : null;
      const connectionCompany = potentialConnection.companyId ? await this.getCompany(potentialConnection.companyId) : null;
      
      if (userCompany && connectionCompany && userCompany.industry === connectionCompany.industry) {
        score += 25;
        reasons.push('industry_peer');
      }

      if (score > 15) {
        await db.insert(recommendationScores).values({
          userId: user.id,
          recommendedType: 'user',
          recommendedId: potentialConnection.id,
          score: Math.min(score, 100),
          reasons,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  private async generateProductRecommendationsInternal(user: User, interactions: UserInteraction[]): Promise<void> {
    const productInteractions = interactions.filter(i => i.targetType === 'product');
    const interactedProductIds = new Set(productInteractions.map(i => i.targetId));

    const allProducts = await this.getProducts();
    const userCompany = user.companyId ? await this.getCompany(user.companyId) : null;

    for (const product of allProducts) {
      if (interactedProductIds.has(product.id.toString())) {
        continue;
      }

      let score = 0;
      const reasons: string[] = [];

      // Industry relevance scoring
      if (userCompany && product.category) {
        const industryKeywords = userCompany.industry.toLowerCase().split(/[\s,]+/);
        const categoryMatch = industryKeywords.some(keyword => 
          product.category?.toLowerCase().includes(keyword)
        );
        if (categoryMatch) {
          score += 30;
          reasons.push('industry_relevant');
        }
      }

      // Skill relevance analysis
      if (user.skills && product.specifications) {
        const skillMatch = user.skills.some(skill => 
          JSON.stringify(product.specifications).toLowerCase().includes(skill.toLowerCase())
        );
        if (skillMatch) {
          score += 25;
          reasons.push('skill_relevant');
        }
      }

      // Company capability matching
      if (userCompany?.capabilities && product.category) {
        const capabilityMatch = userCompany.capabilities.some(cap => 
          product.category?.toLowerCase().includes(cap.toLowerCase())
        );
        if (capabilityMatch) {
          score += 20;
          reasons.push('capability_match');
        }
      }

      if (score > 10) {
        await db.insert(recommendationScores).values({
          userId: user.id,
          recommendedType: 'product',
          recommendedId: product.id.toString(),
          score: Math.min(score, 100),
          reasons,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  async markRecommendationViewed(recommendationId: number): Promise<boolean> {
    const result = await db
      .update(recommendationScores)
      .set({ isViewed: true })
      .where(eq(recommendationScores.id, recommendationId));
    return (result.rowCount ?? 0) > 0;
  }

  async markRecommendationActedUpon(recommendationId: number): Promise<boolean> {
    const result = await db
      .update(recommendationScores)
      .set({ isActedUpon: true })
      .where(eq(recommendationScores.id, recommendationId));
    return (result.rowCount ?? 0) > 0;
  }

  async getIndustryConnections(industry: string): Promise<IndustryConnection[]> {
    return await db
      .select()
      .from(industryConnections)
      .where(
        or(
          eq(industryConnections.industry1, industry),
          eq(industryConnections.industry2, industry)
        )
      );
  }

  async updateIndustryConnection(connection: InsertIndustryConnection): Promise<IndustryConnection> {
    const [existing] = await db
      .select()
      .from(industryConnections)
      .where(
        or(
          and(
            eq(industryConnections.industry1, connection.industry1),
            eq(industryConnections.industry2, connection.industry2)
          ),
          and(
            eq(industryConnections.industry1, connection.industry2),
            eq(industryConnections.industry2, connection.industry1)
          )
        )
      );

    if (existing) {
      const [updated] = await db
        .update(industryConnections)
        .set({ ...connection, updatedAt: new Date() })
        .where(eq(industryConnections.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(industryConnections)
        .values(connection)
        .returning();
      return created;
    }
  }

  async getUserInteractionHistory(userId: string, limit: number = 50): Promise<UserInteraction[]> {
    return await db
      .select()
      .from(userInteractions)
      .where(eq(userInteractions.userId, userId))
      .orderBy(desc(userInteractions.createdAt))
      .limit(limit);
  }

  async getSuggestedConnections(userId: string, limit: number = 10): Promise<{ user: User, score: number, reasons: string[] }[]> {
    const recommendations = await db
      .select()
      .from(recommendationScores)
      .where(
        and(
          eq(recommendationScores.userId, userId),
          eq(recommendationScores.recommendedType, 'user')
        )
      )
      .orderBy(desc(recommendationScores.score))
      .limit(limit);

    const results = [];
    for (const rec of recommendations) {
      const user = await this.getUser(rec.recommendedId);
      if (user) {
        results.push({
          user,
          score: rec.score,
          reasons: rec.reasons || []
        });
      }
    }
    return results;
  }

  async getCompanyRecommendations(userId: string, limit: number = 10): Promise<{ company: Company, score: number, reasons: string[] }[]> {
    const recommendations = await db
      .select()
      .from(recommendationScores)
      .where(
        and(
          eq(recommendationScores.userId, userId),
          eq(recommendationScores.recommendedType, 'company')
        )
      )
      .orderBy(desc(recommendationScores.score))
      .limit(limit);

    const results = [];
    for (const rec of recommendations) {
      const company = await this.getCompany(parseInt(rec.recommendedId));
      if (company) {
        results.push({
          company,
          score: rec.score,
          reasons: rec.reasons || []
        });
      }
    }
    return results;
  }

  async getProductRecommendations(userId: string, limit: number = 10): Promise<{ product: Product, score: number, reasons: string[] }[]> {
    const recommendations = await db
      .select()
      .from(recommendationScores)
      .where(
        and(
          eq(recommendationScores.userId, userId),
          eq(recommendationScores.recommendedType, 'product')
        )
      )
      .orderBy(desc(recommendationScores.score))
      .limit(limit);

    const results = [];
    for (const rec of recommendations) {
      const product = await this.getProduct(parseInt(rec.recommendedId));
      if (product) {
        results.push({
          product,
          score: rec.score,
          reasons: rec.reasons || []
        });
      }
    }
    return results;
  }

  // Document operations
  async uploadCompanyDocument(document: InsertCompanyDocument): Promise<CompanyDocument> {
    const [newDocument] = await db
      .insert(companyDocuments)
      .values(document)
      .returning();
    return newDocument;
  }

  async getCompanyDocuments(companyId: number): Promise<CompanyDocument[]> {
    return await db
      .select()
      .from(companyDocuments)
      .where(eq(companyDocuments.companyId, companyId))
      .orderBy(desc(companyDocuments.createdAt));
  }

  async getCompanyDocument(documentId: number): Promise<CompanyDocument | undefined> {
    const [document] = await db
      .select()
      .from(companyDocuments)
      .where(eq(companyDocuments.id, documentId));
    return document;
  }

  async updateCompanyDocument(documentId: number, updates: Partial<InsertCompanyDocument>): Promise<CompanyDocument | undefined> {
    const [updatedDocument] = await db
      .update(companyDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companyDocuments.id, documentId))
      .returning();
    return updatedDocument;
  }

  async deleteCompanyDocument(documentId: number): Promise<boolean> {
    const result = await db
      .delete(companyDocuments)
      .where(eq(companyDocuments.id, documentId));
    return result.rowCount > 0;
  }

  async getDocumentsByType(companyId: number, fileType: string): Promise<CompanyDocument[]> {
    return await db
      .select()
      .from(companyDocuments)
      .where(and(
        eq(companyDocuments.companyId, companyId),
        eq(companyDocuments.fileType, fileType)
      ))
      .orderBy(desc(companyDocuments.createdAt));
  }

  // Inquiry operations
  async createCompanyInquiry(inquiry: InsertCompanyInquiry): Promise<CompanyInquiry> {
    const [newInquiry] = await db
      .insert(companyInquiries)
      .values(inquiry)
      .returning();
    return newInquiry;
  }

  async getCompanyInquiries(companyId: number): Promise<CompanyInquiry[]> {
    return await db
      .select()
      .from(companyInquiries)
      .where(eq(companyInquiries.companyId, companyId))
      .orderBy(desc(companyInquiries.createdAt));
  }

  async getCompanyInquiry(inquiryId: number): Promise<CompanyInquiry | undefined> {
    const [inquiry] = await db
      .select()
      .from(companyInquiries)
      .where(eq(companyInquiries.id, inquiryId));
    return inquiry;
  }

  async updateInquiryStatus(inquiryId: number, status: string, respondedBy?: string, responseMessage?: string): Promise<CompanyInquiry | undefined> {
    const updates: any = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (respondedBy) {
      updates.respondedBy = respondedBy;
      updates.respondedAt = new Date();
    }
    
    if (responseMessage) {
      updates.responseMessage = responseMessage;
    }

    const [updatedInquiry] = await db
      .update(companyInquiries)
      .set(updates)
      .where(eq(companyInquiries.id, inquiryId))
      .returning();
    return updatedInquiry;
  }

  async getUserInquiries(userId: string): Promise<CompanyInquiry[]> {
    return await db
      .select()
      .from(companyInquiries)
      .where(eq(companyInquiries.assignedTo, userId))
      .orderBy(desc(companyInquiries.createdAt));
  }

  // Public search operations
  async searchCompaniesByFilters(filters: {
    industry?: string;
    country?: string;
    keywords?: string;
    companySize?: string;
    servicesOffered?: string[];
  }): Promise<Company[]> {
    let query = db.select().from(companies).where(eq(companies.isActive, true));

    const conditions = [];

    if (filters.industry) {
      conditions.push(ilike(companies.industry, `%${filters.industry}%`));
    }

    if (filters.country) {
      conditions.push(ilike(companies.country, `%${filters.country}%`));
    }

    if (filters.companySize) {
      conditions.push(eq(companies.companySize, filters.companySize));
    }

    if (filters.keywords) {
      const keywordConditions = [
        ilike(companies.name, `%${filters.keywords}%`),
        ilike(companies.description, `%${filters.keywords}%`)
      ];
      conditions.push(or(...keywordConditions));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(companies.name);
  }

  // Product configurator operations
  async createProductConfiguration(config: InsertProductConfiguration): Promise<ProductConfiguration> {
    try {
      const [newConfig] = await db.insert(productConfigurations)
        .values(config)
        .returning();
      return newConfig;
    } catch (error) {
      console.error('Error creating product configuration:', error);
      throw error;
    }
  }

  async getProductConfigurations(productId: number): Promise<ProductConfiguration[]> {
    try {
      return await db.select()
        .from(productConfigurations)
        .where(eq(productConfigurations.productId, productId))
        .orderBy(productConfigurations.name);
    } catch (error) {
      console.error('Error fetching product configurations:', error);
      return [];
    }
  }

  async getProductConfiguration(id: number): Promise<ProductConfiguration | undefined> {
    try {
      const [config] = await db.select()
        .from(productConfigurations)
        .where(eq(productConfigurations.id, id))
        .limit(1);
      return config;
    } catch (error) {
      console.error('Error fetching product configuration:', error);
      return undefined;
    }
  }

  async updateProductConfiguration(id: number, config: Partial<InsertProductConfiguration>): Promise<ProductConfiguration | undefined> {
    try {
      const [updated] = await db.update(productConfigurations)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(productConfigurations.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error('Error updating product configuration:', error);
      return undefined;
    }
  }

  async deleteProductConfiguration(id: number): Promise<boolean> {
    try {
      await db.delete(productConfigurations)
        .where(eq(productConfigurations.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting product configuration:', error);
      return false;
    }
  }

  async trackConfigurationDownload(download: InsertConfigurationDownload): Promise<ConfigurationDownload> {
    try {
      const [newDownload] = await db.insert(configurationDownloads)
        .values(download)
        .returning();
      return newDownload;
    } catch (error) {
      console.error('Error tracking configuration download:', error);
      throw error;
    }
  }

  async getConfigurationDownloads(userId?: string, productId?: number): Promise<ConfigurationDownload[]> {
    try {
      let query = db.select().from(configurationDownloads);
      
      const conditions: any[] = [];
      if (userId) {
        conditions.push(eq(configurationDownloads.userId, userId));
      }
      if (productId) {
        conditions.push(eq(configurationDownloads.productId, productId));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return await query.orderBy(desc(configurationDownloads.downloadedAt));
    } catch (error) {
      console.error('Error fetching configuration downloads:', error);
      return [];
    }
  }

  // MySpace operations implementation
  async getUserActivity(userId: string): Promise<any[]> {
    try {
      // Calculate 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Delete activities older than 30 days for this user
      await db.delete(userActivity)
        .where(and(
          eq(userActivity.userId, userId),
          sql`${userActivity.createdAt} < ${thirtyDaysAgo.toISOString()}`
        ));
      
      // Fetch activities from the last 30 days only
      const activity = await db.select().from(userActivity)
        .where(and(
          eq(userActivity.userId, userId),
          sql`${userActivity.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ))
        .orderBy(desc(userActivity.createdAt))
        .limit(100);
      return activity;
    } catch (error) {
      console.error('Error fetching user activity:', error);
      return [];
    }
  }

  async trackUserActivity(userId: string, activityData: any): Promise<any> {
    try {
      const [activity] = await db.insert(userActivity).values({
        userId,
        ...activityData
      }).returning();
      return activity;
    } catch (error) {
      console.error('Error tracking user activity:', error);
      throw error;
    }
  }

  async getRecentAdminActivity(since: Date): Promise<any[]> {
    try {
      const adminActivities = await db.select().from(userActivity)
        .where(and(
          sql`${userActivity.activityType} LIKE 'admin_%'`,
          sql`${userActivity.createdAt} >= ${since.toISOString()}`
        ))
        .orderBy(desc(userActivity.createdAt))
        .limit(100);
      return adminActivities;
    } catch (error) {
      console.error('Error fetching recent admin activity:', error);
      return [];
    }
  }

  async getMLRecommendations(userId: string): Promise<any[]> {
    try {
      // Get ML-based recommendations for the user
      const recommendations = await this.getRecommendations(userId, undefined, 10);
      return recommendations;
    } catch (error) {
      console.error('Error fetching ML recommendations:', error);
      return [];
    }
  }

  async getUserStats(userId: string): Promise<any> {
    try {
      // Get activity counts
      const [activityStats] = await db.select({
        totalActivities: sql<number>`count(*)`,
        viewCompanies: sql<number>`count(case when ${userActivity.activityType} = 'view_company' then 1 end)`,
        viewProducts: sql<number>`count(case when ${userActivity.activityType} = 'view_product' then 1 end)`,
        downloads: sql<number>`count(case when ${userActivity.activityType} = 'download' then 1 end)`
      })
      .from(userActivity)
      .where(eq(userActivity.userId, userId));

      return {
        companiesViewed: activityStats?.viewCompanies || 0,
        productsExplored: activityStats?.viewProducts || 0,
        totalDownloads: activityStats?.downloads || 0,
        totalActivities: activityStats?.totalActivities || 0
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return {
        companiesViewed: 0,
        productsExplored: 0,
        totalDownloads: 0,
        totalActivities: 0
      };
    }
  }

  // Wall/Social Feed operations
  async createPost(post: InsertPost): Promise<Post> {
    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getWallPosts(userId?: string, limit: number = 20, offset: number = 0): Promise<Post[]> {
    const baseQuery = db
      .select({
        id: posts.id,
        authorId: posts.authorId,
        authorType: posts.authorType,
        companyId: posts.companyId,
        content: posts.content,
        mediaAttachments: posts.mediaAttachments,
        visibility: posts.visibility,
        likesCount: posts.likesCount,
        commentsCount: posts.commentsCount,
        sharesCount: posts.sharesCount,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    // Filter by visibility if user is provided
    if (userId) {
      // Show public posts, posts by followed users, and posts from user's company
      return await baseQuery.where(
        or(
          eq(posts.visibility, "public"),
          and(eq(posts.visibility, "followers"), eq(posts.authorId, userId)),
          and(eq(posts.visibility, "company"), eq(posts.authorId, userId))
        )
      );
    } else {
      // Only show public posts for non-authenticated users
      return await baseQuery.where(eq(posts.visibility, "public"));
    }
  }

  async getPostById(postId: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    return post;
  }

  async updatePost(postId: number, updates: Partial<InsertPost>): Promise<Post | undefined> {
    const [updated] = await db
      .update(posts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(posts.id, postId))
      .returning();
    return updated;
  }

  async deletePost(postId: number): Promise<boolean> {
    const result = await db.delete(posts).where(eq(posts.id, postId));
    return result.rowCount > 0;
  }

  async createComment(comment: InsertPostComment): Promise<PostComment> {
    const [newComment] = await db.insert(postComments).values(comment).returning();
    
    // Increment comment count for the post
    if (comment.postType === "wall") {
      await db
        .update(posts)
        .set({ commentsCount: sql`${posts.commentsCount} + 1` })
        .where(eq(posts.id, comment.postId));
    }
    
    return newComment;
  }

  async getPostComments(postId: number, postType: "wall" | "company" = "wall"): Promise<PostComment[]> {
    return await db
      .select({
        id: postComments.id,
        postId: postComments.postId,
        userId: postComments.userId,
        content: postComments.content,
        parentCommentId: postComments.parentCommentId,
        postType: postComments.postType,
        likesCount: postComments.likesCount,
        createdAt: postComments.createdAt,
        updatedAt: postComments.updatedAt,
        authorName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('authorName'),
        authorAvatar: users.profileImageUrl,
      })
      .from(postComments)
      .leftJoin(users, eq(postComments.userId, users.id))
      .where(and(eq(postComments.postId, postId), eq(postComments.postType, postType)))
      .orderBy(asc(postComments.createdAt));
  }

  async deleteComment(commentId: number): Promise<boolean> {
    const [comment] = await db.select().from(postComments).where(eq(postComments.id, commentId));
    if (!comment) return false;

    const result = await db.delete(postComments).where(eq(postComments.id, commentId));
    
    // Decrement comment count for the post
    if (comment.postType === "wall") {
      await db
        .update(posts)
        .set({ commentsCount: sql`${posts.commentsCount} - 1` })
        .where(eq(posts.id, comment.postId));
    }
    
    return result.rowCount > 0;
  }

  async togglePostLike(postId: number, userId: string, postType: "wall" | "company" = "wall"): Promise<boolean> {
    // Check if like already exists
    const [existingLike] = await db
      .select()
      .from(postLikes)
      .where(and(
        eq(postLikes.postId, postId),
        eq(postLikes.userId, userId),
        eq(postLikes.postType, postType)
      ));

    if (existingLike) {
      // Remove like
      await db.delete(postLikes).where(eq(postLikes.id, existingLike.id));
      
      // Decrement like count
      if (postType === "wall") {
        await db
          .update(posts)
          .set({ likesCount: sql`${posts.likesCount} - 1` })
          .where(eq(posts.id, postId));
      }
      
      return false; // Like removed
    } else {
      // Add like
      await db.insert(postLikes).values({
        postId,
        userId,
        postType,
      });
      
      // Increment like count
      if (postType === "wall") {
        await db
          .update(posts)
          .set({ likesCount: sql`${posts.likesCount} + 1` })
          .where(eq(posts.id, postId));
      }
      
      return true; // Like added
    }
  }

  async toggleCommentLike(commentId: number, userId: string): Promise<boolean> {
    // Check if like already exists
    const [existingLike] = await db
      .select()
      .from(commentLikes)
      .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)));

    if (existingLike) {
      // Remove like
      await db.delete(commentLikes).where(eq(commentLikes.id, existingLike.id));
      
      // Decrement like count
      await db
        .update(postComments)
        .set({ likesCount: sql`${postComments.likesCount} - 1` })
        .where(eq(postComments.id, commentId));
      
      return false; // Like removed
    } else {
      // Add like
      await db.insert(commentLikes).values({ commentId, userId });
      
      // Increment like count
      await db
        .update(postComments)
        .set({ likesCount: sql`${postComments.likesCount} + 1` })
        .where(eq(postComments.id, commentId));
      
      return true; // Like added
    }
  }

  async sharePost(postId: number, userId: string, shareType: "repost" | "quote" | "forward" = "repost", content?: string): Promise<PostShare> {
    const [share] = await db.insert(postShares).values({
      postId,
      userId,
      shareType,
      content,
    }).returning();

    // Increment share count
    await db
      .update(posts)
      .set({ sharesCount: sql`${posts.sharesCount} + 1` })
      .where(eq(posts.id, postId));

    return share;
  }

  async getPostLikes(postId: number, postType: "wall" | "company" = "wall"): Promise<PostLike[]> {
    return await db
      .select({
        id: postLikes.id,
        postId: postLikes.postId,
        userId: postLikes.userId,
        postType: postLikes.postType,
        createdAt: postLikes.createdAt,
        userName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('userName'),
      })
      .from(postLikes)
      .leftJoin(users, eq(postLikes.userId, users.id))
      .where(and(eq(postLikes.postId, postId), eq(postLikes.postType, postType)))
      .orderBy(desc(postLikes.createdAt));
  }

  async isPostLikedByUser(postId: number, userId: string, postType: "wall" | "company" = "wall"): Promise<boolean> {
    const [like] = await db
      .select()
      .from(postLikes)
      .where(and(
        eq(postLikes.postId, postId),
        eq(postLikes.userId, userId),
        eq(postLikes.postType, postType)
      ));
    return !!like;
  }
}

export const storage = new DatabaseStorage();