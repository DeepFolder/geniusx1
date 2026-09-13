import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, index, unique, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for authentication and profiles
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Enhanced profile fields
  headline: varchar("headline"),
  bio: text("bio"),
  location: varchar("location"),
  country: varchar("country"),
  city: varchar("city"),
  professional: varchar("professional"),
  companyName: varchar("company_name"),
  website: varchar("website"),
  phone: varchar("phone"),
  linkedInUrl: varchar("linkedin_url"),
  githubUrl: varchar("github_url"),
  skills: text("skills").array(),
  experience: jsonb("experience"), // Array of work experience objects
  education: jsonb("education"), // Array of education objects
  // Company affiliation
  role: varchar("role").notNull().default("public"), // public, company_admin, admin
  companyId: integer("company_id").references(() => companies.id),
  position: varchar("position"),
  // Authentication
  passwordHash: varchar("password_hash"),
  // Status
  isActive: boolean("is_active").default(true),
  approvalStatus: varchar("approval_status").default('pending'), // 'pending' | 'approved' | 'rejected'
  approvalNote: text("approval_note"), // optional admin note on rejection
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User downloads tracking
export const userDownloads = pgTable("user_downloads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  downloadType: varchar("download_type", { enum: ["model", "catalog", "specification"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Search analytics
export const searchQueries = pgTable("search_queries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  query: text("query").notNull(),
  resultCount: integer("result_count").default(0),
  clickedResultId: integer("clicked_result_id"),
  clickedResultType: varchar("clicked_result_type", { enum: ["company", "product"] }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  industry: text("industry").notNull(),
  location: text("location").notNull(),
  phone: text("phone"),
  email: text("email").notNull(),
  contactEmail: text("contact_email"),
  website: text("website"),
  employeeCount: text("employee_count"),
  foundedYear: integer("founded_year"),
  logoPath: text("logo_path"),
  coverImagePath: text("cover_image_path"),
  colorTheme: text("color_theme").default("blue"),
  certifications: text("certifications").array(),
  capabilities: text("capabilities").array(),
  country: text("country"),
  companySize: text("company_size"),
  servicesOffered: text("services_offered").array(),
  targetMarkets: text("target_markets").array(),
  profileTemplate: text("profile_template").default("modern"), // Template layout
  customBranding: jsonb("custom_branding"), // Custom colors, fonts, styling
  featuredContent: jsonb("featured_content"), // What to highlight on profile
  layoutSettings: jsonb("layout_settings"), // Layout configuration
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product Categories table - for organizing products hierarchically
export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  parentCategoryId: integer("parent_category_id"), // For hierarchical categories
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  color: text("color").default("#3B82F6"), // For visual organization
  icon: text("icon").default("Package"), // Lucide icon name
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Groups table - for grouping similar products within categories
export const productGroups = pgTable("product_groups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  categoryId: integer("category_id").references(() => productCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  color: text("color").default("#10B981"), // For visual organization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  categoryId: integer("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  groupId: integer("group_id").references(() => productGroups.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // Legacy field, keeping for backward compatibility
  imagePath: text("image_path"),
  catalogPath: text("catalog_path"),
  modelPath: text("model_path"),
  modelType: text("model_type"), // 'stl' or 'step'
  productWebLink: text("product_web_link"), // External link to product on company website
  contactEmail: text("contact_email"), // Product-specific contact email
  orderLinks: jsonb("order_links"), // Array of order link objects { name, url }
  // Additional document paths for company admin uploads
  documentPaths: text("document_paths").array(), // Array of PDF document paths
  stepFilePaths: text("step_file_paths").array(), // Array of 3D STEP file paths
  additionalImagePaths: text("additional_image_paths").array(), // Array of additional product image paths
  specifications: jsonb("specifications"),
  datasheetText: text("datasheet_text"),
  price: numeric("price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company catalogues table
export const catalogues = pgTable("catalogues", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pdfPath: text("pdf_path").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company restricted documents table (for AI training only, not downloadable)
export const restrictedDocuments = pgTable("restricted_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pdfPath: text("pdf_path").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quoteRequests = pgTable("quote_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  productRequired: text("product_required").notNull(),
  quantity: integer("quantity"),
  timeline: text("timeline").notNull(),
  additionalRequirements: text("additional_requirements"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  fromCompanyId: integer("from_company_id").references(() => companies.id),
  toCompanyId: integer("to_company_id").references(() => companies.id).notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").default("user"), // 'user' or 'bot'
  createdAt: timestamp("created_at").defaultNow(),
});

// Company affiliation requests
export const companyRequests = pgTable("company_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  requestType: varchar("request_type", { enum: ["join", "invite"] }).notNull(),
  status: varchar("status", { enum: ["pending", "approved", "rejected"] }).default("pending"),
  message: text("message"),
  requestedBy: varchar("requested_by").references(() => users.id),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User following companies
export const userFollows = pgTable("user_follows", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Company documents table for uploaded files
export const companyDocuments = pgTable("company_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  description: text("description"),
  tags: text("tags").array(),
  category: text("category"), // e.g., "brochure", "certification", "manual", "presentation"
  isPublic: boolean("is_public").default(false),
  isProcessedForAI: boolean("is_processed_for_ai").default(false),
  aiSummary: text("ai_summary"), // AI-generated summary of document content
  extractedText: text("extracted_text"), // Full text extracted from document
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company contact inquiries table
export const companyInquiries = pgTable("company_inquiries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  senderName: text("sender_name").notNull(),
  senderEmail: text("sender_email").notNull(),
  senderCompany: text("sender_company"),
  senderPhone: text("sender_phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  inquiryType: text("inquiry_type").default("general"), // "general", "partnership", "quote", "support"
  status: text("status").default("new"), // "new", "read", "responded", "closed"
  priority: text("priority").default("medium"), // "low", "medium", "high", "urgent"
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  responseMessage: text("response_message"),
  respondedAt: timestamp("responded_at"),
  respondedBy: varchar("responded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company news and updates
export const companyPosts = pgTable("company_posts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  postType: varchar("post_type", { enum: ["news", "product", "update", "event"] }).default("news"),
  isPublished: boolean("is_published").default(true),
  likesCount: integer("likes_count").default(0),
  commentsCount: integer("comments_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Post likes (supports both company posts and wall posts)
export const postLikes = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(), // Can reference either companyPosts.id or posts.id
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  postType: varchar("post_type", { enum: ["company", "wall"] }).default("company"), // Distinguish post type
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.postId, table.userId, table.postType)
]);

// Post comments (supports both company posts and wall posts)
export const postComments = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(), // Can reference either companyPosts.id or posts.id
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  parentCommentId: integer("parent_comment_id"), // Self-reference handled separately
  postType: varchar("post_type", { enum: ["company", "wall"] }).default("company"), // Distinguish post type
  likesCount: integer("likes_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Comment likes
export const commentLikes = pgTable("comment_likes", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id").references(() => postComments.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.commentId, table.userId)
]);

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertCatalogueSchema = createInsertSchema(catalogues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestrictedDocumentSchema = createInsertSchema(restrictedDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteRequestSchema = createInsertSchema(quoteRequests).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertUserDownloadSchema = createInsertSchema(userDownloads).omit({
  id: true,
  createdAt: true,
});

export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({
  id: true,
  createdAt: true,
});

export const insertCompanyRequestSchema = createInsertSchema(companyRequests).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export const insertUserFollowSchema = createInsertSchema(userFollows).omit({
  id: true,
  createdAt: true,
});

export const insertCompanyPostSchema = createInsertSchema(companyPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  likesCount: true,
  commentsCount: true,
});

export const insertPostLikeSchema = createInsertSchema(postLikes).omit({
  id: true,
  createdAt: true,
});

export const insertPostCommentSchema = createInsertSchema(postComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  likesCount: true,
});

export const insertCommentLikeSchema = createInsertSchema(commentLikes).omit({
  id: true,
  createdAt: true,
});

export const insertCompanyDocumentSchema = createInsertSchema(companyDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanyInquirySchema = createInsertSchema(companyInquiries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
});


// Product Category and Group schemas
export const insertProductCategorySchema = createInsertSchema(productCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductGroupSchema = createInsertSchema(productGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type exports for frontend
export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = typeof insertProductCategorySchema._type;
export type ProductGroup = typeof productGroups.$inferSelect;
export type InsertProductGroup = typeof insertProductGroupSchema._type;

// User activity tracking for statistics
export const userActivity = pgTable("user_activity", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  activityType: varchar("activity_type", { 
    enum: [
      "view_company", "view_product", "search", "download", "favorite", "unfavorite", "follow", "unfollow", "contact",
      "admin_delete_company", "admin_delete_product", "admin_delete_user",
      "admin_suspend_user", "admin_activate_user", "admin_change_role"
    ] 
  }).notNull(),
  entityId: varchar("entity_id"), // Can be company_id, product_id, etc.
  entityType: varchar("entity_type", { enum: ["company", "product", "user"] }),
  metadata: jsonb("metadata"), // Additional activity data
  createdAt: timestamp("created_at").defaultNow(),
});

export const userFavorites = pgTable("user_favorites", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  favoriteType: varchar("favorite_type").notNull(), // 'company' or 'product'
  favoriteId: integer("favorite_id").notNull(), // DB id for internal products; URL-based hash for external
  // Collision-proof identity key for external (web-search) products.
  // Derived from the product URL (or name::company fallback).
  // NULL for internal DB products. PostgreSQL treats NULLs as distinct in unique indexes,
  // so multiple internal rows (all NULL) are allowed while each external key is enforced unique.
  externalCanonicalKey: text("external_canonical_key"),
  externalData: jsonb("external_data"), // Full snapshot for external products
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Internal products: unique by DB favoriteId (existing constraint — unchanged)
  unique().on(table.userId, table.favoriteType, table.favoriteId),
  // External products: unique by URL-derived canonical key.
  // PostgreSQL treats NULLs as distinct in unique indexes, so internal rows (all NULL) are unaffected.
  uniqueIndex("uq_user_favorites_ext_key").on(table.userId, table.favoriteType, table.externalCanonicalKey),
]);

// Product Configurator Tables - Simplified approach
export const productConfigurations = pgTable("product_configurations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  specifications: text("specifications"),
  datasheetPath: varchar("datasheet_path", { length: 500 }),
  modelPath: varchar("model_path", { length: 500 }),
  modelType: varchar("model_type", { enum: ["step", "stl"] }),
  webLink: varchar("web_link", { length: 1000 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const configurationDownloads = pgTable("configuration_downloads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }),
  productId: integer("product_id").references(() => products.id).notNull(),
  configurationId: integer("configuration_id").references(() => productConfigurations.id).notNull(),
  fileType: varchar("file_type", { enum: ["datasheet", "model"] }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  downloadedAt: timestamp("downloaded_at").defaultNow(),
});

export const insertProductConfigurationSchema = createInsertSchema(productConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductConfiguration = z.infer<typeof insertProductConfigurationSchema>;
export type ProductConfiguration = typeof productConfigurations.$inferSelect;
export type InsertConfigurationDownload = typeof configurationDownloads.$inferInsert;
export type ConfigurationDownload = typeof configurationDownloads.$inferSelect;

// Wall/Social Feed Tables
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  authorType: varchar("author_type", { enum: ["user", "company"] }).notNull(),
  companyId: integer("company_id").references(() => companies.id),
  content: text("content").notNull(),
  mediaAttachments: jsonb("media_attachments").$type<Array<{
    id: string;
    type: 'image' | 'video' | '3d_model';
    url: string;
    filename: string;
    size: number;
    thumbnailUrl?: string;
  }>>().default([]),
  visibility: varchar("visibility", { enum: ["public", "followers", "company"] }).default("public"),
  likesCount: integer("likes_count").default(0),
  commentsCount: integer("comments_count").default(0),
  sharesCount: integer("shares_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


export const postShares = pgTable("post_shares", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  shareType: varchar("share_type", { enum: ["repost", "quote", "forward"] }).default("repost"),
  content: text("content"), // For quote shares
  createdAt: timestamp("created_at").defaultNow(),
});

// Post types and schemas
export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type PostLike = typeof postLikes.$inferSelect;
export type InsertPostLike = typeof postLikes.$inferInsert;
export type PostComment = typeof postComments.$inferSelect;
export type InsertPostComment = typeof postComments.$inferInsert;
export type CommentLike = typeof commentLikes.$inferSelect;
export type InsertCommentLike = typeof commentLikes.$inferInsert;
export type PostShare = typeof postShares.$inferSelect;
export type InsertPostShare = typeof postShares.$inferInsert;

export const createPostSchema = createInsertSchema(posts).omit({
  id: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  createdAt: true,
  updatedAt: true,
});

export const createCommentSchema = createInsertSchema(postComments).omit({
  id: true,
  likesCount: true,
  createdAt: true,
  updatedAt: true,
});

// User registration and login schemas
export const userRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().optional(),
  location: z.string().optional(),
  role: z.enum(['public', 'company_admin']).default('public'),
});

export const userLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const userProfileUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  professional: z.string().optional(),
  companyName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedInUrl: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  profileImageUrl: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    location: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string(),
    field: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const changeEmailSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
  currentPassword: z.string().min(1, "Current password is required to confirm this change"),
});

export type ChangeEmail = z.infer<typeof changeEmailSchema>;

export const companyRegisterSchema = z.object({
  user: userRegistrationSchema,
  company: insertCompanySchema,
});

export type UpsertUser = typeof users.$inferInsert;

// AI Matchmaking tables
export const aiMatchingSuggestions = pgTable("ai_matching_suggestions", {
  id: varchar("id").primaryKey().notNull(),
  companyId: integer("company_id").references(() => companies.id),
  targetCompanyId: integer("target_company_id").references(() => companies.id),
  type: varchar("type").notNull(), // partnership, supplier, customer, collaboration
  matchScore: integer("match_score").notNull(),
  reasons: text("reasons").array().notNull(),
  potentialValue: text("potential_value"),
  actionItems: text("action_items").array().notNull(),
  compatibility: jsonb("compatibility").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messaging System tables
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().notNull(),
  participants: text("participants").array().notNull(),
  lastMessageId: varchar("last_message_id"),
  unreadCount: integer("unread_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  senderId: varchar("sender_id").notNull(),
  senderName: varchar("sender_name").notNull(),
  senderCompany: varchar("sender_company").notNull(),
  content: text("content").notNull(),
  type: varchar("type").notNull(), // text, file, system
  fileUrl: varchar("file_url"),
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  status: varchar("status").notNull().default("sent"), // sent, delivered, read
  timestamp: timestamp("timestamp").defaultNow(),
});

// Document Analysis tables
export const documentAnalyses = pgTable("document_analyses", {
  id: varchar("id").primaryKey().notNull(),
  companyId: integer("company_id").references(() => companies.id),
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileType: varchar("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  status: varchar("status").notNull().default("processing"), // processing, completed, failed
  progress: integer("progress").default(0),
  analysis: jsonb("analysis"),
  actionableItems: jsonb("actionable_items").default('[]'),
  uploadDate: timestamp("upload_date").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Analytics tables
export const analyticsData = pgTable("analytics_data", {
  id: varchar("id").primaryKey().notNull(),
  companyId: integer("company_id").references(() => companies.id),
  date: timestamp("date").notNull(),
  views: integer("views").default(0),
  downloads: integer("downloads").default(0),
  connections: integer("connections").default(0),
  revenue: integer("revenue").default(0),
  conversionRate: integer("conversion_rate").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 3D Configuration tables
export const product3DConfigurations = pgTable("product_3d_configurations", {
  id: varchar("id").primaryKey().notNull(),
  productId: integer("product_id").references(() => products.id),
  companyId: integer("company_id").references(() => companies.id),
  configuration: jsonb("configuration").notNull(),
  material: varchar("material"),
  finish: varchar("finish"),
  price: integer("price").notNull(),
  quantity: integer("quantity").default(1),
  modelUrl: varchar("model_url"),
  thumbnailUrl: varchar("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory Management tables
export const inventoryStatus = pgTable("inventory_status", {
  id: varchar("id").primaryKey().notNull(),
  productId: integer("product_id").references(() => products.id),
  companyId: integer("company_id").references(() => companies.id),
  configuration: jsonb("configuration"),
  inStock: boolean("in_stock").default(true),
  quantity: integer("quantity").default(0),
  leadTime: varchar("lead_time"),
  suppliers: text("suppliers").array().default([]),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Export types
export type AIMatchingSuggestion = typeof aiMatchingSuggestions.$inferSelect;
export type DocumentAnalysis = typeof documentAnalyses.$inferSelect;
export type AnalyticsData = typeof analyticsData.$inferSelect;
export type Product3DConfiguration = typeof product3DConfigurations.$inferSelect;
export type InventoryStatus = typeof inventoryStatus.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type UserDownload = typeof userDownloads.$inferSelect;
export type InsertUserDownload = z.infer<typeof insertUserDownloadSchema>;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;
export type CompanyRequest = typeof companyRequests.$inferSelect;
export type InsertCompanyRequest = z.infer<typeof insertCompanyRequestSchema>;
export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = z.infer<typeof insertUserFollowSchema>;
export type CompanyPost = typeof companyPosts.$inferSelect;
export type InsertCompanyPost = z.infer<typeof insertCompanyPostSchema>;
export type CompanyDocument = typeof companyDocuments.$inferSelect;
export type InsertCompanyDocument = z.infer<typeof insertCompanyDocumentSchema>;
export type CompanyInquiry = typeof companyInquiries.$inferSelect;
export type InsertCompanyInquiry = z.infer<typeof insertCompanyInquirySchema>;
export type UserFavorite = typeof userFavorites.$inferSelect;
export const insertUserFavoriteSchema = createInsertSchema(userFavorites).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFavorite = z.infer<typeof insertUserFavoriteSchema>;

// Activity schema exports
export const insertUserActivitySchema = createInsertSchema(userActivity).omit({
  id: true,
  createdAt: true,
});

export type UserActivity = typeof userActivity.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type User = typeof users.$inferSelect;
export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;

// Recommendation Engine Tables
export const userInteractions = pgTable("user_interactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  targetType: varchar("target_type", { enum: ["company", "product", "user", "post"] }).notNull(),
  targetId: varchar("target_id").notNull(),
  interactionType: varchar("interaction_type", { 
    enum: ["view", "like", "follow", "download", "search", "chat", "share", "contact"] 
  }).notNull(),
  duration: integer("duration"), // Time spent in milliseconds
  metadata: jsonb("metadata"), // Additional context like search terms, referrer, etc.
  score: integer("score").default(1), // Weighted importance of interaction
  createdAt: timestamp("created_at").defaultNow(),
});

export const networkConnections = pgTable("network_connections", {
  id: serial("id").primaryKey(),
  fromUserId: varchar("from_user_id").references(() => users.id).notNull(),
  toUserId: varchar("to_user_id").references(() => users.id).notNull(),
  connectionType: varchar("connection_type", { 
    enum: ["colleague", "client", "vendor", "partner", "industry_peer", "potential_lead"] 
  }).notNull(),
  strength: integer("strength").default(1), // 1-10 connection strength
  mutualConnections: integer("mutual_connections").default(0),
  lastInteraction: timestamp("last_interaction"),
  status: varchar("status", { enum: ["pending", "accepted", "declined", "blocked"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_connection").on(table.fromUserId, table.toUserId)
]);

export const recommendationScores = pgTable("recommendation_scores", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  recommendedType: varchar("recommended_type", { enum: ["company", "product", "user", "connection"] }).notNull(),
  recommendedId: varchar("recommended_id").notNull(),
  score: integer("score").notNull(), // 0-100 recommendation confidence
  reasons: text("reasons").array(), // Array of reason codes
  algorithmVersion: varchar("algorithm_version").default("1.0"),
  metadata: jsonb("metadata"), // Algorithm-specific data
  isViewed: boolean("is_viewed").default(false),
  isActedUpon: boolean("is_acted_upon").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Recommendations can expire
}, (table) => [
  index("idx_user_recommendations").on(table.userId, table.score),
  index("idx_recommendation_expiry").on(table.expiresAt)
]);

export const industryConnections = pgTable("industry_connections", {
  id: serial("id").primaryKey(),
  industry1: varchar("industry1").notNull(),
  industry2: varchar("industry2").notNull(),
  connectionStrength: integer("connection_strength").default(1), // How related industries are
  commonKeywords: text("common_keywords").array(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_industry_pair").on(table.industry1, table.industry2)
]);

// Semantic search embeddings table
export const searchEmbeddings = pgTable("search_embeddings", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { enum: ["company", "product"] }).notNull(),
  entityId: integer("entity_id").notNull(),
  embedding: text("embedding").notNull(), // JSON-encoded vector
  textContent: text("text_content").notNull(), // Original text for reference
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_entity_embedding").on(table.entityType, table.entityId)
]);

// Insert schemas for recommendation engine
export const insertUserInteractionSchema = createInsertSchema(userInteractions).omit({
  id: true,
  createdAt: true,
});

export const insertNetworkConnectionSchema = createInsertSchema(networkConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecommendationScoreSchema = createInsertSchema(recommendationScores).omit({
  id: true,
  createdAt: true,
});

export const insertIndustryConnectionSchema = createInsertSchema(industryConnections).omit({
  id: true,
  updatedAt: true,
});

export const insertSearchEmbeddingSchema = createInsertSchema(searchEmbeddings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for recommendation engine
export type UserInteraction = typeof userInteractions.$inferSelect;
export type InsertUserInteraction = z.infer<typeof insertUserInteractionSchema>;
export type NetworkConnection = typeof networkConnections.$inferSelect;
export type InsertNetworkConnection = z.infer<typeof insertNetworkConnectionSchema>;
export type RecommendationScore = typeof recommendationScores.$inferSelect;
export type InsertRecommendationScore = z.infer<typeof insertRecommendationScoreSchema>;
export type IndustryConnection = typeof industryConnections.$inferSelect;
export type InsertIndustryConnection = z.infer<typeof insertIndustryConnectionSchema>;
export type SearchEmbedding = typeof searchEmbeddings.$inferSelect;
export type InsertSearchEmbedding = z.infer<typeof insertSearchEmbeddingSchema>;

// Legal consent tracking
export const userConsents = pgTable("user_consents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  consentType: varchar("consent_type", { 
    enum: ["terms_of_service", "privacy_policy", "cookie_policy", "data_processing", "marketing"] 
  }).notNull(),
  version: varchar("version").notNull(), // Version of the policy they consented to
  accepted: boolean("accepted").notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({
  id: true,
  createdAt: true,
});

export type UserConsent = typeof userConsents.$inferSelect;
export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;

// ==============================================================================
// KNOWLEDGE GRAPH & DOCUMENT RAG SYSTEM
// ==============================================================================

// Document Index - Canonical reference for all documents across the platform
export const documentIndex = pgTable("document_index", {
  id: serial("id").primaryKey(),
  sourceType: varchar("source_type", { 
    enum: ["catalogue", "restricted_document", "company_document", "product_datasheet"] 
  }).notNull(),
  sourceId: integer("source_id").notNull(), // References the specific document table
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }), // Nullable - for product-specific docs
  documentName: text("document_name").notNull(),
  documentPath: text("document_path").notNull(),
  documentType: varchar("document_type", { 
    enum: ["pdf", "step", "stl", "image", "other"] 
  }).notNull(),
  isProcessed: boolean("is_processed").default(false),
  processingStatus: varchar("processing_status", { 
    enum: ["pending", "processing", "completed", "failed"] 
  }).default("pending"),
  totalChunks: integer("total_chunks").default(0),
  metadata: jsonb("metadata"), // Additional document metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_document_index_company").on(table.companyId),
  index("idx_document_index_product").on(table.productId),
  index("idx_document_index_source").on(table.sourceType, table.sourceId),
]);

// Document Chunks - Semantic chunks with embeddings for RAG
export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentIndexId: integer("document_index_id").references(() => documentIndex.id, { onDelete: "cascade" }).notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }), // Nullable
  chunkText: text("chunk_text").notNull(),
  chunkIndex: integer("chunk_index").notNull(), // Order within document
  pageNumber: integer("page_number"), // For PDFs
  sectionHeading: text("section_heading"), // Extracted section/heading if available
  tokenCount: integer("token_count").notNull(),
  // pgvector column for embeddings (1536 dimensions for text-embedding-3-small)
  embedding: text("embedding").notNull(), // Will store JSON array until pgvector extension is enabled
  metadata: jsonb("metadata"), // Additional chunk metadata (confidence, extraction method, etc.)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_document_chunks_document").on(table.documentIndexId),
  index("idx_document_chunks_company").on(table.companyId),
  index("idx_document_chunks_product").on(table.productId),
  unique().on(table.documentIndexId, table.chunkIndex), // Ensure unique ordering within document
  // Note: Full-text search will be added via ALTER TABLE after creation:
  // ALTER TABLE document_chunks ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED;
  // CREATE INDEX idx_document_chunks_search ON document_chunks USING GIN(search_vector);
  // Note: When pgvector is enabled, add: CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
]);

// Entity Relationships - Graph edges for knowledge graph
export const entityRelationships = pgTable("entity_relationships", {
  id: serial("id").primaryKey(),
  sourceEntityType: varchar("source_entity_type", { 
    enum: ["company", "product", "category", "document", "specification"] 
  }).notNull(),
  sourceEntityId: integer("source_entity_id").notNull(),
  targetEntityType: varchar("target_entity_type", { 
    enum: ["company", "product", "category", "document", "specification"] 
  }).notNull(),
  targetEntityId: integer("target_entity_id").notNull(),
  relationshipType: varchar("relationship_type", { 
    enum: ["contains", "produces", "references", "part_of", "related_to", "similar_to", "compatible_with"] 
  }).notNull(),
  strength: numeric("strength", { precision: 5, scale: 4 }).default("1.0"), // Relationship strength 0.0-1.0
  metadata: jsonb("metadata"), // Additional relationship metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_entity_rel_source").on(table.sourceEntityType, table.sourceEntityId),
  index("idx_entity_rel_target").on(table.targetEntityType, table.targetEntityId),
  index("idx_entity_rel_type").on(table.relationshipType),
  index("idx_entity_rel_composite").on(table.sourceEntityType, table.sourceEntityId, table.targetEntityType, table.targetEntityId),
  unique().on(table.sourceEntityType, table.sourceEntityId, table.targetEntityType, table.targetEntityId, table.relationshipType), // Prevent duplicate relationships
]);

// Product Specifications Index - Normalized spec key-value pairs for querying
export const productSpecificationsIndex = pgTable("product_specifications_index", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  specKey: text("spec_key").notNull(), // e.g., "material", "dimensions", "weight"
  specValue: text("spec_value").notNull(), // String representation
  valueType: varchar("value_type", { 
    enum: ["text", "number", "boolean", "array", "object"] 
  }).notNull(),
  numericValue: numeric("numeric_value"), // For range queries on numeric specs
  unit: varchar("unit"), // e.g., "mm", "kg", "°C"
  metadata: jsonb("metadata"), // Additional spec metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_product_specs_product_key").on(table.productId, table.specKey), // Composite index for efficient lookups
  index("idx_product_specs_key").on(table.specKey),
  index("idx_product_specs_numeric").on(table.numericValue),
  unique().on(table.productId, table.specKey), // Prevent duplicate specs for same product
]);

// Insert schemas for new tables
export const insertDocumentIndexSchema = createInsertSchema(documentIndex).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true,
  createdAt: true,
});

export const insertEntityRelationshipSchema = createInsertSchema(entityRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSpecificationIndexSchema = createInsertSchema(productSpecificationsIndex).omit({
  id: true,
  createdAt: true,
});

// Types
export type DocumentIndex = typeof documentIndex.$inferSelect;
export type InsertDocumentIndex = z.infer<typeof insertDocumentIndexSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type EntityRelationship = typeof entityRelationships.$inferSelect;
export type InsertEntityRelationship = z.infer<typeof insertEntityRelationshipSchema>;
export type ProductSpecificationIndex = typeof productSpecificationsIndex.$inferSelect;
export type InsertProductSpecificationIndex = z.infer<typeof insertProductSpecificationIndexSchema>;

// User Projects - replaces flat favorites with project-based organization
export const userProjects = pgTable("user_projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default("Project 1"),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("purple"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project items - products and companies saved to projects
export const projectItems = pgTable("project_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => userProjects.id, { onDelete: "cascade" }).notNull(),
  itemType: varchar("item_type", { enum: ["product", "company"] }).notNull(),
  itemId: integer("item_id").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.projectId, table.itemType, table.itemId)
]);

export const insertUserProjectSchema = createInsertSchema(userProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectItemSchema = createInsertSchema(projectItems).omit({
  id: true,
  createdAt: true,
});

export type UserProject = typeof userProjects.$inferSelect;
export type InsertUserProject = z.infer<typeof insertUserProjectSchema>;
export type ProjectItem = typeof projectItems.$inferSelect;
export type InsertProjectItem = z.infer<typeof insertProjectItemSchema>;

// AI Chat Sessions for DeepSearch
export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: varchar("title").default("New Chat"),
  lastQuery: text("last_query"),
  isPinned: boolean("is_pinned").default(false),
  rollingContextSummary: text("rolling_context_summary"),
  summarizedUntilMessageId: integer("summarized_until_message_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiChatSessionMessages = pgTable("ai_chat_session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => aiChatSessions.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  isUser: boolean("is_user").notNull(),
  searchResults: jsonb("search_results"),
  suggestions: text("suggestions").array(),
  status: varchar("status", { length: 20, enum: ["complete", "streaming", "failed"] }).default("complete").notNull(),
  estimatedTokens: integer("estimated_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiChatSessionSchema = createInsertSchema(aiChatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiChatSessionMessageSchema = createInsertSchema(aiChatSessionMessages).omit({
  id: true,
  createdAt: true,
});

export type AiChatSession = typeof aiChatSessions.$inferSelect;
export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type AiChatSessionMessage = typeof aiChatSessionMessages.$inferSelect;
export type InsertAiChatSessionMessage = z.infer<typeof insertAiChatSessionMessageSchema>;

export const agentSettings = pgTable("agent_settings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  instructions: text("instructions"),
  model: varchar("model", { length: 100 }),
  reasoningEffort: varchar("reasoning_effort", { length: 50 }),
  storeEnabled: boolean("store_enabled"),
  webSearchEnabled: boolean("web_search_enabled"),
  searchContextSize: varchar("search_context_size", { length: 50 }),
  temperature: numeric("temperature"),
  maxTokens: integer("max_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  outputSchema: text("output_schema"),
  reasoningSummary: varchar("reasoning_summary", { length: 50 }),
  guardrailsEnabled: boolean("guardrails_enabled"),
  guardrailsConfig: text("guardrails_config"),
  topicRestrictionEnabled: boolean("topic_restriction_enabled").default(true),
  topicRestrictionMessage: text("topic_restriction_message"),
  allowedTopics: text("allowed_topics"),
  compactionThresholdPct: integer("compaction_threshold_pct").default(70),
  compactionModel: varchar("compaction_model", { length: 100 }),
  systemInstructionPct: integer("system_instruction_pct").default(20),
  fluidMemoryPct: integer("fluid_memory_pct").default(10),
  conversationPct: integer("conversation_pct").default(70),
});

export const insertAgentSettingsSchema = createInsertSchema(agentSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AgentSettings = typeof agentSettings.$inferSelect;
export type InsertAgentSettings = z.infer<typeof insertAgentSettingsSchema>;

export const hybridSearchUsage = pgTable("hybrid_search_usage", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 255 }).notNull(),
  sessionId: varchar("session_id", { length: 255 }),
  query: text("query").notNull(),
  userId: varchar("user_id", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 100 }),
  userAgent: text("user_agent"),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  apiCalls: jsonb("api_calls").default([]),
  totalPromptTokens: integer("total_prompt_tokens").default(0),
  totalCompletionTokens: integer("total_completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  totalDurationMs: integer("total_duration_ms").default(0),
  searchMode: varchar("search_mode", { length: 50 }),
  productsFound: integer("products_found").default(0),
  classificationIntent: varchar("classification_intent", { length: 100 }),
  classificationDomain: varchar("classification_domain", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_hybrid_search_usage_user").on(table.userId),
  index("idx_hybrid_search_usage_created").on(table.createdAt),
  index("idx_hybrid_search_usage_session").on(table.sessionId),
  index("idx_hybrid_search_usage_user_created").on(table.userId, table.createdAt),
]);

export type HybridSearchUsage = typeof hybridSearchUsage.$inferSelect;

export const agentInstructionHistory = pgTable("agent_instruction_history", {
  id: serial("id").primaryKey(),
  instructions: text("instructions").notNull(),
  label: varchar("label", { length: 255 }),
  savedAt: timestamp("saved_at").defaultNow(),
}, (table) => [
  index("idx_agent_instruction_history_saved").on(table.savedAt),
]);

export type AgentInstructionHistory = typeof agentInstructionHistory.$inferSelect;

// Benchmark runs — persisted so results survive deploys and are visible in production
export const benchmarkRuns = pgTable("benchmark_runs", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at").notNull(),
  fixtureCount: integer("fixture_count").notNull(),
  aggregate: jsonb("aggregate").notNull(),
  fixtures: jsonb("fixtures").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_benchmark_runs_run_at").on(table.runAt),
]);

export type BenchmarkRun = typeof benchmarkRuns.$inferSelect;

// Beta Feedback Notebook
export const betaFeedback = pgTable("beta_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  authorRole: varchar("author_role", { length: 50 }).notNull(),
  pageUrl: varchar("page_url", { length: 1000 }).notNull(),
  bullets: text("bullets").array().notNull(),
  status: varchar("status", { length: 50 }).notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBetaFeedbackSchema = createInsertSchema(betaFeedback).omit({
  id: true,
  createdAt: true,
});

export type BetaFeedback = typeof betaFeedback.$inferSelect;
export type InsertBetaFeedback = z.infer<typeof insertBetaFeedbackSchema>;

// Fallback file storage — used when object-storage sidecar cannot issue GCS
// tokens in the deployed environment.  Files are stored as base64 text and
// served via GET /api/files/:id.
export const fileStorage = pgTable("file_storage", {
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(), // base64-encoded file bytes
  createdAt: timestamp("created_at").defaultNow(),
});

export type FileStorageRecord = typeof fileStorage.$inferSelect;

// Model pricing table — DB-persisted so admins can refresh or manually edit rates
export const modelPricing = pgTable("model_pricing", {
  model: text("model").primaryKey(),
  inputPerMtok: numeric("input_per_mtok", { precision: 10, scale: 6 }).notNull(),
  outputPerMtok: numeric("output_per_mtok", { precision: 10, scale: 6 }).notNull(),
  source: text("source").notNull().default("hardcoded"), // "hardcoded" | "auto" | "manual" | "missing"
  fetchedAt: timestamp("fetched_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ModelPricing = typeof modelPricing.$inferSelect;

// Copyright complaint submissions
export const copyrightComplaints = pgTable("copyright_complaints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull(),
  company: text("company"),
  infringingUrl: text("infringing_url").notNull(),
  description: text("description").notNull(),
  declarationAccepted: boolean("declaration_accepted").notNull().default(false),
  status: varchar("status", { enum: ["pending", "reviewed"] }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCopyrightComplaintSchema = createInsertSchema(copyrightComplaints).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type CopyrightComplaint = typeof copyrightComplaints.$inferSelect;
export type InsertCopyrightComplaint = z.infer<typeof insertCopyrightComplaintSchema>;

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  usedAt: true,
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// ---------------------------------------------------------------------------
// Genius X1 — engineering calculation platform
// ---------------------------------------------------------------------------

// Global admin-configurable settings for Genius X1 generation.
// Single-row table (always upsert by id=1). Defaults reproduce current behaviour.
export const geniusSettings = pgTable("genius_settings", {
  id: serial("id").primaryKey(),
  generationModel: varchar("generation_model").notNull().default("gpt-4o"),
  reasoningEffort: varchar("reasoning_effort").notNull().default("none"),
  temperature: numeric("temperature").notNull().default("0.2"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGeniusSettingsSchema = createInsertSchema(geniusSettings).omit({ id: true, updatedAt: true });
export type InsertGeniusSettings = z.infer<typeof insertGeniusSettingsSchema>;
export type GeniusSettings = typeof geniusSettings.$inferSelect;

// ---------------------------------------------------------------------------

// A single calculation is stored as a JSON document in `document`.
export const geniusCalculations = pgTable("genius_calculations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull().default("Untitled Calculation"),
  document: jsonb("document").notNull(),
  // Client-generated correlation id: lets the client find the calculation it
  // initiated if the connection drops before the HTTP response arrives.
  clientRequestId: varchar("client_request_id", { length: 64 }),
  pinned: boolean("pinned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Durable, owner-scoped work queue for long-running Genius operations.
 * Payload/result are deliberately JSON so a job can be resumed or inspected
 * after a web worker handoff without exposing it to another user.
 */
export const geniusJobs = pgTable(
  "genius_jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull().default("calculation"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    stage: varchar("stage", { length: 64 }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    payload: jsonb("payload"),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("genius_jobs_owner_updated_idx").on(table.userId, table.updatedAt),
    index("genius_jobs_expiry_idx").on(table.expiresAt),
  ],
);

export type GeniusJobRow = typeof geniusJobs.$inferSelect;

// Permanent record of the chat transcript that produced/updated a calculation.
// One row per message (user prompt or assistant reply), ordered by id/createdAt.
// Calculations saved before this table existed simply have no rows here.
export const geniusChatMessages = pgTable("genius_chat_messages", {
  id: serial("id").primaryKey(),
  calculationId: integer("calculation_id")
    .references(() => geniusCalculations.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GeniusChatMessageRow = typeof geniusChatMessages.$inferSelect;

export const geniusStepComments = pgTable(
  "genius_step_comments",
  {
    id: serial("id").primaryKey(),
    calculationId: integer("calculation_id")
      .references(() => geniusCalculations.id, { onDelete: "cascade" })
      .notNull(),
    stepId: varchar("step_id", { length: 64 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("genius_step_comments_calculation_step_created_idx").on(
      table.calculationId,
      table.stepId,
      table.createdAt,
    ),
  ],
);
export const geniusCalculationVersions = pgTable(
  "genius_calculation_versions",
  {
    id: serial("id").primaryKey(),
    calculationId: integer("calculation_id")
      .references(() => geniusCalculations.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    document: jsonb("document").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("genius_calculation_versions_calculation_version_idx").on(
      table.calculationId,
      table.version,
    ),
    index("genius_calculation_versions_calculation_created_idx").on(
      table.calculationId,
      table.createdAt,
    ),
  ],
);
const geniusValue = z.union([z.number(), z.string()]);

// ── Strict symbol validators ──────────────────────────────────────────────────
// Used only when parsing fresh AI output (geniusCalculationDocSchemaStrict).
// Enforces the prompt's "10 characters max, valid identifier" contract so new
// generations conform; existing saved documents are parsed leniently (below).
export const geniusSymbolStrict = z
  .string()
  .max(10)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Symbol must be a valid identifier (letters, digits, underscore; start with letter or underscore)",
  );
export const geniusSymbolStrictOptional = geniusSymbolStrict.optional();

// ── Main (lenient) schemas ────────────────────────────────────────────────────
// Used everywhere else: loading from the database, saving edits, follow-up
// generation that re-submits an existing document. No length or regex
// constraint so legacy documents with longer symbols continue to round-trip.

export const geniusInputSchema = z.object({
  id: z.string(),
  symbol: z.string(),   // lenient — DB-round-trip safe
  label: z.string(),
  value: geniusValue,
  unit: z.string().default(""),
  // Retains the display unit expected by a legacy expression that contains its
  // own scale conversion after the user switches the input to an equivalent unit.
  evaluationUnit: z.string().max(64).optional(),
  editable: z.boolean().default(true),
  description: z.string().max(300).default(""),
});

export const geniusAssumptionSchema = z.object({
  id: z.string(),
  symbol: z.string().optional(),   // lenient
  label: z.string(),
  value: geniusValue,
  unit: z.string().default(""),
  evaluationUnit: z.string().max(64).optional(),
  rationale: z.string().default(""),
  editable: z.boolean().default(true),
});

export const geniusStepSchema = z.object({
  id: z.string().max(64),
  symbol: z.string().max(64).optional(),   // lenient — was max(64) before
  title: z.string().max(300),
  description: z.string().max(2000).default(""),
  formula: z.string().max(1000).default(""),
  // Bounded to keep the server-side evaluator's work per request small.
  expr: z.string().max(1000).default(""),
  calculation: z.string().max(1000).default(""),
  result: z.string().max(200).default(""),
  unit: z.string().max(64).default(""),
  sources: z.array(z.number()).max(50).default([]),
  warnings: z.array(z.string().max(500)).max(50).default([]),
  // Set by the deterministic dimensional-analysis pass, never by the model.
  reviewNeeded: z.boolean().optional(),
});

export const geniusResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  symbol: z.string().optional(),   // lenient
  value: z.string().default(""),
  unit: z.string().default(""),
  sources: z.array(z.number()).default([]),
  description: z.string().max(300).default(""),
  // A displayed value whose source expression or declared unit needs review.
  reviewNeeded: z.boolean().optional(),
  warnings: z.array(z.string().max(500)).max(50).optional(),
});

export const sourceTierSchema = z.enum(["standard", "handbook", "manufacturer", "academic", "general", "unknown"]);
export type SourceTier = z.infer<typeof sourceTierSchema>;

export const geniusReferenceSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().default(""),
  sourceType: sourceTierSchema.optional(),
});

export const geniusConfidenceSchema = z.object({
  score: z.number(),
  explanation: z.string().default(""),
  factors: z.array(z.string()).default([]),
  sourceQualityNote: z.string().optional(),
});

export type GeniusConfidenceLevel = "High" | "Medium" | "Low";

/** Converts a stored numeric confidence score into the user-facing confidence level. */
export function getGeniusConfidenceLevel(score: number): GeniusConfidenceLevel {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

export const geniusVisualizationSchema = z.object({
  id: z.string(),
  type: z.enum(["table", "chart"]),
  title: z.string().default(""),
  caption: z.string().default(""),
  // table
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(geniusValue)).optional(),
  // chart
  chartType: z.enum(["line", "bar"]).optional(),
  xKey: z.string().optional(),
  xLabel: z.string().optional(),
  xUnit: z.string().optional(),
  yLabel: z.string().optional(),
  yUnit: z.string().optional(),
  series: z.array(z.object({ key: z.string(), label: z.string(), unit: z.string().optional() })).optional(),
  data: z.array(z.record(geniusValue)).optional(),
});

export const geniusCalculationDocSchema = z.object({
  projectTitle: z.string().max(300).default("Untitled Calculation"),
  problemStatement: z.string().max(4000).default(""),
  /** Maximum decimal places shown in results/charts. Omitted means the two-place default. */
  displayDecimals: z.number().int().min(0).max(8).optional(),
  details: z.object({
    authorName: z.string().trim().max(200).default(""),
    projectNameNumber: z.string().trim().max(300).default(""),
    notes: z.string().trim().max(5000).default(""),
  }).optional(),
  inputs: z.array(geniusInputSchema).max(100).default([]),
  assumptions: z.array(geniusAssumptionSchema).max(100).default([]),
  steps: z.array(geniusStepSchema).max(100).default([]),
  results: z.array(geniusResultSchema).max(50).default([]),
  references: z.array(geniusReferenceSchema).max(100).default([]),
  confidence: geniusConfidenceSchema.default({ score: 70, explanation: "", factors: [] }),
  visualizations: z.array(geniusVisualizationSchema).max(20).default([]),
  expertSummary: z.string().max(4000).default(""),
  recommendations: z.array(z.string().max(500)).max(20).default([]),
  versions: z.array(z.object({ version: z.number(), date: z.string() })).max(500).default([]),
});

// ── Strict doc schema (AI output only) ───────────────────────────────────────
// Reuses every field from the lenient sub-schemas but overrides the symbol
// fields with geniusSymbolStrict / geniusSymbolStrictOptional so new AI
// output is validated against the "10 chars, valid identifier" contract.
// Routes and DB reads continue to use geniusCalculationDocSchema (lenient).
const geniusInputSchemaStrict = geniusInputSchema.extend({ symbol: geniusSymbolStrict });
const geniusAssumptionSchemaStrict = geniusAssumptionSchema.extend({ symbol: geniusSymbolStrictOptional });
const geniusStepSchemaStrict = geniusStepSchema.extend({ symbol: geniusSymbolStrictOptional });
const geniusResultSchemaStrict = geniusResultSchema.extend({ symbol: geniusSymbolStrictOptional });

export const geniusCalculationDocSchemaStrict = geniusCalculationDocSchema.extend({
  inputs: z.array(geniusInputSchemaStrict).max(100).default([]),
  assumptions: z.array(geniusAssumptionSchemaStrict).max(100).default([]),
  steps: z.array(geniusStepSchemaStrict).max(100).default([]),
  results: z.array(geniusResultSchemaStrict).max(50).default([]),
});

export type GeniusInput = z.infer<typeof geniusInputSchema>;
export type GeniusAssumption = z.infer<typeof geniusAssumptionSchema>;
export type GeniusStep = z.infer<typeof geniusStepSchema>;
export type GeniusResult = z.infer<typeof geniusResultSchema>;
export type GeniusReference = z.infer<typeof geniusReferenceSchema>;
export type GeniusConfidence = z.infer<typeof geniusConfidenceSchema>;
export type GeniusVisualization = z.infer<typeof geniusVisualizationSchema>;
export type GeniusCalculationDoc = z.infer<typeof geniusCalculationDocSchema>;

// A file the user attached in the Genius chat (image or PDF).
export const geniusAttachmentSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(["image", "pdf"]),
  name: z.string().max(300),
  url: z.string().max(1000),
  mimeType: z.string().max(100),
  size: z.number(),
});

// A reviewable "calculation task" the assistant proposes after reading an
// uploaded document — the user edits/approves it before the full calculation
// is built.
export const geniusTaskProposalSchema = z.object({
  title: z.string().max(300).default("Proposed calculation"),
  understanding: z.string().max(4000).default(""),
  problem: z.string().max(4000).default(""),
  inputs: z
    .array(
      z.object({
        label: z.string().max(200),
        value: z.string().max(120).default(""),
        unit: z.string().max(64).default(""),
      }),
    )
    .max(50)
    .default([]),
  assumptions: z.array(z.string().max(500)).max(50).default([]),
  approach: z.string().max(4000).default(""),
});

export type GeniusAttachment = z.infer<typeof geniusAttachmentSchema>;
export type GeniusTaskProposal = z.infer<typeof geniusTaskProposalSchema>;

// Short AI-generated assistant commentary carried alongside a calculation
// response (generate / message / recalc / proposal-build). It interprets the
// server-recomputed numbers — it never introduces new ones — and degrades to
// a plain factual summary when the commentary pass fails.
export const geniusCommentarySchema = z.string().max(4000);
export type GeniusCommentary = z.infer<typeof geniusCommentarySchema>;

export const insertGeniusCalculationSchema = createInsertSchema(geniusCalculations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGeniusCalculation = z.infer<typeof insertGeniusCalculationSchema>;
export type GeniusCalculation = typeof geniusCalculations.$inferSelect;


export type GeniusCalculationVersion = typeof geniusCalculationVersions.$inferSelect;

export type GeniusStepCommentRow = typeof geniusStepComments.$inferSelect;
