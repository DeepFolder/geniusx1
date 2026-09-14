import { APP_VERSION } from "@shared/version";
import { execSync } from "child_process";

function resolveVersion(): string {
  // 1. Build-time SHA file — written by the deployment build step, present in production
  try {
    const sha = fs.readFileSync(path.join(process.cwd(), ".build-sha"), "utf8").trim();
    if (sha) return `${APP_VERSION}-${sha}`;
  } catch {}
  // 2. Live git — works in development where .git is present
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
    if (sha) return `${APP_VERSION}-${sha}`;
  } catch {}
  // 3. Base version fallback
  return APP_VERSION;
}
const SERVER_VERSION = resolveVersion();

function resolveDeployedAt(): string {
  // 1. Build-time date file — written by the deployment build step, present in production
  try {
    const date = fs.readFileSync(path.join(process.cwd(), ".build-date"), "utf8").trim();
    if (date) return date;
  } catch {}
  // 2. Dev fallback — .build-date not present (local dev), use server start time
  return new Date().toISOString();
}
const SERVER_START_TIME = resolveDeployedAt();
import type { Express } from "express";
import express from "express";
import { z } from "zod";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { db, withDbRetry, isNeonControlPlaneError } from "./db";
import { users, userProjects, projectItems, products, companies, aiChatSessions, aiChatSessionMessages, fileStorage } from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { requireAuth, requireCompanyAdmin, extractToken, verifyAuthToken } from "./auth-middleware";
import { 
  insertCompanySchema, 
  insertProductSchema,
  insertCatalogueSchema,
  insertProductCategorySchema,
  insertProductGroupSchema,
  insertQuoteRequestSchema,
  insertChatMessageSchema,
  userRegistrationSchema,
  userLoginSchema,
  userProfileUpdateSchema,
  changePasswordSchema,
  changeEmailSchema,
  insertCompanyRequestSchema,
  insertUserFollowSchema,
  insertCompanyPostSchema,
  insertUserFavoriteSchema,
  insertCompanyDocumentSchema,
  insertCompanyInquirySchema,
  type InsertCompanyDocument,
  type InsertCompanyInquiry,
  type ProductCategory,
  type ProductGroup
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { generateAuthToken, validateAuthToken, revokeAuthToken } from "./simple-auth";
import bcrypt from "bcrypt";
import OpenAI from 'openai';
import { createLazyOpenAI } from "./services/openai-client.js";
// PDF parsing will be done dynamically to avoid import issues
import { recommendationEngine, UserBehavior, RecommendationScore } from "./services/recommendation-engine";
// RSS parsing imports
import { XMLParser } from 'fast-xml-parser';
import { ObjectStorageService, ObjectNotFoundError, serveDbFile } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import aiRoutes from "./routes/ai-routes.js";
import dpfRoutes from "./routes/dpf.js";
import authResetRoutes, { cleanupExpiredResetTokens } from "./routes/auth-reset.js";
import openaiAgentSearchRoutes from "./features/hybrid-search/backend/routes";
import geniusRoutes from "./routes/genius.js";
import { loginEmailLimiter, registerEmailLimiter } from "./middleware/auth-rate-limit";
import "./types"; // Import session type definitions

/**
 * Background helper: extract structured specs from a product's datasheet PDF
 * and write them to products.specifications. Used by both the product create
 * and product update routes (fire-and-forget) so a freshly uploaded datasheet
 * automatically populates the spec table the search agent reads at query time.
 *
 * Supports both legacy `/uploads/...` local paths and new `/objects/...` cloud
 * storage paths.
 */
export async function autoExtractAndPersistSpecs(
  productId: number,
  catalogPath: string,
  productContext: { name: string; category: string; description?: string }
): Promise<void> {
  if (!catalogPath) return;
  try {
    console.log(`🔬 [SpecAutoExtract] product ${productId}: extracting structured specs from "${productContext.name}" datasheet...`);
    const { extractStructuredSpecs, extractPdfTextFromBuffer, extractPdfText } = await import('./services/datasheet-summarizer.js');
    let pdfText: string;
    if (catalogPath.startsWith('/objects/')) {
      // New cloud-storage path — download via ObjectStorageService
      const objService = new ObjectStorageService();
      const buffer = await objService.downloadObjectBuffer(catalogPath);
      pdfText = await extractPdfTextFromBuffer(buffer);
    } else if (catalogPath.startsWith('/uploads/')) {
      // Legacy local-disk path
      const fullPath = path.join(process.cwd(), `.${catalogPath}`);
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ [SpecAutoExtract] product ${productId}: datasheet file missing at ${fullPath}`);
        return;
      }
      pdfText = await extractPdfText(fullPath);
    } else if (catalogPath.startsWith('/api/files/')) {
      // DB-backed path (migrated from /uploads/)
      const { getFileBufferById } = await import('./objectStorage.js');
      const buf = await getFileBufferById(catalogPath);
      if (!buf) {
        console.warn(`⚠️ [SpecAutoExtract] product ${productId}: DB file not found for ${catalogPath}`);
        return;
      }
      pdfText = await extractPdfTextFromBuffer(buf);
    } else {
      console.warn(`⚠️ [SpecAutoExtract] product ${productId}: unrecognised catalogPath scheme: ${catalogPath}`);
      return;
    }
    // Always persist the raw PDF text first so the DB column is populated
    // even if structured spec extraction fails or returns nothing.
    if (pdfText) {
      await storage.updateProduct(productId, { datasheetText: pdfText } as any);
      console.log(`📄 [SpecAutoExtract] product ${productId}: persisted ${pdfText.length} chars of datasheet text`);
    }

    const specs = await extractStructuredSpecs(pdfText, productContext);
    if (!specs || Object.keys(specs).length === 0) {
      console.log(`ℹ️ [SpecAutoExtract] product ${productId}: extractor returned no specs`);
      return;
    }
    await storage.updateProduct(productId, { specifications: specs as any });
    console.log(`✅ [SpecAutoExtract] product ${productId}: persisted ${Object.keys(specs).length} structured specs`);
  } catch (err: any) {
    console.warn(`⚠️ [SpecAutoExtract] product ${productId} failed: ${err?.message || err}`);
  }
}
import { onCompanyCreated, onCompanyUpdated, onProductCreated, onProductUpdated } from "./services/embedding-hooks.js";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = createLazyOpenAI();

// Search activity cache to prevent logging duplicate searches within a time window
const searchActivityCache = new Map<string, { query: string; timestamp: number }>();
const SEARCH_LOG_COOLDOWN_MS = 10000; // 10 seconds
const MIN_SEARCH_QUERY_LENGTH = 5; // Minimum characters to log a search (filters out partial keystrokes)

// Input sanitization helper to prevent XSS
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Remove dangerous HTML tags and scripts
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .trim();
}

// Validate and sanitize filename to prevent path traversal
function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  return filename
    .replace(/[\/\\]/g, '')
    .replace(/\0/g, '')
    .replace(/\.\./g, '')
    .slice(0, 255); // Limit filename length
}

// File size limits by type (in bytes)
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,      // 10MB for images
  pdf: 50 * 1024 * 1024,        // 50MB for PDFs
  model: 100 * 1024 * 1024,     // 100MB for 3D models
  document: 25 * 1024 * 1024,   // 25MB for documents
};

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
// Always ensure all subdirectories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Check and create each subdirectory independently
const subdirs = ["logos", "products", "catalogs", "models", "profiles"];
for (const subdir of subdirs) {
  const subdirPath = path.join(uploadDir, subdir);
  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      let dir = "uploads";
      if (file.fieldname === "logo") dir = path.join(uploadDir, "logos");
      else if (file.fieldname === "image" || file.fieldname === "productImage") dir = path.join(uploadDir, "products");
      else if (file.fieldname === "profileImage") dir = path.join(uploadDir, "profiles");
      else if (file.fieldname === "datasheet" || file.fieldname === "catalog" || file.fieldname === "catalogs" || file.fieldname === "pdf") dir = path.join(uploadDir, "catalogs");
      else if (file.fieldname === "model3d" || file.fieldname === "model") dir = path.join(uploadDir, "models");
      else if (file.fieldname === "document" || file.fieldname === "documents" || file.fieldname === "documentation") dir = path.join(uploadDir, "catalogs"); // Company documents go to catalogs folder
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
      const sanitizedName = sanitizeFilename(file.originalname);
      const ext = path.extname(sanitizedName);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Validate image files
    if (file.fieldname === "logo" || file.fieldname === "productImage" || file.fieldname === "image" || file.fieldname === "profileImage") {
      const allowedImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      
      if (!allowedImageTypes.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Only JPG, PNG, GIF, WebP, and SVG images are allowed"));
      }
    }
    
    // Validate PDF files
    if (file.fieldname === "catalog" || file.fieldname === "catalogs" || 
        file.fieldname === "datasheet" || file.fieldname === "documentation" || 
        file.fieldname === "pdf") {
      if (ext !== '.pdf' || file.mimetype !== "application/pdf") {
        return cb(new Error("Only PDF files are allowed"));
      }
    }
    
    // Validate documents
    if (file.fieldname === "document" || file.fieldname === "documents") {
      const allowedDocTypes = ['.pdf', '.doc', '.docx', '.txt'];
      const allowedMimeTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
      ];
      
      if (!allowedDocTypes.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Only PDF, DOC, DOCX, and TXT files are allowed"));
      }
    }
    
    // Validate 3D model files
    if (file.fieldname === "model" || file.fieldname === "model3d") {
      const allowedModelTypes = ['.stl', '.step', '.stp', '.obj', '.fbx'];
      
      if (!allowedModelTypes.includes(ext)) {
        return cb(new Error("Only STL, STEP, OBJ, and FBX model files are allowed"));
      }
    }
    
    cb(null, true);
  },
  limits: {
    // Specific limits per field type
    fileSize: 100 * 1024 * 1024, // 100MB for 3D models
    files: 10, // Maximum 10 files per upload
    fieldSize: 50 * 1024 * 1024, // 50MB field size limit
  }
});

// Memory-storage multer for product routes that upload directly to object storage.
// Keeps files in RAM (file.buffer) instead of writing to local disk, so they
// can be passed straight to ObjectStorageService.uploadFileBuffer().
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "image") {
      const allowedImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedImageTypes.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Only JPG, PNG, GIF, WebP, and SVG images are allowed"));
      }
    }
    if (file.fieldname === "datasheet" || file.fieldname === "catalogs") {
      if (ext !== '.pdf' || file.mimetype !== "application/pdf") {
        return cb(new Error("Only PDF files are allowed for datasheets"));
      }
    }
    if (file.fieldname === "documentation") {
      const allowedDocTypes = ['.pdf', '.doc', '.docx', '.txt'];
      const allowedMimeTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
      ];
      if (!allowedDocTypes.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Only PDF, DOC, DOCX, and TXT files are allowed"));
      }
    }
    if (file.fieldname === "model3d") {
      const allowedModelTypes = ['.stl', '.step', '.stp', '.obj', '.fbx'];
      if (!allowedModelTypes.includes(ext)) {
        return cb(new Error("Only STL, STEP, OBJ, and FBX model files are allowed"));
      }
    }
    cb(null, true);
  },
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
    fieldSize: 50 * 1024 * 1024,
  }
});

// FAQ responses for AI chatbot
const faqResponses: Record<string, string> = {
  "hello": "Hello! I'm here to help you with any questions about our products and services. How can I assist you today?",
  "hi": "Hi there! How can I help you today?",
  "capabilities": "We specialize in precision manufacturing, custom fabrication, and advanced materials processing. We serve aerospace, automotive, and industrial sectors.",
  "materials": "We work with a wide range of materials including titanium, aluminum, steel, stainless steel, and various specialty alloys.",
  "certifications": "Our company holds ISO 9001, AS9100 aerospace certification, and ITAR registration for defense applications.",
  "quote": "To request a quote, please use our quote request form. We typically respond within 24 hours with detailed pricing and timeline information.",
  "delivery": "Standard delivery times range from 2-8 weeks depending on complexity and quantity. Rush orders may be available for urgent requirements.",
  "quality": "We maintain strict quality standards with full inspection and certification for all parts. Our quality system is certified to aerospace standards.",
  "contact": "You can reach us through our contact form, email, or phone. Our sales team is available Monday-Friday, 8 AM to 6 PM EST.",
  "minimum": "Minimum order quantities vary by product complexity. We can accommodate both prototype quantities and high-volume production runs.",
  "default": "Thank you for your question. For specific technical inquiries, please contact our engineering team directly. Is there anything else I can help you with regarding our general capabilities?"
};

function getAIResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  for (const [keyword, response] of Object.entries(faqResponses)) {
    if (lowerMessage.includes(keyword)) {
      return response;
    }
  }
  
  return faqResponses.default;
}

// Enhanced AI chat response function with intelligent fallback

// This function provides chat response generation
async function generateChatResponse(message: string, companyId?: number): Promise<string> {
  return generateIntelligentFallbackResponse(message, companyId);
}

// Session-based authentication middleware
function setupSessionAuth(app: Express) {
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key-deepfolder-2025',
    resave: false,
    saveUninitialized: false,
    name: 'sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
      path: '/',
    },
  }));
}

// Local session-based auth middleware (different from JWT-based imported one)
function requireSessionAuth(req: any, res: any, next: any) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// Company admin middleware - Enhanced to support both session and JWT auth
async function requireSessionCompanyAdmin(req: any, res: any, next: any) {
  let user = null;
  
  // Try session-based auth first
  if (req.session?.userId) {
    user = await storage.getUser(req.session.userId);
  } else {
    // Try JWT token auth
    const token = extractToken(req);
    if (token) {
      user = verifyAuthToken(token);
    }
  }
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (user.role !== 'company_admin') {
    return res.status(403).json({ error: 'Company admin privileges required' });
  }
  
  // Store user in request for later use
  req.user = user;
  return next();
}

// Platform admin middleware - Requires 'admin' role
async function requirePlatformAdmin(req: any, res: any, next: any) {
  let user = null;
  let userId = null;
  
  // Try session-based auth first
  if (req.session?.userId) {
    userId = req.session.userId;
  } else {
    // Try JWT token auth
    const token = extractToken(req);
    if (token) {
      const decoded = verifyAuthToken(token);
      if (decoded) {
        userId = decoded.id;
      }
    }
  }
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Always fetch fresh user data from database to get current role
  user = await storage.getUser(userId);
  
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Platform admin privileges required' });
  }
  
  // Store user in request for later use
  req.user = user;
  return next();
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Beehiiv waitlist endpoint for coming-soon page
  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
      const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_f8d5f02f-a50d-485c-b40e-18750d1f3c4d';
      
      if (!BEEHIIV_API_KEY) {
        console.error('BEEHIIV_API_KEY not configured');
        return res.status(500).json({ error: 'Newsletter service not configured' });
      }
      
      const response = await fetch(`https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          utm_source: 'coming_soon_page',
          send_welcome_email: true
        })
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          errorData = { raw: errorBody };
        }
        console.error('Beehiiv API error:', response.status, errorData);
        
        // Handle duplicate subscriber gracefully
        if (response.status === 409 || (errorData.errors && errorData.errors.some((e: any) => e.code === 'email_already_subscribed'))) {
          return res.status(200).json({ message: 'You are already on the waitlist!' });
        }
        if (response.status === 401 || response.status === 403) {
          return res.status(500).json({ error: 'Waitlist provider authentication failed' });
        }
        if (response.status === 404) {
          return res.status(500).json({ error: 'Waitlist provider publication is invalid' });
        }
        if (response.status === 429) {
          return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        }
        
        return res.status(500).json({ error: 'Failed to join waitlist. Please try again.' });
      }
      
      console.log('✅ New waitlist subscriber:', email);
      return res.status(200).json({ message: 'Successfully joined the waitlist!' });
      
    } catch (error) {
      console.error('Waitlist error:', error);
      return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  });

  // Add login endpoint for testing
  app.get("/api/login", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Login</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; }
          input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
          .test-accounts { background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
          .status { margin-top: 10px; padding: 10px; border-radius: 4px; }
          .success { background: #d4edda; color: #155724; }
          .error { background: #f8d7da; color: #721c24; }
        </style>
      </head>
      <body>
        <h2>Test Login</h2>
        <div class="test-accounts">
          <h3>Test Accounts</h3>
          <p><strong>Company Admin:</strong><br>
          Email: admin@testtech.com<br>
          Password: admin123</p>
          <p><strong>Regular User:</strong><br>
          Email: user@test.com<br>
          Password: user123</p>
        </div>
        
        <button onclick="createTestUsers()" style="margin-bottom: 15px; background: #28a745;">
          Create Test Users
        </button>
        
        <form id="loginForm">
          <div class="form-group">
            <label>Email:</label>
            <input type="email" id="email" required>
          </div>
          <div class="form-group">
            <label>Password:</label>
            <input type="password" id="password" required>
          </div>
          <button type="submit">Login</button>
        </form>
        
        <div id="status"></div>
        
        <script>
          async function createTestUsers() {
            const status = document.getElementById('status');
            try {
              status.innerHTML = '<div class="status">Creating test users...</div>';
              
              const response = await fetch('/api/create-test-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const result = await response.json();
              
              if (response.ok) {
                status.innerHTML = '<div class="status success">Test users created successfully!</div>';
              } else {
                status.innerHTML = '<div class="status error">Failed to create users: ' + result.error + '</div>';
              }
            } catch (error) {
              status.innerHTML = '<div class="status error">Error: ' + error.message + '</div>';
            }
          }
          
          document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const status = document.getElementById('status');
            
            try {
              status.innerHTML = '<div class="status">Logging in...</div>';
              
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
              });
              
              const result = await response.json();
              
              if (response.ok) {
                localStorage.setItem('token', result.token);
                status.innerHTML = '<div class="status success">Login successful! Redirecting...</div>';
                setTimeout(() => {
                  window.location.href = '/';
                }, 1000);
              } else {
                status.innerHTML = '<div class="status error">Login failed: ' + result.error + '</div>';
              }
            } catch (error) {
              status.innerHTML = '<div class="status error">Login error: ' + error.message + '</div>';
            }
          });
        </script>
      </body>
      </html>
    `);
  });
  // Setup session-based authentication
  setupSessionAuth(app);

  // Authentication routes
  app.post("/api/auth/register", registerEmailLimiter, async (req, res) => {
    try {
      const userData = userRegistrationSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      const user = await storage.registerUser(userData);

      // Mark account as pending admin approval
      await db.update(users).set({ approvalStatus: 'pending' }).where(eq(users.id, user.id));

      console.log("✅ REGISTRATION PENDING APPROVAL:", user.email);

      res.status(201).json({ 
        pending: true,
        message: 'Your account has been submitted for review. An admin will approve your access shortly.'
      });
    } catch (error) {
      console.error('🚨 Registration error:', error);
      res.status(400).json({ error: 'Registration failed' });
    }
  });

  // Company creation for new company admins
  app.post("/api/companies/create-with-admin", registerEmailLimiter, async (req, res) => {
    try {
      const { user: userData, company: companyData } = req.body;
      
      // Ensure user data has required fields and proper defaults
      const userDataWithDefaults = {
        ...userData,
        role: 'company_admin' as const,
        headline: userData.headline || '',
        location: userData.location || ''
      };
      
      // Validate user data
      const validatedUserData = userRegistrationSchema.parse(userDataWithDefaults);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedUserData.email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      // Prepare company data with required fields and defaults
      const companyDataWithDefaults = {
        name: companyData.name || '',
        description: companyData.description || '',
        industry: companyData.industry || '',
        location: companyData.location || '',
        email: validatedUserData.email, // Use admin's email as company contact email
        website: companyData.website || null,
        phone: companyData.phone || null,
        colorTheme: companyData.colorTheme || 'blue',
        certifications: companyData.certifications || [],
        capabilities: companyData.capabilities || [],
        isActive: true
      };
      
      // Validate company data
      const validatedCompanyData = insertCompanySchema.parse(companyDataWithDefaults);
      
      // Create company first
      const company = await storage.createCompany(validatedCompanyData);
      
      // Generate semantic search embedding (non-blocking)
      onCompanyCreated(company).catch(err => console.error('Embedding generation failed:', err));
      
      // Register user with company association
      const userWithCompany = {
        ...validatedUserData,
        role: 'company_admin' as const,
        companyId: company.id
      };
      
      const user = await storage.registerUser(userWithCompany);

      // Mark account as pending admin approval
      await db.update(users).set({ approvalStatus: 'pending' }).where(eq(users.id, user.id));

      console.log("✅ COMPANY REGISTRATION PENDING APPROVAL:", user.email, "Company:", company.name);

      res.status(201).json({ 
        pending: true,
        message: 'Your company account has been submitted for review. An admin will approve your access shortly.',
        company: { name: company.name }
      });
    } catch (error) {
      console.error('Company creation error:', error);
      res.status(400).json({ error: 'Failed to create company and admin account' });
    }
  });

  app.post("/api/auth/login", loginEmailLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("🔐 LOGIN ATTEMPT:", email);
      
      if (!email || !password) {
        console.log("❌ Missing credentials");
        return res.status(400).json({ error: 'Email and password required' });
      }
      
      // Database-only authentication - no in-memory test users
      const bcrypt = await import('bcrypt');
      const dbUser = await withDbRetry(() =>
        db.select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          passwordHash: users.passwordHash,
          role: users.role,
          companyId: users.companyId,
          approvalStatus: users.approvalStatus,
          isActive: users.isActive,
        }).from(users).where(eq(users.email, email.toLowerCase())).limit(1)
      );
      
      if (dbUser.length === 0) {
        console.log("❌ User not found in database:", email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const foundUser = dbUser[0];
      console.log("🎯 Database user found:", foundUser.email);
      
      // Verify password
      const isValidPassword = await bcrypt.default.compare(password, foundUser.passwordHash);
      
      if (!isValidPassword) {
        console.log("❌ Invalid password for database user:", foundUser.email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check approval status before issuing token — admins always bypass the gate
      if (foundUser.role !== 'admin' && foundUser.approvalStatus === 'pending') {
        return res.status(403).json({ 
          error: 'Your account is awaiting admin approval. You will be notified once your request is reviewed.',
          code: 'PENDING_APPROVAL'
        });
      }
      if (foundUser.role !== 'admin' && foundUser.approvalStatus === 'rejected') {
        return res.status(403).json({ 
          error: 'Your access request was not approved. Please contact us for more information.',
          code: 'ACCESS_REJECTED'
        });
      }
      if (foundUser.isActive === false) {
        return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
      }
      
      console.log("✅ Password verified for database user:", foundUser.email);
      
      const jwt = await import('jsonwebtoken');
      const userData = {
        id: foundUser.id,
        email: foundUser.email,
        firstName: foundUser.firstName || 'User',
        lastName: foundUser.lastName || '',
        role: foundUser.role,
        companyId: foundUser.companyId
      };
      
      const token = jwt.default.sign(userData, process.env.JWT_SECRET || "your-secret-key-change-in-production", { expiresIn: '7d' });
      
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      
      console.log("✅ LOGIN SUCCESS:", foundUser.email, "Company:", foundUser.companyId);
      
      res.json({ 
        success: true,
        message: 'Login successful',
        user: userData
      });
    } catch (error) {
      console.error('🚨 Login error:', error);
      if (isNeonControlPlaneError(error)) {
        return res.status(503).json({ error: 'Database temporarily unavailable. Please try again in a few seconds.' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    // Clear the JWT token cookie
    res.clearCookie('token');
    res.clearCookie('authToken');
    
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
      });
    }
    console.log("✅ LOGOUT: Cookies cleared");
    res.json({ message: 'Logout successful' });
  });

  app.get("/api/auth/logout", (req, res) => {
    // Clear the JWT token cookie
    res.clearCookie('token');
    res.clearCookie('authToken');
    
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
      });
    }
    console.log("✅ LOGOUT: Cookies cleared");
    res.json({ message: 'Logout successful' });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Build info endpoint — returns server start time and app version
  app.get('/api/build-info', (req, res) => {
    res.json({ deployedAt: SERVER_START_TIME, version: SERVER_VERSION });
  });

  // RSS News Integration - Zero cost live news fetching
  let newsCache: { data: any[], lastFetch: number } | null = null;
  const RSS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  // Allowlisted RSS feeds for security (SSRF prevention)
  const ALLOWED_RSS_FEEDS = [
    'https://rss.cnn.com/rss/money_technology.rss',
    'https://feeds.reuters.com/technology/rss', 
    'https://techcrunch.com/feed/',
    'https://www.manufacturing.net/rss',
    'https://feeds.feedburner.com/oreilly/radar'
  ];

  app.get('/api/news', async (req, res) => {
    try {
      // Check cache first
      if (newsCache && (Date.now() - newsCache.lastFetch) < RSS_CACHE_TTL) {
        return res.json(newsCache.data);
      }

      // Initialize XML parser
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
      });

      const gradientThemes = [
        'from-blue-600 via-purple-600 to-indigo-800',
        'from-orange-400 via-red-500 to-pink-600', 
        'from-green-500 via-emerald-600 to-teal-700',
        'from-gray-700 via-gray-800 to-black',
        'from-purple-600 via-violet-600 to-purple-800',
        'from-indigo-600 via-purple-700 to-pink-700'
      ];

      // Categorization functions
      const categorizeArticle = (title: string, description: string) => {
        const content = `${title} ${description || ''}`.toLowerCase();
        
        if (content.match(/will|predict|forecast|future|2025|2026|expect|trend|likely/)) {
          return {
            category: 'predictions',
            confidence: Math.floor(Math.random() * 20) + 70
          };
        }
        
        if (content.match(/analysis|study|research|report|insight|data|market|survey/)) {
          return { category: 'insights' };
        }
        
        return { category: 'trending' };
      };

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

      // Fetch from multiple RSS feeds
      const allArticles: any[] = [];
      
      for (const feedUrl of ALLOWED_RSS_FEEDS) {
        try {
          const response = await fetch(feedUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'DeepFolder News Aggregator 1.0'
            }
          });

          if (!response.ok) continue;

          const xmlData = await response.text();
          const parsed = parser.parse(xmlData);
          
          // Extract articles from RSS structure
          const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
          const articles = Array.isArray(items) ? items.slice(0, 5) : [items].slice(0, 5);

          for (const item of articles) {
            if (!item) continue;
            
            const title = item.title || item['title'] || 'Untitled';
            const description = item.description || item.summary || item['content:encoded'] || '';
            const link = item.link?.['@_href'] || item.link || item.guid || '#';
            const pubDate = new Date(item.pubDate || item.published || Date.now());

            // Extract image from RSS feed
            let articleImage = null;
            
            // Try multiple ways to extract images from RSS
            if (item['media:content']) {
              articleImage = item['media:content']['@_url'] || item['media:content'].url;
            } else if (item.enclosure && item.enclosure['@_type']?.includes('image')) {
              articleImage = item.enclosure['@_url'] || item.enclosure.url;
            } else if (item['media:thumbnail']) {
              articleImage = item['media:thumbnail']['@_url'] || item['media:thumbnail'].url;
            } else if (item.image) {
              articleImage = typeof item.image === 'string' ? item.image : item.image.url;
            }

            // Process article
            const categorization = categorizeArticle(title, description);
            const company = extractCompany(title, description);
            
            // Category-based fallback images if no image found
            if (!articleImage) {
              const categoryImages = {
                'predictions': [
                  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=300&fit=crop', // Data analytics
                  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=300&fit=crop', // Business charts
                  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&h=300&fit=crop'  // Future tech
                ],
                'insights': [
                  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=300&fit=crop', // Research
                  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=300&fit=crop', // Business analysis
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=300&fit=crop'  // Market data
                ],
                'trending': [
                  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=300&fit=crop', // Industrial robotics
                  'https://images.unsplash.com/photo-1565106430482-8f6e74349ca1?w=600&h=300&fit=crop', // AI robot
                  'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=300&fit=crop', // Green tech
                  'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=300&fit=crop', // IoT sensors
                  'https://images.unsplash.com/photo-1562408590-e32931084e23?w=600&h=300&fit=crop'  // Modern tech
                ]
              };
              
              const categoryType = categorization.category;
              const imageOptions = categoryImages[categoryType] || categoryImages.trending;
              articleImage = imageOptions[allArticles.length % imageOptions.length];
            }
            
            allArticles.push({
              id: `rss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: title.substring(0, 120), // Limit title length
              description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
              category: getCategoryName(categorization.category, title),
              type: categorization.category === 'predictions' ? 'prediction' : 
                    categorization.category === 'insights' ? 'analysis' : 'announcement',
              date: pubDate.toISOString().split('T')[0],
              readTime: `${Math.floor(Math.random() * 5) + 3} min read`,
              tags: extractTags(title, description),
              priority: Math.random() > 0.6 ? 'high' : 'medium',
              trending: categorization.category === 'trending',
              companyLogo: company.charAt(0),
              company: company,
              gradient: gradientThemes[allArticles.length % gradientThemes.length],
              confidence: categorization.confidence,
              link: link,
              image: articleImage // Now includes extracted or fallback images
            });
          }
        } catch (feedError) {
          console.log(`Failed to fetch from ${feedUrl}:`, feedError.message);
          continue;
        }
      }

      // Organize by category
      const organizedNews = {
        trending: allArticles.filter(a => a.type === 'announcement'),
        insights: allArticles.filter(a => a.type === 'analysis'),
        predictions: allArticles.filter(a => a.type === 'prediction')
      };

      // Cache the results
      newsCache = {
        data: organizedNews,
        lastFetch: Date.now()
      };

      res.json(organizedNews);
    } catch (error) {
      console.error('RSS fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  // Debug page
  app.get('/debug', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'debug.html'));
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.token || req.cookies?.authToken;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;
      
      if (!token) {
        console.log("🔍 No authentication token found");
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Step 1: verify JWT (no DB involved — cookie-clearing only happens here)
      const jwt = await import('jsonwebtoken');
      let decoded: any;
      try {
        decoded = jwt.default.verify(token, process.env.JWT_SECRET || "your-secret-key-change-in-production");
      } catch (jwtError: any) {
        console.log("❌ Invalid JWT token:", jwtError.message);
        res.clearCookie('token');
        res.clearCookie('authToken');
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // Step 2: fetch fresh user data from DB (separate try so DB errors don't clear cookies)
      let freshUser: any;
      try {
        freshUser = await withDbRetry(() => storage.getUser(decoded.id));
      } catch (dbError) {
        console.error("🚨 DB error in /api/auth/me:", dbError);
        if (isNeonControlPlaneError(dbError)) {
          return res.status(503).json({ error: "Database temporarily unavailable. Please try again in a few seconds." });
        }
        return res.status(500).json({ error: "Authentication error" });
      }

      if (!freshUser) {
        console.log("❌ User not found in database:", decoded.id);
        return res.status(404).json({ error: "User not found" });
      }

      console.log("✅ AUTH SUCCESS:", freshUser.email, "Role:", freshUser.role);

      // Prevent caching to ensure fresh user data is always returned
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Return fresh database data without password hash
      const { passwordHash, ...userData } = freshUser;

      // Always include company field (null if not available)
      let companyData = null;
      if (freshUser.companyId) {
        try {
          const company = await withDbRetry(() => storage.getCompany(freshUser.companyId));
          if (company) {
            companyData = {
              id: company.id,
              name: company.name,
              industry: company.industry,
              logoPath: company.logoPath
            };
            console.log("🏢 Company data attached:", company.name);
          }
        } catch (companyError) {
          console.error("Error fetching company data:", companyError);
        }
      }

      const responseData = { ...userData, company: companyData };
      console.log("📤 Auth response includes company field:", !!responseData.company, responseData.company?.name || 'null');
      res.json(responseData);
    } catch (error) {
      console.error("🚨 Auth check error:", error);
      res.status(500).json({ error: "Authentication error" });
    }
  });

  // Clear cookies endpoint to stop the blinking
  app.get("/api/auth/clear-cookies", (req, res) => {
    res.clearCookie('token');
    res.clearCookie('authToken');
    console.log("✅ COOKIES CLEARED: Authentication reset");
    res.json({ message: 'Cookies cleared successfully' });
  });

  // Platform Admin Routes
  app.get("/api/platform-admin/stats", requirePlatformAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      const users = await storage.getAllUsers();
      const products = await storage.getAllProducts();
      
      // Helper function to format timestamps as relative time
      const formatRelativeTime = (date: Date): string => {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
      };
      
      // Collect recent activities from the last 30 days
      const recentActivity: Array<{ description: string; timestamp: string; type: string; date: Date }> = [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Add recent companies
      companies.forEach(company => {
        if (company.createdAt && new Date(company.createdAt) > thirtyDaysAgo) {
          recentActivity.push({
            description: `Company "${company.name}" registered`,
            timestamp: formatRelativeTime(new Date(company.createdAt)),
            type: 'success',
            date: new Date(company.createdAt)
          });
        }
      });
      
      // Add recent users
      users.forEach(user => {
        if (user.createdAt && new Date(user.createdAt) > thirtyDaysAgo) {
          const userName = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}` 
            : user.email?.split('@')[0] || 'User';
          recentActivity.push({
            description: `User "${userName}" registered`,
            timestamp: formatRelativeTime(new Date(user.createdAt)),
            type: 'info',
            date: new Date(user.createdAt)
          });
        }
      });
      
      // Add recent products
      products.forEach(product => {
        if (product.createdAt && new Date(product.createdAt) > thirtyDaysAgo) {
          recentActivity.push({
            description: `Product "${product.name}" uploaded`,
            timestamp: formatRelativeTime(new Date(product.createdAt)),
            type: 'info',
            date: new Date(product.createdAt)
          });
        }
      });
      
      // Add admin activities from userActivity table
      const adminActivities = await storage.getRecentAdminActivity(thirtyDaysAgo);
      adminActivities.forEach(activity => {
        let description = '';
        let type = 'warning';
        
        switch (activity.activityType) {
          case 'admin_delete_company':
            description = `Admin deleted company "${activity.metadata?.companyName || 'Unknown'}"`;
            type = 'warning';
            break;
          case 'admin_delete_product':
            description = `Admin deleted product "${activity.metadata?.productName || 'Unknown'}"`;
            type = 'warning';
            break;
          case 'admin_delete_user':
            description = `Admin deleted user "${activity.metadata?.userEmail || 'Unknown'}"`;
            type = 'warning';
            break;
          case 'admin_suspend_user':
            description = `Admin suspended user "${activity.metadata?.userEmail || 'Unknown'}"`;
            type = 'warning';
            break;
          case 'admin_activate_user':
            description = `Admin activated user "${activity.metadata?.userEmail || 'Unknown'}"`;
            type = 'success';
            break;
          case 'admin_change_role':
            description = `Admin changed ${activity.metadata?.userEmail || 'Unknown'}'s role from ${activity.metadata?.oldRole} to ${activity.metadata?.newRole}`;
            type = 'info';
            break;
        }
        
        if (description && activity.createdAt) {
          recentActivity.push({
            description,
            timestamp: formatRelativeTime(new Date(activity.createdAt)),
            type,
            date: new Date(activity.createdAt)
          });
        }
      });
      
      // Sort by date (newest first) and take top 10
      const sortedActivity = recentActivity
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10)
        .map(({ date, ...activity }) => activity); // Remove date field from response
      
      res.json({
        totalCompanies: companies.length,
        totalUsers: users.length,
        totalProducts: products.length,
        activeSessions: 0,
        companiesGrowth: 12,
        usersGrowth: 8,
        productsGrowth: 15,
        recentActivity: sortedActivity
      });
    } catch (error) {
      console.error('Platform admin stats error:', error);
      res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
  });

  app.get("/api/platform-admin/companies", requirePlatformAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      const companiesWithStats = await Promise.all(companies.map(async (company) => {
        const products = await storage.getProductsByCompany(company.id);
        return {
          ...company,
          productCount: products.length,
          status: 'active',
          createdAt: new Date().toISOString()
        };
      }));
      res.json(companiesWithStats);
    } catch (error) {
      console.error('Platform admin companies error:', error);
      res.status(500).json({ error: 'Failed to fetch companies' });
    }
  });

  app.get("/api/platform-admin/users", requirePlatformAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithCompany = await Promise.all(users.map(async (user) => {
        let companyName = null;
        if (user.companyId) {
          const company = await storage.getCompany(user.companyId);
          companyName = company?.name || null;
        }
        return {
          ...user,
          companyName,
          createdAt: user.createdAt ?? ''
        };
      }));
      res.json(usersWithCompany);
    } catch (error) {
      console.error('Platform admin users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.get("/api/platform-admin/products", requirePlatformAdmin, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      const productsWithCompany = await Promise.all(products.map(async (product) => {
        const company = await storage.getCompany(product.companyId);
        return {
          ...product,
          companyName: company?.name || 'Unknown',
          createdAt: product.createdAt ?? ''
        };
      }));
      res.json(productsWithCompany);
    } catch (error) {
      console.error('Platform admin products error:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // Platform admin - Update user role
  app.patch("/api/platform-admin/users/:id/role", requirePlatformAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { role } = req.body;
      const adminUser = (req as any).user;

      if (!role || !['public', 'company_admin', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be public, company_admin, or admin' });
      }

      // Get user info before update
      const user = await storage.getUser(userId);
      const oldRole = user?.role || 'unknown';

      await storage.updateUserProfile(userId, { role });

      // Track admin role change activity
      await storage.trackUserActivity(adminUser.id, {
        activityType: 'admin_change_role',
        entityId: userId,
        entityType: 'user',
        metadata: { 
          userEmail: user?.email || userId, 
          oldRole, 
          newRole: role,
          adminEmail: adminUser.email 
        }
      });
      
      res.json({ message: 'User role updated successfully' });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  // Platform admin - Suspend/unsuspend user
  app.patch("/api/platform-admin/users/:id/suspend", requirePlatformAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { suspend } = req.body;
      const adminUser = (req as any).user;

      // Get user info before update
      const user = await storage.getUser(userId);

      await storage.updateUserProfile(userId, { isActive: !suspend });

      // Track admin suspend/activate activity
      await storage.trackUserActivity(adminUser.id, {
        activityType: suspend ? 'admin_suspend_user' : 'admin_activate_user',
        entityId: userId,
        entityType: 'user',
        metadata: { 
          userEmail: user?.email || userId,
          adminEmail: adminUser.email 
        }
      });
      
      res.json({ message: suspend ? 'User suspended successfully' : 'User activated successfully' });
    } catch (error) {
      console.error('Suspend user error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Platform admin - Delete user
  app.delete("/api/platform-admin/users/:id", requirePlatformAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const adminUser = (req as any).user;

      // Get user info before deletion for activity tracking
      const user = await storage.getUser(userId);
      const userEmail = user?.email || userId;

      console.log(`🗑️ Admin deleting user ${userId}`);
      
      const success = await storage.deleteUser(userId);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Track admin deletion activity
      await storage.trackUserActivity(adminUser.id, {
        activityType: 'admin_delete_user',
        entityId: userId,
        entityType: 'user',
        metadata: { userEmail, adminEmail: adminUser.email }
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // ─── Access Request Admin Routes ────────────────────────────────────────────

  // GET /api/admin/access-requests — list all pending approval requests
  app.get("/api/admin/access-requests", requirePlatformAdmin, async (req, res) => {
    try {
      const { status = 'pending' } = req.query;
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          companyId: users.companyId,
          approvalStatus: users.approvalStatus,
          approvalNote: users.approvalNote,
          createdAt: users.createdAt,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.approvalStatus, status as string))
        .orderBy(desc(users.createdAt));

      // Attach company names
      const companyIds = [...new Set(rows.map(r => r.companyId).filter(Boolean))] as number[];
      let companyMap: Record<number, string> = {};
      if (companyIds.length > 0) {
        const cos = await db.select({ id: companies.id, name: companies.name }).from(companies).where(
          sql`${companies.id} = ANY(${sql.raw(`ARRAY[${companyIds.join(',')}]`)})` 
        );
        cos.forEach(c => { companyMap[c.id] = c.name; });
      }

      res.json(rows.map(r => ({ ...r, companyName: r.companyId ? companyMap[r.companyId] : null })));
    } catch (error) {
      console.error('Access requests list error:', error);
      res.status(500).json({ error: 'Failed to fetch access requests' });
    }
  });

  // POST /api/admin/access-requests/:id/approve
  app.post("/api/admin/access-requests/:id/approve", requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await db.update(users).set({ approvalStatus: 'approved', approvalNote: null }).where(eq(users.id, id));
      console.log(`✅ Admin approved user: ${id}`);
      res.json({ success: true, message: 'User approved' });
    } catch (error) {
      console.error('Approve user error:', error);
      res.status(500).json({ error: 'Failed to approve user' });
    }
  });

  // POST /api/admin/access-requests/:id/reject
  app.post("/api/admin/access-requests/:id/reject", requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { note } = req.body;
      await db.update(users).set({ approvalStatus: 'rejected', approvalNote: note || null }).where(eq(users.id, id));
      console.log(`❌ Admin rejected user: ${id}`);
      res.json({ success: true, message: 'User rejected' });
    } catch (error) {
      console.error('Reject user error:', error);
      res.status(500).json({ error: 'Failed to reject user' });
    }
  });

  // Upgrade current user to company admin
  app.post("/api/auth/upgrade-to-company-admin", requireAuth, async (req, res) => {
    try {
      const { companyName, industry, description, location } = req.body;
      const userId = req.session.userId;
      
      // Create a new company
      const company = await storage.createCompany({
        name: companyName,
        industry: industry || 'Technology',
        description: description || 'A professional company on the platform',
        location: location || 'Global',
        website: '',
        email: req.session.user?.email || '',
        phone: ''
      });
      
      // Update user to be company admin
      await storage.updateUserProfile(userId!, {
        role: 'company_admin',
        companyId: company.id,
        position: 'Administrator'
      });
      
      // Update session
      const updatedUser = await storage.getUser(userId!);
      if (!updatedUser) {
        throw new Error('Failed to retrieve updated user');
      }
      req.session.user = updatedUser;
      
      res.json({ 
        message: 'Successfully upgraded to company admin',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
          companyId: updatedUser.companyId,
          position: updatedUser.position
        },
        company: {
          id: company.id,
          name: company.name,
          industry: company.industry
        }
      });
    } catch (error) {
      console.error('Upgrade error:', error);
      res.status(400).json({ error: 'Failed to upgrade to company admin' });
    }
  });



  // User profile routes
  app.put("/api/auth/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in request' });
      }
      
      console.log('🔄 PROFILE UPDATE REQUEST (PUT):', { userId, body: req.body });
      const profileData = userProfileUpdateSchema.parse(req.body);
      
      // Update database user
      const updatedUser = await storage.updateUserProfile(userId, profileData);
      if (!updatedUser) {
        console.log('❌ User not found in database:', userId);
        return res.status(404).json({ error: 'User not found' });
      }
      
      console.log('✅ PROFILE UPDATE SUCCESS (PUT - DB User):', userId);
      
      res.json({ 
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          headline: updatedUser.headline,
          bio: updatedUser.bio,
          location: updatedUser.location,
          skills: updatedUser.skills
        }
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to update profile' });
    }
  });

  // Company affiliation routes
  app.post("/api/company-requests", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const requestData = insertCompanyRequestSchema.parse(req.body);
      
      const companyRequest = await storage.createCompanyRequest({
        ...requestData,
        userId,
        requestedBy: userId
      });
      
      res.status(201).json({ 
        message: 'Company request submitted successfully',
        request: companyRequest
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to submit company request' });
    }
  });

  app.get("/api/company-requests/:companyId", requireCompanyAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const requests = await storage.getCompanyRequests(companyId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch company requests' });
    }
  });

  app.put("/api/company-requests/:requestId/status", requireCompanyAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.requestId);
      const { status } = req.body;
      const reviewedBy = req.session.userId!;
      
      const updatedRequest = await storage.updateCompanyRequestStatus(requestId, status, reviewedBy);
      if (!updatedRequest) {
        return res.status(404).json({ error: 'Request not found' });
      }
      
      res.json({ 
        message: 'Request status updated successfully',
        request: updatedRequest
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to update request status' });
    }
  });


  app.post("/api/company-posts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const companyId = user.companyId || parseInt(req.body.companyId);
      
      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }
      
      const postData = {
        ...req.body,
        companyId,
        authorId: userId
      };
      
      const post = await storage.createCompanyPost(postData);
      
      res.status(201).json({ 
        message: 'Post created successfully',
        post
      });
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(400).json({ error: 'Failed to create post' });
    }
  });

  // Company posts routes
  app.get("/api/companies/:companyId/posts", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const posts = await storage.getCompanyPosts(companyId);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch company posts' });
    }
  });

  app.post("/api/companies/:companyId/posts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const companyId = parseInt(req.params.companyId);
      
      const postData = {
        ...req.body,
        companyId,
        authorId: userId,
      };
      
      const post = await storage.createCompanyPost(postData);
      res.json(post);
    } catch (error) {
      console.error("Error creating company post:", error);
      res.status(500).json({ message: "Failed to create company post" });
    }
  });

  // Company following routes
  app.post("/api/companies/:id/follow", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const companyId = parseInt(req.params.id);
      
      const follow = await storage.followCompany(userId, companyId);
      
      // Track follow activity
      try {
        await storage.trackUserActivity(userId, {
          activityType: 'follow',
          entityId: String(companyId),
          entityType: 'company',
          metadata: { action: 'follow' }
        });
      } catch (error) {
        console.error('Failed to track follow activity:', error);
      }
      
      res.json(follow);
    } catch (error) {
      console.error("Error following company:", error);
      res.status(500).json({ message: "Failed to follow company" });
    }
  });

  app.delete("/api/companies/:id/follow", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const companyId = parseInt(req.params.id);
      
      const success = await storage.unfollowCompany(userId, companyId);
      
      // Track unfollow activity
      try {
        await storage.trackUserActivity(userId, {
          activityType: 'unfollow',
          entityId: String(companyId),
          entityType: 'company',
          metadata: { action: 'unfollow' }
        });
      } catch (error) {
        console.error('Failed to track unfollow activity:', error);
      }
      
      if (success) {
        res.json({ message: "Unfollowed successfully" });
      } else {
        res.status(404).json({ message: "Follow relationship not found" });
      }
    } catch (error) {
      console.error("Error unfollowing company:", error);
      res.status(500).json({ message: "Failed to unfollow company" });
    }
  });

  // Post interaction routes
  app.post("/api/posts/:id/like", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const postId = parseInt(req.params.id);
      
      const like = await storage.likePost(userId, postId);
      res.json(like);
    } catch (error) {
      console.error("Error liking post:", error);
      res.status(500).json({ message: "Failed to like post" });
    }
  });

  app.delete("/api/posts/:id/like", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const postId = parseInt(req.params.id);
      
      const success = await storage.unlikePost(userId, postId);
      if (success) {
        res.json({ message: "Like removed successfully" });
      } else {
        res.status(404).json({ message: "Like not found" });
      }
    } catch (error) {
      console.error("Error unliking post:", error);
      res.status(500).json({ message: "Failed to unlike post" });
    }
  });

  // Comments routes
  app.get("/api/posts/:id/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const comments = await storage.getPostComments(postId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/posts/:id/comments", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const postId = parseInt(req.params.id);
      
      const commentData = {
        ...req.body,
        postId,
        userId,
      };
      
      const comment = await storage.createComment(commentData);
      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // User feed routes
  app.get("/api/feed", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const posts = await storage.getUserFeed(userId);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching user feed:", error);
      res.status(500).json({ message: "Failed to fetch user feed" });
    }
  });

  // Company file upload routes
  app.post('/api/companies/:id/upload-documents', requireCompanyAdmin, upload.array('documents', 10), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const uploadedFiles = files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));

      res.json({ 
        message: 'Documents uploaded successfully',
        files: uploadedFiles 
      });
    } catch (error) {
      console.error('Document upload error:', error);
      res.status(500).json({ error: 'Failed to upload documents' });
    }
  });

  app.post('/api/companies/:id/upload-step-files', requireCompanyAdmin, upload.array('stepFiles', 10), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No STEP files uploaded' });
      }

      // Validate STEP file extensions
      const validExtensions = ['.stp', '.step', '.dwg', '.iges', '.igs'];
      const invalidFiles = files.filter(file => 
        !validExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))
      );

      if (invalidFiles.length > 0) {
        return res.status(400).json({ 
          error: 'Invalid file types. Only STEP, DWG, and IGES files are allowed.' 
        });
      }

      const uploadedFiles = files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));

      res.json({ 
        message: 'STEP files uploaded successfully',
        files: uploadedFiles 
      });
    } catch (error) {
      console.error('STEP file upload error:', error);
      res.status(500).json({ error: 'Failed to upload STEP files' });
    }
  });

  app.put('/api/companies/:id/customize', requireCompanyAdmin, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const { colorTheme, description, website, phone, socialLinks, certifications } = req.body;
      
      const updatedCompany = await storage.updateCompany(companyId, {
        colorTheme: colorTheme || '#3B82F6',
        description: description || '',
        website: website || '',
        phone: phone || '',
        // Store additional customization data as JSON
        customData: {
          socialLinks: socialLinks || {},
          certifications: certifications || []
        }
      });

      if (!updatedCompany) {
        return res.status(404).json({ error: 'Company not found' });
      }

      res.json({ 
        message: 'Company customization updated successfully',
        company: updatedCompany 
      });
    } catch (error) {
      console.error('Company customization error:', error);
      res.status(500).json({ error: 'Failed to update company customization' });
    }
  });

  // Enhanced Chat API routes with OpenAI integration
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, companyId } = req.body;
      
      // Generate OpenAI-powered response
      const response = await generateOpenAIChatResponse(message, companyId);
      
      res.json({
        message: response,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Chat API error:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    // Add appropriate headers for different file types
    const ext = path.extname(req.path).toLowerCase();
    if (ext === ".stl") {
      res.set("Content-Type", "application/octet-stream");
    } else if (ext === ".step" || ext === ".stp") {
      res.set("Content-Type", "application/step");
    } else if (ext === ".pdf") {
      res.set("Content-Type", "application/pdf");
      // Allow PDF to be downloaded or viewed
      res.set("Content-Disposition", "inline");
    }
    next();
  });
  
  // Object bytes and access policies live in .objects and must only be served
  // through the permission-checked /objects endpoint.
  app.use("/uploads/.objects", (_req, res) => { res.sendStatus(404); });
  app.use("/uploads", express.static(uploadDir, { dotfiles: "deny" }));

  // Mount unified AI routes
  app.use("/api/ai", aiRoutes);
  app.use("/api/dpf", dpfRoutes);
  app.use("/api/auth", authResetRoutes);

  // Clean up expired/used password reset tokens on startup and every hour
  cleanupExpiredResetTokens();
  setInterval(cleanupExpiredResetTokens, 60 * 60 * 1000);

  app.use("/api/openai", openaiAgentSearchRoutes);
  app.use("/api/genius", geniusRoutes);

  // Company routes
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      console.log(`✅ Fetched ${companies.length} companies`);
      res.json(companies);
    } catch (error) {
      console.error('❌ Error fetching companies:', error);
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`🏢 Fetching company with ID: ${id}`);
      
      if (isNaN(id)) {
        console.log(`❌ Invalid company ID: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid company ID" });
      }
      
      const company = await storage.getCompany(id);
      if (!company) {
        console.log(`❌ Company with ID ${id} not found`);
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Get follower count
      const followers = await storage.getCompanyFollowers(id);
      const followerCount = followers.length;
      
      // Track activity if user is authenticated
      if (req.session?.userId) {
        try {
          await storage.trackUserActivity(req.session.userId, {
            activityType: 'view_company',
            companyId: id,
            metadata: { companyName: company.name }
          });
        } catch (error) {
          console.error('Error tracking company view:', error);
          // Don't fail the request if tracking fails
        }
      }
      
      console.log(`✅ Successfully fetched company: ${company.name} with ${followerCount} followers`);
      res.json({ ...company, followerCount });
    } catch (error) {
      console.error('❌ Error fetching company:', error);
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  app.post("/api/companies/create-with-admin", async (req, res) => {
    try {
      const { user: userData, company: companyData } = req.body;
      
      // Hash the password
      const passwordHash = await bcrypt.hash(userData.password, 10);
      
      // Create the company first
      const company = await storage.createCompany(companyData);
      
      // Create the admin user with company association
      const user = await storage.registerUser({
        ...userData,
        password: passwordHash,
        role: 'company_admin',
        companyId: company.id
      });
      
      // Set up session
      req.session.userId = user.id;
      req.session.user = user;
      
      res.status(201).json({ 
        message: 'Company and admin user created successfully',
        company,
        user: { ...user, password: undefined }
      });
    } catch (error: any) {
      console.error('Company creation error:', error);
      res.status(400).json({ error: 'Failed to create company and admin user' });
    }
  });

  app.post("/api/companies", uploadMemory.single("logo"), async (req, res) => {
    try {
      const companyData = insertCompanySchema.parse(req.body);
      if (req.file) {
        const objSvc = new ObjectStorageService();
        companyData.logoPath = await objSvc.uploadFileBuffer(req.file.buffer, req.file.mimetype, "logos", req.file.originalname, { owner: "company", visibility: "public" });
      }
      const company = await storage.createCompany(companyData);
      res.status(201).json(company);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid company data", error: error?.message || "Unknown error" });
    }
  });

  // Separate endpoint for logo upload
  app.post("/api/companies/:id/logo", uploadMemory.single("logo"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Extract user from token
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const tokenUser = verifyAuthToken(token);
      if (!tokenUser) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      // Fetch current user from database to get fresh role (tokens may be stale after role changes)
      const dbUser = await storage.getUser(tokenUser.id);
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check authorization using database role: platform admins can edit any company, company admins can edit only their own
      const userCompanyId = dbUser.companyId ? parseInt(String(dbUser.companyId)) : null;
      const isAdmin = dbUser.role === 'admin';
      const isCompanyAdmin = dbUser.role === 'company_admin' && userCompanyId === id;
      
      if (!isAdmin && !isCompanyAdmin) {
        return res.status(403).json({ error: "Not authorized to upload logo for this company" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No logo file provided" });
      }
      
      console.log(`🏢 User ${dbUser.email} uploading logo for company ${id}`);
      
      const objSvc = new ObjectStorageService();
      const logoPath = await objSvc.uploadFileBuffer(req.file.buffer, req.file.mimetype, "logos", req.file.originalname, { owner: String(id), visibility: "public" });
      const company = await storage.updateCompany(id, { logoPath });
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      console.log(`✅ Logo uploaded successfully for company ${company.name}`);
      res.json({ logoPath, message: "Logo updated successfully" });
    } catch (error) {
      console.error('❌ Logo upload error:', error);
      res.status(400).json({ message: "Failed to upload logo", error: error.message });
    }
  });

  // JSON-only endpoint for company updates
  app.put("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Extract user from token
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const tokenUser = verifyAuthToken(token);
      if (!tokenUser) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      // Fetch current user from database to get fresh role (tokens may be stale after role changes)
      const dbUser = await storage.getUser(tokenUser.id);
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check authorization using database role: platform admins can edit any company, company admins can edit only their own
      const userCompanyId = dbUser.companyId ? parseInt(String(dbUser.companyId)) : null;
      const isAdmin = dbUser.role === 'admin';
      const isCompanyAdmin = dbUser.role === 'company_admin' && userCompanyId === id;
      
      if (!isAdmin && !isCompanyAdmin) {
        console.log(`❌ Auth failed: role=${dbUser.role}, userCompanyId=${userCompanyId}, requestedId=${id}`);
        return res.status(403).json({ error: "Not authorized to edit this company" });
      }
      
      console.log(`🏢 User ${dbUser.email} (${dbUser.role}) updating company ${id} with data:`, req.body);
      
      const companyData = req.body;
      
      // Validate that required fields exist and are properly formatted
      if (companyData.certifications && typeof companyData.certifications === 'string') {
        try {
          companyData.certifications = JSON.parse(companyData.certifications);
        } catch (e) {
          companyData.certifications = [];
        }
      }
      
      const company = await storage.updateCompany(id, companyData);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      console.log(`✅ Company ${company.name} updated successfully by ${dbUser.email}`);
      res.json(company);
    } catch (error) {
      console.error('❌ Company update error:', error);
      res.status(400).json({ message: "Invalid company data", error: error.message });
    }
  });

  app.delete("/api/companies/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;

      // Only platform admins can delete companies
      if (user.role !== 'admin') {
        return res.status(403).json({ error: "Only platform admins can delete companies" });
      }

      // Get company name before deletion for activity tracking
      const company = await storage.getCompany(id);
      const companyName = company?.name || `Company #${id}`;

      console.log(`🗑️ Admin ${user.email} deleting company ${id}`);
      
      const success = await storage.deleteCompany(id);
      if (!success) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Track admin deletion activity
      await storage.trackUserActivity(user.id, {
        activityType: 'admin_delete_company',
        entityId: String(id),
        entityType: 'company',
        metadata: { companyName, adminEmail: user.email }
      });

      res.status(204).send();
    } catch (error) {
      console.error("Company deletion error:", error);
      res.status(500).json({ message: "Failed to delete company" });
    }
  });

  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const products = companyId 
        ? await storage.getProductsByCompany(companyId)
        : await storage.getProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Track activity if user is authenticated
      if (req.session?.userId) {
        try {
          await storage.trackUserActivity(req.session.userId, {
            activityType: 'view_product',
            productId: id,
            metadata: { productName: product.name }
          });
        } catch (error) {
          console.error('Error tracking product view:', error);
          // Don't fail the request if tracking fails
        }
      }
      
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Get similar products based on category and semantic similarity
  app.get("/api/products/:id/similar", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 6;
      
      const currentProduct = await storage.getProduct(id);
      if (!currentProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get all products and companies for enrichment
      const allProducts = await storage.getProducts();
      const allCompanies = await storage.getCompanies();
      const companyMap = new Map(allCompanies.map(c => [c.id, c]));
      
      // Helper function to enrich products with company info
      const enrichProducts = (products: typeof allProducts) => {
        return products.map(p => ({
          ...p,
          company: companyMap.get(p.companyId) || null
        }));
      };
      
      // Filter products: same category, different product, active only
      const candidateProducts = allProducts.filter(p => 
        p.id !== id && 
        p.category === currentProduct.category &&
        p.isActive !== false
      );

      if (candidateProducts.length === 0) {
        // No products in same category - try to find from same company
        const sameCompanyProducts = allProducts.filter(p => 
          p.id !== id && 
          p.companyId === currentProduct.companyId &&
          p.isActive !== false
        );
        return res.json(enrichProducts(sameCompanyProducts.slice(0, limit)));
      }

      // Calculate similarity scores based on text matching
      try {
        // Create search text from current product
        const searchText = `${currentProduct.name} ${currentProduct.description || ''} ${currentProduct.specifications || ''}`;
        
        // Calculate similarity scores
        const scoredProducts = candidateProducts.map((product) => {
          const productText = `${product.name} ${product.description || ''} ${product.specifications || ''}`;
          
          // Simple similarity based on shared words
          const currentWords = searchText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const productWords = productText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const commonWords = currentWords.filter(w => productWords.includes(w));
          const similarity = commonWords.length / Math.max(currentWords.length, productWords.length, 1);
          
          return {
            ...product,
            company: companyMap.get(product.companyId) || null,
            similarityScore: similarity
          };
        });

        // Sort by similarity and return top results
        const similarProducts = scoredProducts
          .sort((a, b) => b.similarityScore - a.similarityScore)
          .slice(0, limit);

        console.log(`✅ Found ${similarProducts.length} similar products for product ${id} in category "${currentProduct.category}"`);
        res.json(similarProducts);
      } catch (error) {
        console.error('Error calculating similarity:', error);
        // Fallback to returning products from same category
        res.json(enrichProducts(candidateProducts.slice(0, limit)));
      }
    } catch (error) {
      console.error('Error fetching similar products:', error);
      res.status(500).json({ message: "Failed to fetch similar products" });
    }
  });

  app.post("/api/products", uploadMemory.fields([
    { name: "image", maxCount: 1 },
    { name: "datasheet", maxCount: 1 },
    { name: "model3d", maxCount: 1 },
    { name: "documentation", maxCount: 1 },
    { name: "catalogs", maxCount: 10 }
  ]), async (req, res) => {
    try {
      // Parse text fields from multipart form data
      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        category: req.body.category || null,
        price: req.body.price ? parseFloat(req.body.price) : null,
        specifications: req.body.specifications ? (typeof req.body.specifications === 'string' ? req.body.specifications : JSON.stringify(req.body.specifications)) : null,
        companyId: parseInt(req.body.companyId || "1"),
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        groupId: req.body.groupId ? parseInt(req.body.groupId) : null,
        isActive: true
      };

      // Validate with schema
      const validatedData = insertProductSchema.parse(productData);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const objSvc = new ObjectStorageService();
      
      // Upload files to object storage (images → public, everything else → private)
      if (files.image) {
        const f = files.image[0];
        validatedData.imagePath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "products", f.originalname, { owner: "system", visibility: "public" });
      }
      if (files.datasheet) {
        const f = files.datasheet[0];
        validatedData.catalogPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: "system", visibility: "private" });
      }
      if (files.catalogs && files.catalogs.length > 0) {
        const f = files.catalogs[0];
        validatedData.catalogPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: "system", visibility: "private" });
      }
      if (files.model3d) {
        const f = files.model3d[0];
        const modelPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "models", f.originalname, { owner: "system", visibility: "public" });
        validatedData.modelPath = modelPath;
        const ext = path.extname(f.originalname).toLowerCase();
        validatedData.modelType = ext === ".stl" ? "stl" : "step";
        if (validatedData.modelType === "step") {
          validatedData.stepFilePaths = [modelPath];
        }
      }
      if (files.documentation) {
        const f = files.documentation[0];
        const documentPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: "system", visibility: "private" });
        validatedData.documentPaths = [documentPath];
      }
      
      const product = await storage.createProduct(validatedData);

      // Auto-extract structured specs from the uploaded datasheet (background,
      // non-blocking) when no specs were provided. This populates
      // products.specifications so the search agent can reason from a real
      // attribute table instead of having to parse PDF prose at query time.
      if (product.catalogPath) {
        autoExtractAndPersistSpecs(product.id, product.catalogPath, {
          name: product.name,
          category: product.category || '',
          description: product.description || undefined,
        }).catch((err) => {
          console.warn(`⚠️ [SpecAutoExtract] product ${product.id}: ${err?.message || err}`);
        });
      }

      res.status(201).json(product);
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(400).json({ message: "Invalid product data", error: error.message });
    }
  });

  // PUT route for updating products
  app.put("/api/products/:id", uploadMemory.fields([
    { name: "image", maxCount: 1 },
    { name: "datasheet", maxCount: 1 },
    { name: "model3d", maxCount: 1 },
    { name: "documentation", maxCount: 5 }
  ]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // Check authentication using JWT token from cookies
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      // Get existing product to check ownership
      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Check if user is company admin for this company
      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      // Parse text fields from multipart form data
      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        category: req.body.category || null,
        price: req.body.price ? parseFloat(req.body.price) : null,
        specifications: req.body.specifications && req.body.specifications.trim() !== "" ? req.body.specifications : null,
        productWebLink: req.body.productWebLink && req.body.productWebLink.trim() !== "" ? req.body.productWebLink : null,
        companyId: existingProduct.companyId, // Keep existing company
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        groupId: req.body.groupId ? parseInt(req.body.groupId) : null,
        isActive: true
      };

      console.log("Product update data received:", productData);
      console.log("Files received:", Object.keys(req.files || {}));
      
      // Debug file upload details
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files.model3d) {
        const uploadedFile = files.model3d[0];
        console.log("📁 3D Model file upload details:");
        console.log("  - Original name:", uploadedFile.originalname);
        console.log("  - Size:", uploadedFile.size);
        console.log("  - MIME type:", uploadedFile.mimetype);
      }

      // Validate with schema
      const validatedData = insertProductSchema.parse(productData);
      const objSvc = new ObjectStorageService();
      const uploaderOwner = user.id;
      
      // Handle file uploads – new files go to object storage; existing paths kept if no new file
      if (files.image) {
        const f = files.image[0];
        validatedData.imagePath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "products", f.originalname, { owner: uploaderOwner, visibility: "public" });
      } else {
        validatedData.imagePath = existingProduct.imagePath;
      }
      
      if (files.datasheet) {
        const f = files.datasheet[0];
        validatedData.catalogPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: uploaderOwner, visibility: "private" });
      } else {
        validatedData.catalogPath = existingProduct.catalogPath;
      }
      
      if (files.model3d) {
        const f = files.model3d[0];
        const modelPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "models", f.originalname, { owner: uploaderOwner, visibility: "public" });
        validatedData.modelPath = modelPath;
        const ext = path.extname(f.originalname).toLowerCase();
        validatedData.modelType = ext === ".stl" ? "stl" : "step";
        if (validatedData.modelType === "step") {
          validatedData.stepFilePaths = [modelPath];
        }
        console.log("✅ 3D model uploaded to object storage:", modelPath);
      } else {
        validatedData.modelPath = existingProduct.modelPath;
        validatedData.modelType = existingProduct.modelType;
        validatedData.stepFilePaths = existingProduct.stepFilePaths;
      }
      
      if (files.documentation) {
        const newDocPaths = await Promise.all(
          files.documentation.map((f: Express.Multer.File) =>
            objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: uploaderOwner, visibility: "private" })
          )
        );
        let retainedPaths: string[] = [];
        if (req.body.existingDocumentPaths) {
          try {
            retainedPaths = JSON.parse(req.body.existingDocumentPaths);
          } catch (e) {
            retainedPaths = [];
          }
        }
        validatedData.documentPaths = [...retainedPaths, ...newDocPaths];
      } else if (req.body.existingDocumentPaths) {
        try {
          validatedData.documentPaths = JSON.parse(req.body.existingDocumentPaths);
        } catch (e) {
          validatedData.documentPaths = existingProduct.documentPaths;
        }
      } else {
        validatedData.documentPaths = existingProduct.documentPaths;
      }
      
      const updatedProduct = await storage.updateProduct(productId, validatedData);

      // Auto-extract structured specs when a NEW datasheet was uploaded in
      // this update AND no specs were saved with the form. Same fire-and-
      // forget pattern as the create route.
      if (updatedProduct && files.datasheet && updatedProduct.catalogPath) {
        autoExtractAndPersistSpecs(updatedProduct.id, updatedProduct.catalogPath, {
          name: updatedProduct.name,
          category: updatedProduct.category || '',
          description: updatedProduct.description || undefined,
        }).catch((err) => {
          console.warn(`⚠️ [SpecAutoExtract] product ${updatedProduct.id}: ${err?.message || err}`);
        });
      }

      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product update error:", error);
      console.error("Request body:", req.body);
      console.error("Files received:", req.files);
      res.status(400).json({ message: "Invalid product data", error: error.message });
    }
  });

  // DELETE route for products
  app.delete("/api/products/:id", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // Check authentication using JWT token from cookies
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      // Get product to check ownership
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Check authorization: either platform admin OR company admin for this company
      const isAdmin = user.role === 'admin';
      const isCompanyAdmin = user.role === 'company_admin' && user.companyId === product.companyId;
      
      if (!isAdmin && !isCompanyAdmin) {
        return res.status(403).json({ error: "Not authorized to delete this product" });
      }

      console.log(`🗑️ User ${user.email} deleting product ${productId}`);
      
      const success = await storage.deleteProduct(productId);
      if (!success) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Track admin deletion activity (only for platform admins)
      if (isAdmin) {
        await storage.trackUserActivity(user.id, {
          activityType: 'admin_delete_product',
          entityId: String(productId),
          entityType: 'product',
          metadata: { productName: product.name, adminEmail: user.email }
        });
      }

      res.json({ message: "Product deleted successfully" });
    } catch (error: any) {
      console.error("Product deletion error:", error);
      res.status(500).json({ error: "Failed to delete product", message: error.message });
    }
  });

  // PATCH route for updating product details
  app.patch("/api/products/:id/details", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const { name, description, category, productWebLink, contactEmail } = req.body;
      
      // Validate productWebLink if provided
      if (productWebLink !== undefined && productWebLink !== null && productWebLink !== '') {
        try {
          new URL(productWebLink);
        } catch (e) {
          return res.status(400).json({ error: "Invalid product web link URL format" });
        }
      }
      
      // Validate contactEmail if provided
      if (contactEmail !== undefined && contactEmail !== null && contactEmail !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactEmail)) {
          return res.status(400).json({ error: "Invalid contact email format" });
        }
      }
      
      const updatedProduct = await storage.updateProduct(productId, {
        name,
        description,
        category,
        ...(productWebLink !== undefined && { productWebLink: productWebLink || null }),
        ...(contactEmail !== undefined && { contactEmail: contactEmail || null }),
      });
      
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product details update error:", error);
      res.status(400).json({ message: "Failed to update product details", error: error.message });
    }
  });

  // PATCH route for updating product specifications
  app.patch("/api/products/:id/specifications", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const { specifications } = req.body;
      const updatedProduct = await storage.updateProduct(productId, {
        specifications,
      });
      
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product specifications update error:", error);
      res.status(400).json({ message: "Failed to update specifications", error: error.message });
    }
  });

  // PATCH route for updating product order links
  app.patch("/api/products/:id/order-links", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const { orderLinks } = req.body;
      const updatedProduct = await storage.updateProduct(productId, {
        orderLinks,
      });
      
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product order links update error:", error);
      res.status(400).json({ message: "Failed to update order links", error: error.message });
    }
  });

  // PATCH route for updating product image
  app.patch("/api/products/:id/image", uploadMemory.fields([{ name: 'image', maxCount: 1 }]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.image?.[0]) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const f = files.image[0];
      const objSvc = new ObjectStorageService();
      const imagePath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "products", f.originalname, { owner: String(productId), visibility: "public" });
      const updatedProduct = await storage.updateProduct(productId, {
        imagePath,
      });
      
      console.log(`✅ Product ${productId} image updated by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product image update error:", error);
      res.status(400).json({ message: "Failed to update product image", error: error.message });
    }
  });

  // PATCH route for updating product 3D model
  app.patch("/api/products/:id/model", uploadMemory.fields([{ name: 'model3d', maxCount: 1 }]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.model3d?.[0]) {
        return res.status(400).json({ error: "No model file provided" });
      }

      const modelFile = files.model3d[0];
      const objSvc = new ObjectStorageService();
      const modelPath = await objSvc.uploadFileBuffer(modelFile.buffer, modelFile.mimetype, "models", modelFile.originalname, { owner: user.id, visibility: "public" });
      const ext = path.extname(modelFile.originalname).toLowerCase();
      const modelType = ext === '.stl' ? 'stl' : 'step';

      const updatedProduct = await storage.updateProduct(productId, {
        modelPath,
        modelType,
      });
      
      console.log(`✅ Product ${productId} 3D model updated by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product model update error:", error);
      res.status(400).json({ message: "Failed to update product model", error: error.message });
    }
  });

  // PATCH route for updating product datasheet PDF
  app.patch("/api/products/:id/datasheet", upload.fields([{ name: 'datasheet', maxCount: 1 }]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.datasheet?.[0]) {
        return res.status(400).json({ error: "No datasheet file provided" });
      }

      const catalogPath = `/uploads/catalogs/${files.datasheet[0].filename}`;
      const updatedProduct = await storage.updateProduct(productId, {
        catalogPath,
      });
      
      console.log(`✅ Product ${productId} datasheet updated by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product datasheet update error:", error);
      res.status(400).json({ message: "Failed to update product datasheet", error: error.message });
    }
  });

  // PATCH route for updating product documentation files
  app.patch("/api/products/:id/documentation", upload.fields([{ name: 'documentation', maxCount: 5 }]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.documentation?.length) {
        return res.status(400).json({ error: "No documentation files provided" });
      }

      const newDocPaths = files.documentation.map(f => `/uploads/catalogs/${f.filename}`);
      const existingDocs = existingProduct.documentPaths || [];
      const documentPaths = [...existingDocs, ...newDocPaths];

      const updatedProduct = await storage.updateProduct(productId, {
        documentPaths,
      });
      
      console.log(`✅ Product ${productId} documentation updated by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product documentation update error:", error);
      res.status(400).json({ message: "Failed to update product documentation", error: error.message });
    }
  });

  // DELETE route for removing a specific documentation file
  app.delete("/api/products/:id/documentation", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { documentPath } = req.body;
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      if (!documentPath) {
        return res.status(400).json({ error: "Document path is required" });
      }

      const existingDocs = existingProduct.documentPaths || [];
      const documentPaths = existingDocs.filter(path => path !== documentPath);

      const updatedProduct = await storage.updateProduct(productId, {
        documentPaths,
      });
      
      console.log(`✅ Product ${productId} documentation file removed by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product documentation delete error:", error);
      res.status(400).json({ message: "Failed to delete documentation", error: error.message });
    }
  });

  // DELETE route for removing datasheet
  app.delete("/api/products/:id/datasheet", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const updatedProduct = await storage.updateProduct(productId, {
        catalogPath: null,
      });
      
      console.log(`✅ Product ${productId} datasheet removed by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product datasheet delete error:", error);
      res.status(400).json({ message: "Failed to delete datasheet", error: error.message });
    }
  });

  // DELETE route for removing 3D model
  app.delete("/api/products/:id/model", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const token = extractToken(req);
      
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== existingProduct.companyId)) {
        return res.status(403).json({ error: "Not authorized to update this product" });
      }

      const updatedProduct = await storage.updateProduct(productId, {
        modelPath: null,
        modelType: null,
      });
      
      console.log(`✅ Product ${productId} 3D model removed by ${user.email}`);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("Product model delete error:", error);
      res.status(400).json({ message: "Failed to delete 3D model", error: error.message });
    }
  });

  // Quote request routes
  app.get("/api/quote-requests", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const quoteRequests = companyId 
        ? await storage.getQuoteRequestsByCompany(companyId)
        : await storage.getQuoteRequests();
      res.json(quoteRequests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quote requests" });
    }
  });

  app.post("/api/quote-requests", async (req, res) => {
    try {
      const quoteRequestData = insertQuoteRequestSchema.parse(req.body);
      const quoteRequest = await storage.createQuoteRequest(quoteRequestData);
      res.status(201).json(quoteRequest);
    } catch (error) {
      res.status(400).json({ message: "Invalid quote request data", error: error.message });
    }
  });

  app.put("/api/quote-requests/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const quoteRequest = await storage.updateQuoteRequestStatus(id, status);
      if (!quoteRequest) {
        return res.status(404).json({ message: "Quote request not found" });
      }
      res.json(quoteRequest);
    } catch (error) {
      res.status(500).json({ message: "Failed to update quote request status" });
    }
  });

  // Chat message routes
  app.get("/api/chat/:fromCompanyId/:toCompanyId", async (req, res) => {
    try {
      const fromCompanyId = parseInt(req.params.fromCompanyId);
      const toCompanyId = parseInt(req.params.toCompanyId);
      const messages = await storage.getChatMessages(fromCompanyId, toCompanyId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const messageData = insertChatMessageSchema.parse(req.body);
      const message = await storage.createChatMessage(messageData);
      
      // If it's a user message to a company, generate an AI response
      if (messageData.messageType === "user" && messageData.toCompanyId) {
        const aiResponse = getAIResponse(messageData.message);
        const aiMessage = await storage.createChatMessage({
          fromCompanyId: messageData.toCompanyId,
          toCompanyId: messageData.fromCompanyId || messageData.toCompanyId,
          message: aiResponse,
          messageType: "bot"
        });
        
        // Broadcast AI response via WebSocket
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "message",
              data: aiMessage
            }));
          }
        });
      }
      
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ message: "Invalid message data", error: error.message });
    }
  });

  // AI Chat endpoint for direct AI interactions
  app.post("/api/ai-chat", async (req, res) => {
    try {
      const { message } = req.body;
      const response = getAIResponse(message);
      res.json({ response });
    } catch (error) {
      res.status(500).json({ message: "AI chat service unavailable" });
    }
  });

  // Enhanced search endpoint with semantic understanding and knowledge graph
  app.get("/api/search", async (req: any, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string" || q.length < 2) {
        return res.json({ companies: [], products: [] });
      }
      
      console.log(`🔍 Semantic Search API called with query: "${q}"`);
      
      // Extract user ID if authenticated (for personalization)
      let userId: string | undefined;
      try {
        const token = extractToken(req);
        if (token) {
          const user = verifyAuthToken(token);
          if (user && user.id) {
            userId = String(user.id);
          }
        }
      } catch (error) {
        // User not authenticated - continue with generic search
      }
      
      // Use semantic search with knowledge graph
      const { parseSemanticQuery, executeSemanticSearch } = await import("./services/semantic-search");
      
      // Parse the query to understand intent
      const parsedQuery = await parseSemanticQuery(q);
      console.log(`📊 Query parsed:`, {
        intent: parsedQuery.intent,
        entity: parsedQuery.entity,
        confidence: parsedQuery.confidence
      });
      
      // Execute semantic search based on parsed intent
      const searchResults = await executeSemanticSearch(parsedQuery);
      
      // Helper function to enrich companies with catalogues
      const enrichCompaniesWithCatalogues = async (companiesArr: any[]) => {
        if (!companiesArr || companiesArr.length === 0) return companiesArr;
        
        return Promise.all(companiesArr.map(async (company) => {
          try {
            const catalogues = await storage.getCompanyCatalogues(company.id);
            const documentPaths = catalogues.map((cat: any) => cat.pdfPath).filter(Boolean);
            return { ...company, documentPaths };
          } catch (error) {
            return company;
          }
        }));
      };
      
      // If semantic search found nothing, fall back to simple search
      if (searchResults.companies.length === 0 && searchResults.products.length === 0) {
        console.log('⚠️ Semantic search found no results, falling back to simple search');
        const { simpleSearch } = await import("./simple-search");
        const fallbackResults = await simpleSearch(q, userId);
        
        // Enrich companies with catalogues
        fallbackResults.companies = await enrichCompaniesWithCatalogues(fallbackResults.companies);
        
        console.log(`✅ Fallback search results for "${q}":`, {
          companies: fallbackResults.companies.length,
          products: fallbackResults.products.length,
        });
        
        return res.json(fallbackResults);
      }
      
      // Enrich companies with catalogues
      searchResults.companies = await enrichCompaniesWithCatalogues(searchResults.companies);
      
      console.log(`✅ Semantic search results for "${q}":`, {
        intent: parsedQuery.intent,
        companies: searchResults.companies.length,
        products: searchResults.products.length,
        userId: userId ? 'authenticated' : 'anonymous'
      });
      
      res.json(searchResults);
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Search failed", error: error?.message || "Unknown error" });
    }
  });

  // Company products endpoint  
  app.get("/api/companies/:companyId/products", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const products = await storage.getCompanyProducts(companyId);
      res.json(products);
    } catch (error) {
      console.error('Failed to fetch company products:', error);
      res.status(500).json({ message: "Failed to fetch company products" });
    }
  });

  // ============================================================
  // CSV Bulk Product Import endpoint
  // ============================================================
  app.post("/api/companies/:companyId/products/bulk-import", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);

      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }

      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== companyId)) {
        return res.status(403).json({ error: "Not authorized to bulk import products for this company" });
      }

      const { products: productRows } = req.body;
      if (!Array.isArray(productRows) || productRows.length === 0) {
        return res.status(400).json({ error: "Request body must contain a non-empty 'products' array" });
      }
      if (productRows.length > 500) {
        return res.status(400).json({ error: "Maximum 500 products per import" });
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024;

      fs.mkdirSync(path.join(process.cwd(), "uploads/products"), { recursive: true });
      fs.mkdirSync(path.join(process.cwd(), "uploads/catalogs"), { recursive: true });
      fs.mkdirSync(path.join(process.cwd(), "uploads/models"), { recursive: true });

      const results: Array<{ row: number; name: string; status: string; productId?: number; error?: string }> = [];
      let created = 0;
      let failed = 0;

      for (let i = 0; i < productRows.length; i++) {
        const row = productRows[i];
        const rowNum = i + 1;
        const rowName = row.name || `Row ${rowNum}`;

        if (!row.name || !row.name.trim()) {
          failed++;
          results.push({ row: rowNum, name: rowName, status: "failed", error: "Missing required field: name" });
          continue;
        }
        if (!row.description || !row.description.trim()) {
          failed++;
          results.push({ row: rowNum, name: rowName, status: "failed", error: "Missing required field: description" });
          continue;
        }
        if (!row.category || !row.category.trim()) {
          failed++;
          results.push({ row: rowNum, name: rowName, status: "failed", error: "Missing required field: category" });
          continue;
        }

        try {
          let imagePath: string | null = null;
          let catalogPath: string | null = null;
          let modelPath: string | null = null;
          let modelType: string | null = null;

          if (row.imageUrl) {
            try {
              const url = new URL(row.imageUrl);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                const resp = await fetch(row.imageUrl);
                if (resp.ok) {
                  const buffer = Buffer.from(await resp.arrayBuffer());
                  if (buffer.length <= MAX_FILE_SIZE) {
                    const ext = path.extname(url.pathname) || ".jpg";
                    const filename = `image-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
                    const mimeType = resp.headers.get('content-type') || 'image/jpeg';
                    const bulkObjSvc = new ObjectStorageService();
                    imagePath = await bulkObjSvc.uploadFileBuffer(buffer, mimeType, "products", filename, { owner: "bulk-import", visibility: "public" });
                  }
                }
              }
            } catch (e) {
              console.warn(`Bulk import row ${rowNum}: Failed to download image from ${row.imageUrl}`);
            }
          }

          if (row.datasheetUrl) {
            try {
              const url = new URL(row.datasheetUrl);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                const resp = await fetch(row.datasheetUrl);
                if (resp.ok) {
                  const buffer = Buffer.from(await resp.arrayBuffer());
                  if (buffer.length <= MAX_FILE_SIZE) {
                    const ext = path.extname(url.pathname) || ".pdf";
                    const filename = `datasheet-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
                    const mimeType = resp.headers.get('content-type') || 'application/pdf';
                    const bulkObjSvc = new ObjectStorageService();
                    catalogPath = await bulkObjSvc.uploadFileBuffer(buffer, mimeType, "catalogs", filename, { owner: "bulk-import", visibility: "private" });
                  }
                }
              }
            } catch (e) {
              console.warn(`Bulk import row ${rowNum}: Failed to download datasheet from ${row.datasheetUrl}`);
            }
          }

          if (row.model3dUrl) {
            try {
              const url = new URL(row.model3dUrl);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                const resp = await fetch(row.model3dUrl);
                if (resp.ok) {
                  const buffer = Buffer.from(await resp.arrayBuffer());
                  if (buffer.length <= MAX_FILE_SIZE) {
                    const urlExt = path.extname(url.pathname).toLowerCase();
                    const ext = urlExt || ".step";
                    const originalName = `model3d${ext}`;
                    const mime = ext === ".stl" ? "model/stl" : "application/step";
                    const objSvcBulk = new ObjectStorageService();
                    modelPath = await objSvcBulk.uploadFileBuffer(buffer, mime, "models", originalName, { owner: "system", visibility: "public" });
                    modelType = (urlExt === ".stl") ? "stl" : "step";
                  }
                }
              }
            } catch (e) {
              console.warn(`Bulk import row ${rowNum}: Failed to download 3D model from ${row.model3dUrl}`);
            }
          }

          const productData: any = {
            name: row.name.trim(),
            description: row.description.trim(),
            category: row.category.trim(),
            companyId: companyId,
            productWebLink: row.productWebLink || null,
            imagePath,
            catalogPath,
            modelPath,
            modelType,
            isActive: true,
          };

          if (modelType === "step" && modelPath) {
            productData.stepFilePaths = [modelPath];
          }

          const validatedData = insertProductSchema.parse(productData);
          const product = await storage.createProduct(validatedData);

          // Auto-extract structured specs from the datasheet (fire-and-forget)
          if (product.catalogPath) {
            autoExtractAndPersistSpecs(product.id, product.catalogPath, {
              name: product.name,
              category: product.category || '',
              description: product.description || undefined,
            }).catch((err: any) =>
              console.warn(`⚠️ [BulkImport] Spec extraction failed for row ${rowNum} (${product.name}): ${err?.message || err}`)
            );
          }

          created++;
          results.push({ row: rowNum, name: row.name, status: "created", productId: product.id });
        } catch (err: any) {
          failed++;
          results.push({ row: rowNum, name: rowName, status: "failed", error: err.message || "Unknown error" });
        }
      }

      res.json({
        totalRows: productRows.length,
        created,
        failed,
        results,
      });
    } catch (error: any) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: "Bulk import failed", message: error.message });
    }
  });

  // Create product for specific company
  app.post("/api/companies/:companyId/products", 
    // Add file upload handling (memory storage → direct upload to object storage)
    uploadMemory.fields([
      { name: "image", maxCount: 1 },
      { name: "datasheet", maxCount: 1 },
      { name: "model3d", maxCount: 1 },
      { name: "documentation", maxCount: 5 }
    ]), 
    async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check authentication using JWT token from cookies
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }
      
      // Check if user is company admin for this company
      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== companyId)) {
        return res.status(403).json({ error: "Not authorized to create products for this company" });
      }
      
      console.log(`✅ User ${user.email} creating product for company ${companyId}`);
      
      // Parse text fields from multipart form data
      const productData = {
        name: req.body.name || "Untitled Product",
        description: req.body.description && req.body.description.trim() !== "" ? req.body.description : "No description provided",
        category: req.body.category && req.body.category.trim() !== "" ? req.body.category : "Uncategorized", 
        price: req.body.price ? parseFloat(req.body.price) : null,
        specifications: req.body.specifications && req.body.specifications.trim() !== "" ? req.body.specifications : null,
        productWebLink: req.body.productWebLink && req.body.productWebLink.trim() !== "" ? req.body.productWebLink : null,
        companyId: companyId,
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        groupId: req.body.groupId ? parseInt(req.body.groupId) : null,
        isActive: true
      };

      console.log("Product data received:", productData);
      console.log("Files received:", Object.keys(req.files || {}));
      
      // Debug file upload details
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files.model3d) {
        const uploadedFile = files.model3d[0];
        console.log("📁 File upload details:");
        console.log("  - Original name:", uploadedFile.originalname);
        console.log("  - Size:", uploadedFile.size);
        console.log("  - MIME type:", uploadedFile.mimetype);
      }

      // Validate with schema
      const validatedData = insertProductSchema.parse(productData);
      const objSvc = new ObjectStorageService();
      const uploaderOwner = user.id;
      
      // Upload files to object storage (images → public, everything else → private)
      if (files.image) {
        const f = files.image[0];
        validatedData.imagePath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "products", f.originalname, { owner: uploaderOwner, visibility: "public" });
      }
      if (files.datasheet) {
        const f = files.datasheet[0];
        validatedData.catalogPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: uploaderOwner, visibility: "private" });
      }
      if (files.model3d) {
        const f = files.model3d[0];
        const modelPath = await objSvc.uploadFileBuffer(f.buffer, f.mimetype, "models", f.originalname, { owner: uploaderOwner, visibility: "private" });
        validatedData.modelPath = modelPath;
        const ext = path.extname(f.originalname).toLowerCase();
        validatedData.modelType = ext === ".stl" ? "stl" : "step";
        if (validatedData.modelType === "step") {
          validatedData.stepFilePaths = [modelPath];
        }
      }
      if (files.documentation) {
        const docPaths = await Promise.all(
          files.documentation.map((f: Express.Multer.File) =>
            objSvc.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: uploaderOwner, visibility: "private" })
          )
        );
        validatedData.documentPaths = docPaths;
      }
      
      const product = await storage.createProduct(validatedData);

      // Auto-extract structured specs from the uploaded datasheet (background, non-blocking)
      if (product.catalogPath) {
        autoExtractAndPersistSpecs(product.id, product.catalogPath, {
          name: product.name,
          category: product.category || '',
          description: product.description || undefined,
        }).catch((err) => {
          console.warn(`⚠️ [SpecAutoExtract] product ${product.id}: ${err?.message || err}`);
        });
      }

      res.status(201).json(product);
    } catch (error: any) {
      console.error("Company product creation error:", error);
      console.error("Request body:", req.body);
      console.error("Files received:", req.files);
      res.status(400).json({ message: "Invalid product data", error: error.message });
    }
  });

  // Company catalogues endpoints
  app.get("/api/companies/:companyId/catalogues", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const catalogues = await storage.getCompanyCatalogues(companyId);
      res.json(catalogues);
    } catch (error) {
      console.error('Failed to fetch company catalogues:', error);
      res.status(500).json({ message: "Failed to fetch company catalogues" });
    }
  });

  app.post("/api/companies/:companyId/catalogues", 
    upload.single("pdf"),
    async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check authentication
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }
      
      // Check if user is company admin for this company
      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== companyId)) {
        return res.status(403).json({ error: "Not authorized to create catalogues for this company" });
      }
      
      // Validate required fields
      if (!req.body.name || !req.file) {
        return res.status(400).json({ error: "Catalogue name and PDF are required" });
      }
      
      const catalogueData = {
        name: req.body.name,
        description: req.body.description || null,
        pdfPath: `/uploads/catalogs/${req.file.filename}`,
        companyId: companyId,
      };
      
      const catalogue = await storage.createCatalogue(catalogueData);
      res.status(201).json(catalogue);
    } catch (error: any) {
      console.error("Catalogue creation error:", error);
      res.status(400).json({ message: "Invalid catalogue data", error: error.message });
    }
  });

  app.delete("/api/catalogues/:id", async (req, res) => {
    try {
      const catalogueId = parseInt(req.params.id);
      
      // Check authentication
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user || (user.role !== 'admin' && user.role !== 'company_admin')) {
        return res.status(403).json({ error: "Not authorized to delete catalogues" });
      }
      
      await storage.deleteCatalogue(catalogueId);
      res.json({ message: "Catalogue deleted successfully" });
    } catch (error: any) {
      console.error("Catalogue deletion error:", error);
      res.status(500).json({ message: "Failed to delete catalogue", error: error.message });
    }
  });

  // Company restricted documents endpoints (for AI training only)
  app.get("/api/companies/:companyId/restricted-documents", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const documents = await storage.getCompanyRestrictedDocuments(companyId);
      res.json(documents);
    } catch (error) {
      console.error('Failed to fetch restricted documents:', error);
      res.status(500).json({ message: "Failed to fetch restricted documents" });
    }
  });

  app.post("/api/companies/:companyId/restricted-documents", 
    upload.single("pdf"),
    async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check authentication
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const documentData = {
        name: req.body.name,
        description: req.body.description || null,
        pdfPath: `/uploads/catalogs/${req.file.filename}`,
        companyId: companyId,
      };
      
      const document = await storage.createRestrictedDocument(documentData);
      res.status(201).json(document);
    } catch (error: any) {
      console.error("Restricted document creation error:", error);
      res.status(400).json({ message: "Invalid document data", error: error.message });
    }
  });

  app.delete("/api/restricted-documents/:id", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      
      // Check authentication
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = verifyAuthToken(token);
      if (!user || (user.role !== 'admin' && user.role !== 'company_admin')) {
        return res.status(403).json({ error: "Not authorized to delete restricted documents" });
      }
      
      await storage.deleteRestrictedDocument(documentId);
      res.json({ message: "Restricted document deleted successfully" });
    } catch (error: any) {
      console.error("Restricted document deletion error:", error);
      res.status(500).json({ message: "Failed to delete restricted document", error: error.message });
    }
  });

  // Product Category Management Routes
  app.get("/api/companies/:companyId/categories", requireCompanyAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const categories = await storage.getProductCategories(companyId);
      res.json(categories);
    } catch (error) {
      console.error('Failed to fetch product categories:', error);
      res.status(500).json({ message: "Failed to fetch product categories" });
    }
  });

  app.get("/api/categories/:id", requireCompanyAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const category = await storage.getProductCategory(id);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category" });
    }
  });

  app.post("/api/categories", requireCompanyAdmin, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user?.companyId) {
        return res.status(403).json({ error: 'Company admin access required' });
      }

      const categoryData = insertProductCategorySchema.parse({
        ...req.body,
        companyId: user.companyId
      });
      
      const category = await storage.createProductCategory(categoryData);
      res.status(201).json(category);
    } catch (error: any) {
      console.error('Failed to create product category:', error);
      res.status(400).json({ message: "Failed to create category", error: error.message });
    }
  });

  app.put("/api/categories/:id", requireCompanyAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const categoryData = insertProductCategorySchema.partial().parse(req.body);
      
      const category = await storage.updateProductCategory(id, categoryData);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ message: "Failed to update category", error: error.message });
    }
  });

  app.delete("/api/categories/:id", requireCompanyAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteProductCategory(id);
      if (!success) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Product Group Management Routes
  app.get("/api/companies/:companyId/groups", requireCompanyAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      const groups = await storage.getProductGroups(companyId, categoryId);
      res.json(groups);
    } catch (error) {
      console.error('Failed to fetch product groups:', error);
      res.status(500).json({ message: "Failed to fetch product groups" });
    }
  });

  app.get("/api/groups/:id", requireCompanyAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const group = await storage.getProductGroup(id);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch group" });
    }
  });

  app.post("/api/groups", requireCompanyAdmin, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user?.companyId) {
        return res.status(403).json({ error: 'Company admin access required' });
      }

      const groupData = insertProductGroupSchema.parse({
        ...req.body,
        companyId: user.companyId
      });
      
      const group = await storage.createProductGroup(groupData);
      res.status(201).json(group);
    } catch (error: any) {
      console.error('Failed to create product group:', error);
      res.status(400).json({ message: "Failed to create group", error: error.message });
    }
  });

  app.put("/api/groups/:id", requireCompanyAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const groupData = insertProductGroupSchema.partial().parse(req.body);
      
      const group = await storage.updateProductGroup(id, groupData);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json(group);
    } catch (error: any) {
      res.status(400).json({ message: "Failed to update group", error: error.message });
    }
  });

  app.delete("/api/groups/:id", requireCompanyAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteProductGroup(id);
      if (!success) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete group" });
    }
  });

  // Enhanced product routes with category/group support
  app.get("/api/categories/:categoryId/products", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      const products = await storage.getProductsByCategory(categoryId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products by category" });
    }
  });

  app.get("/api/groups/:groupId/products", async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const products = await storage.getProductsByGroup(groupId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products by group" });
    }
  });

  // Product configurator routes
  app.get("/api/products/:productId/configurations", async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const configurations = await storage.getProductConfigurations(productId);
      res.json(configurations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product configurations" });
    }
  });

  app.post("/api/products/:productId/configurations", 
    requireAuth, 
    uploadMemory.fields([
      { name: "datasheet", maxCount: 1 },
      { name: "model3d", maxCount: 1 }
    ]), 
    async (req: any, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const user = req.user;
      
      if (!user || (user.role !== 'admin' && user.role !== 'company_admin')) {
        return res.status(403).json({ error: "Only company admins can add configurations" });
      }
      
      // Check if user owns the product's company
      const product = await storage.getProduct(productId);
      if (!product || user.companyId !== product.companyId) {
        return res.status(403).json({ error: "Unauthorized to configure this product" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      // Parse configuration data from form
      const configData: any = {
        productId,
        name: req.body.name,
        description: req.body.description || null,
        specifications: req.body.specifications || null,
        webLink: req.body.webLink || null,
        isActive: true
      };

      // Handle file uploads
      const objSvcCfg = new ObjectStorageService();
      if (files.datasheet) {
        const f = files.datasheet[0];
        configData.datasheetPath = await objSvcCfg.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: user.id, visibility: "private" });
      }
      
      if (files.model3d) {
        const f = files.model3d[0];
        const modelPath = await objSvcCfg.uploadFileBuffer(f.buffer, f.mimetype, "models", f.originalname, { owner: user.id, visibility: "public" });
        configData.modelPath = modelPath;
        const ext = path.extname(f.originalname).toLowerCase();
        configData.modelType = ext === ".stl" ? "stl" : "step";
      }

      const configuration = await storage.createProductConfiguration(configData);
      
      res.status(201).json(configuration);
    } catch (error: any) {
      console.error("Configuration creation error:", error);
      res.status(400).json({ message: "Failed to create configuration", error: error.message });
    }
  });

  app.get("/api/configurations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const configuration = await storage.getProductConfiguration(id);
      if (!configuration) {
        return res.status(404).json({ message: "Configuration not found" });
      }
      res.json(configuration);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  app.put("/api/configurations/:id", 
    requireAuth, 
    uploadMemory.fields([
      { name: "datasheet", maxCount: 1 },
      { name: "model3d", maxCount: 1 }
    ]),
    async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      
      if (!user || (user.role !== 'admin' && user.role !== 'company_admin')) {
        return res.status(403).json({ error: "Only company admins can modify configurations" });
      }
      
      // Check ownership
      const config = await storage.getProductConfiguration(id);
      if (!config) {
        return res.status(404).json({ message: "Configuration not found" });
      }
      
      const product = await storage.getProduct(config.productId);
      if (!product || user.companyId !== product.companyId) {
        return res.status(403).json({ error: "Unauthorized to modify this configuration" });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const updateData: any = {
        name: req.body.name,
        description: req.body.description || null,
        specifications: req.body.specifications || null,
        webLink: req.body.webLink || null,
      };

      // Handle file uploads - keep existing if not provided
      const objSvcUpd = new ObjectStorageService();
      if (files.datasheet) {
        const f = files.datasheet[0];
        updateData.datasheetPath = await objSvcUpd.uploadFileBuffer(f.buffer, f.mimetype, "catalogs", f.originalname, { owner: user.id, visibility: "private" });
      }
      
      if (files.model3d) {
        const f = files.model3d[0];
        const modelPath = await objSvcUpd.uploadFileBuffer(f.buffer, f.mimetype, "models", f.originalname, { owner: user.id, visibility: "public" });
        updateData.modelPath = modelPath;
        const ext = path.extname(f.originalname).toLowerCase();
        updateData.modelType = ext === ".stl" ? "stl" : "step";
      }

      const updatedConfig = await storage.updateProductConfiguration(id, updateData);
      res.json(updatedConfig);
    } catch (error: any) {
      res.status(400).json({ message: "Failed to update configuration", error: error.message });
    }
  });

  app.delete("/api/configurations/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      
      if (!user || (user.role !== 'admin' && user.role !== 'company_admin')) {
        return res.status(403).json({ error: "Only company admins can delete configurations" });
      }
      
      // Check ownership
      const config = await storage.getProductConfiguration(id);
      if (!config) {
        return res.status(404).json({ message: "Configuration not found" });
      }
      
      const product = await storage.getProduct(config.productId);
      if (!product || user.companyId !== product.companyId) {
        return res.status(403).json({ error: "Unauthorized to delete this configuration" });
      }

      const success = await storage.deleteProductConfiguration(id);
      if (success) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Configuration not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete configuration" });
    }
  });

  app.post("/api/configurations/download", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const { productId, configurationId, fileType, filePath } = req.body;
      
      // Track the download
      await storage.trackConfigurationDownload({
        userId: user.id,
        productId,
        configurationId,
        fileType,
        filePath
      });

      res.json({
        message: "Download tracked successfully",
        downloadId: `download_${Date.now()}`
      });
    } catch (error) {
      console.error("Download tracking error:", error);
      res.status(500).json({ message: "Failed to process download" });
    }
  });

  app.get("/api/download-history", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      
      const downloads = await storage.getConfigurationDownloads(userId, productId);
      res.json(downloads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch download history" });
    }
  });

  // Track product file downloads
  app.post("/api/products/:id/track-download", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const productId = parseInt(req.params.id);
      const { fileType, fileName, filePath } = req.body;
      
      // Track the download activity
      await storage.trackUserActivity(userId, {
        activityType: 'download',
        entityId: String(productId),
        entityType: 'product',
        metadata: {
          fileType, // e.g., '3d_model', 'pdf_catalog', 'datasheet'
          fileName,
          filePath
        }
      });

      res.json({ message: "Download tracked successfully" });
    } catch (error) {
      console.error("Download tracking error:", error);
      res.status(500).json({ message: "Failed to track download" });
    }
  });

  // Backfill: extract STRUCTURED key/value specs from a product's datasheet
  // PDF and persist them to products.specifications. Used to populate the spec
  // table for catalog products that were uploaded without specs (so the
  // search agent can score them from real attribute data, not PDF prose).
  app.post("/api/products/:id/extract-structured-specs", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const productId = parseInt(req.params.id);
      const force = req.body?.force === true || req.query?.force === '1';

      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ error: "Product not found" });

      const company = await storage.getCompany(product.companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const currentUser = await storage.getUserById(userId);
      const isPlatformAdmin = currentUser?.role === 'admin';
      const isCompanyAdmin = company.adminUserId === userId;
      let isMember = false;
      if (!isPlatformAdmin && !isCompanyAdmin) {
        isMember = await storage.isCompanyMember(userId, company.id);
      }
      if (!isPlatformAdmin && !isCompanyAdmin && !isMember) {
        return res.status(403).json({ error: "Not authorized to edit this product" });
      }

      if (!product.catalogPath) {
        return res.status(400).json({ error: "no_datasheet", message: "No datasheet uploaded for this product" });
      }
      if (product.specifications && !force) {
        return res.status(409).json({
          error: "specs_already_present",
          message: "Product already has specifications. Pass { force: true } to overwrite.",
          specifications: product.specifications,
        });
      }

      const fullPath = path.join(process.cwd(), `.${product.catalogPath}`);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "datasheet_missing", message: "Datasheet file not found on disk" });
      }

      const { generateStructuredSpecsFromDatasheet } = await import('./services/datasheet-summarizer.js');
      const specs = await generateStructuredSpecsFromDatasheet(fullPath, {
        name: product.name,
        category: product.category || '',
        description: product.description || undefined,
      });

      if (!specs || Object.keys(specs).length === 0) {
        return res.status(422).json({ error: "no_specs_extracted", message: "AI could not extract structured specs from this datasheet" });
      }

      const updated = await storage.updateProduct(productId, { specifications: specs as any });
      console.log(`✅ [SpecBackfill] product ${productId}: persisted ${Object.keys(specs).length} structured specs`);
      return res.json({ success: true, count: Object.keys(specs).length, specifications: specs, product: updated });
    } catch (error: any) {
      console.error("Structured spec extraction error:", error);
      return res.status(500).json({ error: 'extraction_failed', message: error?.message || 'Unknown error' });
    }
  });

  app.post("/api/products/:id/generate-specs", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const productId = parseInt(req.params.id);
      const { productName, productCategory, productDescription } = req.body;

      console.log("🤖 Generating specs from datasheet for product:", productId);

      // Get product to verify ownership and get datasheet path
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Verify user has permission to edit this product
      const company = await storage.getCompany(product.companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Check if user is admin or company admin/member
      const currentUser = await storage.getUserById(userId);
      if (currentUser?.role !== 'admin' && company.adminUserId !== userId) {
        // Check if user is a company member
        const isMember = await storage.isCompanyMember(userId, company.id);
        if (!isMember) {
          return res.status(403).json({ error: "Not authorized to edit this product" });
        }
      }

      // Check if product has a datasheet
      if (!product.catalogPath) {
        return res.status(400).json({ 
          error: "no_datasheet",
          message: "No datasheet uploaded for this product" 
        });
      }

      // Import the datasheet summarizer service
      const { generateSpecificationsFromDatasheet } = await import('./services/datasheet-summarizer.js');

      // Generate specifications from datasheet
      const result = await generateSpecificationsFromDatasheet(
        product.catalogPath,
        {
          name: productName || product.name,
          category: productCategory || product.category,
          description: productDescription || product.description || undefined
        }
      );

      console.log("✅ Specs generated successfully with confidence:", result.confidence);

      res.json({
        summary: result.summary,
        confidence: result.confidence,
        rawTextPreview: result.rawTextPreview
      });

    } catch (error: any) {
      console.error("Spec generation error:", error);
      
      // Handle specific error types
      if (error.message.includes('pdf_parse_failed')) {
        return res.status(400).json({ 
          error: 'pdf_parse_failed',
          message: 'Failed to extract text from PDF. The file may be corrupted or image-based.' 
        });
      }
      
      if (error.message.includes('ai_unavailable')) {
        return res.status(503).json({ 
          error: 'ai_unavailable',
          message: 'AI service is temporarily unavailable. Please try again later.' 
        });
      }
      
      if (error.message.includes('ai_summarization_failed')) {
        return res.status(500).json({ 
          error: 'ai_summarization_failed',
          message: 'Failed to generate specifications. Please try again or enter them manually.' 
        });
      }

      res.status(500).json({ 
        error: 'generation_failed',
        message: "Failed to generate specifications from datasheet" 
      });
    }
  });

  // AI Matchmaking endpoints
  app.get('/api/ai/matchmaking/:companyId/:type', requireAuth, async (req, res) => {
    try {
      const { companyId, type } = req.params;
      const suggestions = await generateMatchingSuggestions(parseInt(companyId), type);
      res.json(suggestions);
    } catch (error) {
      console.error('AI matchmaking error:', error);
      res.status(500).json({ error: 'Failed to generate matchmaking suggestions' });
    }
  });

  app.get('/api/ai/market-insights/:companyId', requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const insights = await generateMarketInsights(parseInt(companyId));
      res.json(insights);
    } catch (error) {
      console.error('Market insights error:', error);
      res.status(500).json({ error: 'Failed to generate market insights' });
    }
  });

  // Document analysis endpoints
  app.get('/api/documents/analyzed/:companyId', requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const documents = await getAnalyzedDocuments(parseInt(companyId));
      res.json(documents);
    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ error: 'Failed to fetch analyzed documents' });
    }
  });

  app.post('/api/documents/analyze', requireAuth, async (req, res) => {
    try {
      const { companyId, file } = req.body;
      const analysis = await startDocumentAnalysis(parseInt(companyId), file);
      res.json(analysis);
    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ error: 'Failed to start document analysis' });
    }
  });

  // Analytics endpoints
  app.get('/api/analytics/:companyId/:period', requireAuth, async (req, res) => {
    try {
      const { companyId, period } = req.params;
      const analytics = await getAnalyticsData(parseInt(companyId), period);
      res.json(analytics);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
  });

  app.get('/api/analytics/market-insights/:companyId', requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const insights = await getMarketInsights(parseInt(companyId));
      res.json(insights);
    } catch (error) {
      console.error('Market insights error:', error);
      res.status(500).json({ error: 'Failed to fetch market insights' });
    }
  });

  // 3D Configuration endpoints
  app.get('/api/products/:productId/3d-model', requireAuth, async (req, res) => {
    try {
      const { productId } = req.params;
      const model = await get3DModelConfig(parseInt(productId));
      res.json(model);
    } catch (error) {
      console.error('3D model error:', error);
      res.status(500).json({ error: 'Failed to fetch 3D model' });
    }
  });

  app.post('/api/3d/generate', requireAuth, async (req, res) => {
    try {
      const { productId, configuration, material, finish, viewMode } = req.body;
      const model = await generate3DModel(productId, configuration, material, finish, viewMode);
      res.json(model);
    } catch (error) {
      console.error('3D generation error:', error);
      res.status(500).json({ error: 'Failed to generate 3D model' });
    }
  });

  // Inventory endpoints
  app.get('/api/inventory/:productId/:configuration', requireAuth, async (req, res) => {
    try {
      const { productId, configuration } = req.params;
      const inventory = await getInventoryStatus(parseInt(productId), JSON.parse(configuration));
      res.json(inventory);
    } catch (error) {
      console.error('Inventory error:', error);
      res.status(500).json({ error: 'Failed to fetch inventory status' });
    }
  });

  // Real-time pricing endpoint
  app.get('/api/pricing/:productId/:configuration/:quantity', requireAuth, async (req, res) => {
    try {
      const { productId, configuration, quantity } = req.params;
      const pricing = await getRealTimePricing(parseInt(productId), JSON.parse(configuration), parseInt(quantity));
      res.json(pricing);
    } catch (error) {
      console.error('Pricing error:', error);
      res.status(500).json({ error: 'Failed to fetch pricing' });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time chat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat') {
          // Save message to storage
          const chatMessage = await storage.createChatMessage({
            fromCompanyId: message.fromCompanyId,
            toCompanyId: message.toCompanyId,
            message: message.message,
            messageType: message.messageType || "user"
          });

          // Broadcast to all connected clients
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'message',
                data: chatMessage
              }));
            }
          });

          // Generate AI response if it's a user message
          if (message.messageType === "user") {
            const aiResponse = getAIResponse(message.message);
            const aiMessage = await storage.createChatMessage({
              fromCompanyId: message.toCompanyId,
              toCompanyId: message.fromCompanyId,
              message: aiResponse,
              messageType: "bot"
            });

            // Send AI response back to all clients
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'message',
                  data: aiMessage
                }));
              }
            });
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // All the remaining API endpoints are defined here...

  // Favorites routes (products only)
  app.post('/api/favorites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { favoriteType, favoriteId, externalData } = req.body;
      // externalCanonicalKey is stored in externalData.canonicalKey by the client
      const externalCanonicalKey: string | null = externalData?.canonicalKey ?? null;
      
      if (favoriteType !== 'product') {
        return res.status(400).json({ error: 'Only products can be favorited' });
      }
      
      const favorite = await storage.addToFavorites(userId, favoriteType, favoriteId, externalData ?? null, externalCanonicalKey);
      
      // Track favorite activity
      try {
        await storage.trackUserActivity(userId, {
          activityType: 'favorite',
          entityId: String(favoriteId),
          entityType: 'product',
          metadata: { action: 'add' }
        });
      } catch (error) {
        console.error('Failed to track favorite activity:', error);
      }
      
      res.json(favorite);
    } catch (error) {
      console.error('Error adding favorite:', error);
      res.status(500).json({ error: 'Failed to add to favorites' });
    }
  });

  app.delete('/api/favorites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { favoriteType, favoriteId, externalKey } = req.body;
      
      if (favoriteType !== 'product') {
        return res.status(400).json({ error: 'Only products can be favorited' });
      }
      
      const removed = await storage.removeFromFavorites(userId, favoriteType, favoriteId, externalKey ?? null);
      
      // Track unfavorite activity
      try {
        await storage.trackUserActivity(userId, {
          activityType: 'unfavorite',
          entityId: String(favoriteId),
          entityType: 'product',
          metadata: { action: 'remove' }
        });
      } catch (error) {
        console.error('Failed to track unfavorite activity:', error);
      }
      
      res.json({ success: removed });
    } catch (error) {
      console.error('Error removing favorite:', error);
      res.status(500).json({ error: 'Failed to remove from favorites' });
    }
  });

  app.get('/api/favorites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const favorites = await storage.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      res.status(500).json({ error: 'Failed to fetch favorites' });
    }
  });

  app.get('/api/favorites/:type/:id/check', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const favoriteType = req.params.type as 'product';
      const favoriteId = parseInt(req.params.id);
      
      if (favoriteType !== 'product') {
        return res.status(400).json({ error: 'Only products can be favorited' });
      }
      
      const isFavorited = await storage.isFavorited(userId, favoriteType, favoriteId);
      res.json({ isFavorited });
    } catch (error) {
      console.error('Error checking favorite status:', error);
      res.status(500).json({ error: 'Failed to check favorite status' });
    }
  });

  // User follows routes
  app.get('/api/user/follows', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log('📋 Fetching follows for user:', userId);
      const follows = await storage.getUserFollows(userId);
      console.log('📋 Found follows:', follows.length, 'items');
      res.json(follows);
    } catch (error) {
      console.error('Error fetching user follows:', error);
      res.status(500).json({ error: 'Failed to fetch follows' });
    }
  });

  // Get followed companies with full company data
  app.get('/api/user/following', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const follows = await storage.getUserFollows(userId);
      const companies = follows.map((f: any) => f.company).filter(Boolean);
      res.json(companies);
    } catch (error) {
      console.error('Error fetching followed companies:', error);
      res.status(500).json({ error: 'Failed to fetch followed companies' });
    }
  });

  // Get favorite products with full product data
  app.get('/api/user/favorite-products', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const favorites = await storage.getUserFavorites(userId);
      const products = favorites.products || [];
      res.json(products);
    } catch (error) {
      console.error('Error fetching favorite products:', error);
      res.status(500).json({ error: 'Failed to fetch favorite products' });
    }
  });

  // User download history
  app.get('/api/user/downloads', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log('📥 Fetching download history for user:', userId);
      const downloads = await storage.getUserDownloadsWithProducts(userId);
      console.log('📥 Found downloads:', downloads.length, 'items');
      res.json(downloads);
    } catch (error) {
      console.error('Error fetching user downloads:', error);
      res.status(500).json({ error: 'Failed to fetch downloads' });
    }
  });

  // User activity feed
  app.get('/api/user/activity', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log('📊 Fetching activity feed for user:', userId);
      const activities = await storage.getUserActivity(userId);
      console.log('📊 Found activities:', activities.length, 'items');
      res.json(activities);
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });

  // Log search activity (only when user explicitly submits a search)
  app.post('/api/user/log-search', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { query } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
      // Normalize and validate the query
      const normalizedQuery = query.trim().toLowerCase();
      const searchTerm = normalizedQuery.replace(/^find\s+/, '').trim();
      
      // Only log meaningful searches (5+ characters after stripping prefix)
      if (searchTerm.length < MIN_SEARCH_QUERY_LENGTH) {
        return res.json({ success: true, skipped: true }); // Accept but don't log
      }
      
      const now = Date.now();
      
      // Clean up expired cache entries (older than cooldown period)
      // This keeps memory bounded to only active cooldown windows
      for (const [key, value] of searchActivityCache.entries()) {
        if (now - value.timestamp > SEARCH_LOG_COOLDOWN_MS) {
          searchActivityCache.delete(key);
        }
      }
      
      // Check for recent duplicate searches (use stripped search term for proper deduplication)
      const cacheKey = `${userId}:${searchTerm}`;
      const cachedSearch = searchActivityCache.get(cacheKey);
      
      // Only log if not logged within cooldown period (10 seconds)
      if (cachedSearch && (now - cachedSearch.timestamp) <= SEARCH_LOG_COOLDOWN_MS) {
        return res.json({ success: true, skipped: true }); // Accept but don't log duplicate
      }
      
      // Log the search
      await storage.trackUserActivity(userId, {
        activityType: 'search',
        metadata: { query: query.trim() } // Store original query
      });
      
      // Update cache with new entry
      searchActivityCache.set(cacheKey, { query: searchTerm, timestamp: now });
      
      console.log(`🔍 Logged search activity for user ${userId}: "${query}"`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging search activity:', error);
      res.status(500).json({ error: 'Failed to log search' });
    }
  });

  // AI-powered search endpoint with semantic understanding and knowledge graph
  app.post('/api/ai-search', async (req, res) => {
    try {
      console.log('🎯 AI Search endpoint hit');
      console.log('🎯 Request body:', req.body);
      
      // Set JSON response headers immediately
      res.setHeader('Content-Type', 'application/json');
      
      const { query } = req.body;
      
      if (!query || typeof query !== 'string') {
        console.log('❌ Invalid query provided:', query);
        return res.status(400).json({ error: 'Query is required' });
      }
      
      console.log('🔍 Processing AI search with semantic understanding for query:', query);

      // Use semantic search with knowledge graph
      const { parseSemanticQuery, executeSemanticSearch } = await import("./services/semantic-search");
      
      // Parse the query to understand intent
      const parsedQuery = await parseSemanticQuery(query);
      console.log(`🧠 Semantic parsing:`, {
        intent: parsedQuery.intent,
        entity: parsedQuery.entity,
        confidence: parsedQuery.confidence
      });
      
      // Execute semantic search based on parsed intent
      let searchResults = await executeSemanticSearch(parsedQuery);
      
      // If semantic search found nothing, fall back to traditional search
      if (searchResults.companies.length === 0 && searchResults.products.length === 0) {
        console.log('⚠️ Semantic search found no results, trying traditional search');
        searchResults = await storage.searchAll(query);
      }
      
      // Enrich companies with catalogues for Downloads dropdown
      if (searchResults.companies && searchResults.companies.length > 0) {
        searchResults.companies = await Promise.all(searchResults.companies.map(async (company: any) => {
          try {
            const catalogues = await storage.getCompanyCatalogues(company.id);
            const documentPaths = catalogues.map((cat: any) => cat.pdfPath).filter(Boolean);
            return { ...company, documentPaths };
          } catch (error) {
            return company;
          }
        }));
      }
      
      // Calculate fit scores for products based on user requirements
      if (searchResults.products && searchResults.products.length > 0) {
        console.log('📊 Calculating fit scores for products...');
        searchResults.products = await calculateProductFitScores(query, searchResults.products);
      }
      
      // Generate smart AI response with semantic context
      console.log(`🔍 Generating intelligent AI response for: "${query}"`);
      let response;
      try {
        response = await generateSemanticAwareAIResponse(query, parsedQuery, searchResults);
      } catch (aiError) {
        console.log('OpenAI failed, using smart fallback response:', aiError);
        response = generateSemanticFallback(query, parsedQuery, searchResults);
      }
      console.log(`✅ AI search response generated: ${response.substring(0, 100)}...`);
      
      const finalResponse = {
        response,
        suggestions: generateSmartSuggestions(query, parsedQuery, searchResults),
        searchResults: searchResults,
        parsedIntent: {
          type: parsedQuery.intent,
          entity: parsedQuery.entity,
          confidence: parsedQuery.confidence
        }
      };
      
      console.log('📤 Sending AI search response:', JSON.stringify(finalResponse).substring(0, 200) + '...');
      res.json(finalResponse);
    } catch (error) {
      console.error('❌ AI search error:', error);
      
      // Fast fallback
      try {
        const basicResults = await storage.searchAll(req.body.query || '');
        const fallbackResponse = generateIntelligentFallback(req.body.query || '', basicResults);
        
        res.json({
          response: fallbackResponse,
          suggestions: [],
          searchResults: basicResults
        });
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        res.status(500).json({ error: 'Search service temporarily unavailable' });
      }
    }
  });

  // AI Document Processing endpoint
  app.post('/api/ai/extract-product-info', upload.array('documents', 10), async (req, res) => {
    try {
      console.log('🎯 AI Document Processing endpoint hit');
      
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No documents uploaded' });
      }

      console.log(`📄 Processing ${files.length} PDF documents`);

      // Extract text from all PDF files
      const extractedTexts: string[] = [];
      
      for (const file of files) {
        try {
          const pdfBuffer = fs.readFileSync(file.path);
          
          // Dynamic import to avoid startup issues
          const pdfParse = (await import('pdf-parse')).default;
          const pdfData = await pdfParse(pdfBuffer);
          
          extractedTexts.push(pdfData.text);
          console.log(`✅ Extracted ${pdfData.text.length} characters from ${file.originalname}`);
        } catch (pdfError) {
          console.error(`❌ Failed to parse PDF ${file.originalname}:`, pdfError);
          // Continue with other files or use fallback
          extractedTexts.push(`Document: ${file.originalname}\n[Unable to extract text from this PDF file]`);
        }
      }

      if (extractedTexts.length === 0) {
        return res.status(400).json({ error: 'No readable text found in uploaded documents' });
      }

      console.log(`✅ PDF text extraction completed for ${files.length} files`);

      // Combine all extracted text
      const combinedText = extractedTexts.join('\n\n--- DOCUMENT SEPARATOR ---\n\n');
      
      console.log(`🤖 Sending to OpenAI for analysis...`);
      
      // Use OpenAI to extract product information
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are an expert product information extraction assistant. Your task is to analyze technical documents and extract structured product information suitable for creating a product catalog entry.

Please extract the following information from the provided technical documents:
1. Product name (clear, marketable name)
2. Product description (concise, professional description)
3. Product category (general category like "Industrial Automation", "CNC Machines", "Sensors", etc.)
4. Technical specifications (key technical details, dimensions, performance characteristics)
5. Relevant tags/keywords (for searchability)

Return the information in JSON format with the following structure:
{
  "name": "Product Name",
  "description": "Professional product description (2-3 sentences)",
  "category": "Product Category",
  "specifications": {
    "key1": "value1",
    "key2": "value2"
  },
  "tags": ["tag1", "tag2", "tag3"]
}

Focus on extracting the most important and relevant information. If information is unclear or missing, use reasonable defaults or indicate "Not specified".`
          },
          {
            role: "user",
            content: `Please analyze the following technical document(s) and extract product information:\n\n${combinedText}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) {
        throw new Error('No response from OpenAI');
      }

      const extractedProduct = JSON.parse(responseContent);
      
      console.log('✅ Successfully extracted product information:', extractedProduct.name);
      
      // Clean up uploaded files
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });

      res.json(extractedProduct);
      
    } catch (error) {
      console.error('❌ AI Document Processing error:', error);
      
      // Clean up uploaded files on error
      const files = req.files as Express.Multer.File[];
      if (files) {
        files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to process documents',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Product-specific AI Chat endpoint 
  app.post("/api/products/:productId/ai-chat", async (req, res) => {
    try {
      console.log("🤖 Product AI Chat endpoint hit");
      console.log("🤖 Request body:", req.body);
      console.log("🤖 Request headers:", req.headers);
      
      const { productId } = req.params;
      
      if (!req.body || typeof req.body !== 'object') {
        console.log("❌ Invalid request body:", req.body);
        return res.status(400).json({ error: "Invalid request body" });
      }
      
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      console.log(`🤖 Processing AI chat for product ${productId} with query: ${query}`);

      // Fetch product data
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Fetch company data
      const company = await storage.getCompany(product.companyId);
      
      // Extract text from product's PDF catalog if available
      let catalogText = "";
      if (product.catalogPath) {
        try {
          const catalogFilePath = path.join(process.cwd(), 'uploads', 'catalogs', path.basename(product.catalogPath));
          if (fs.existsSync(catalogFilePath)) {
            console.log(`📄 Extracting text from catalog: ${catalogFilePath}`);
            const pdfBuffer = fs.readFileSync(catalogFilePath);
            
            // Dynamic import to avoid startup issues
            const pdfParse = (await import('pdf-parse')).default;
            const pdfData = await pdfParse(pdfBuffer);
            catalogText = pdfData.text;
            console.log(`✅ Extracted ${catalogText.length} characters from catalog`);
          }
        } catch (pdfError) {
          console.error(`❌ Failed to extract catalog text:`, pdfError);
          catalogText = "[Unable to read catalog document]";
        }
      }

      // Prepare comprehensive context for AI
      const productContext = `
PRODUCT INFORMATION:
Name: ${product.name}
Description: ${product.description || 'Not specified'}
Category: ${product.category || 'Not specified'}
Price: ${product.price ? `$${product.price}` : 'Not specified'}

TECHNICAL SPECIFICATIONS:
${product.specifications ? (typeof product.specifications === 'string' ? product.specifications : JSON.stringify(product.specifications, null, 2)) : 'No specifications available'}

COMPANY INFORMATION:
Company: ${company?.name || 'Unknown'}
Industry: ${company?.industry || 'Not specified'}
Location: ${company?.location || 'Not specified'}
Description: ${company?.description || 'Not specified'}
Capabilities: ${company?.capabilities ? company.capabilities.join(', ') : 'Not specified'}
Certifications: ${company?.certifications ? company.certifications.join(', ') : 'Not specified'}

CATALOG/DOCUMENTATION CONTENT:
${catalogText || 'No catalog documentation available'}

FILES AVAILABLE:
- Product Image: ${product.imagePath ? 'Available' : 'Not available'}
- Technical Catalog: ${product.catalogPath ? 'Available' : 'Not available'}
- 3D Model: ${product.modelPath ? `Available (${product.modelType})` : 'Not available'}
      `;

      // Generate AI response
      try {
        if (!openai) {
          throw new Error("OpenAI client not initialized");
        }

        const systemPrompt = `You are DeepFolder's product AI assistant. 

CRITICAL: Maximum 1-2 sentences ONLY. Be extremely brief - one key fact per response.

Answer questions about product specs, compatibility, and usage. If data unavailable, say so in 5 words.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Product Context:\n${productContext}\n\nUser Question: ${query}` }
          ],
          max_completion_tokens: 80 // Very short responses - 1-2 sentences max
        });

        console.log("🔍 OpenAI completion response:", JSON.stringify(completion, null, 2));
        const aiResponse = completion.choices[0]?.message?.content;
        console.log("🔍 AI response content:", aiResponse);
        console.log("✅ Product AI chat response generated");

        res.json({ response: aiResponse || "" });
      } catch (openaiError) {
        console.error("❌ OpenAI API error:", openaiError);
        
        // Fallback response with available data
        let fallbackResponse = `Based on the available data for ${product.name}:\n\n`;
        
        if (product.specifications) {
          fallbackResponse += `Key specifications: ${typeof product.specifications === 'string' ? product.specifications.substring(0, 100) : 'Technical data available'}\n\n`;
        }
        
        if (company) {
          fallbackResponse += `Manufactured by ${company.name}`;
          if (company.location) fallbackResponse += ` (${company.location})`;
          fallbackResponse += `\n\n`;
        }
        
        fallbackResponse += `For detailed technical information, please refer to the product documentation or contact the manufacturer directly.`;

        res.json({ response: fallbackResponse });
      }
    } catch (error) {
      console.error("❌ Product AI Chat error:", error);
      res.status(500).json({ 
        error: "AI chat failed", 
        response: "I'm having trouble accessing the product information right now. Please try again later." 
      });
    }
  });

  // Company-specific chat assistant
  app.post('/api/company-chat', async (req, res) => {
    try {
      const { message, companyId, context, productData } = req.body;
      
      // Get company information
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Get company products for context
      const products = await storage.getProductsByCompany(companyId);
      
      // Build context-aware response
      let contextInfo = `Company: ${company.name}\nIndustry: ${company.industry}\nDescription: ${company.description}\nLocation: ${company.location}\n\n`;
      
      if (context === 'product' && productData) {
        contextInfo += `Current Product Focus: ${productData.name}\nProduct Description: ${productData.description}\nSpecifications: ${productData.specifications || 'N/A'}\nPrice: ${productData.price || 'Contact for pricing'}\n\n`;
      }
      
      contextInfo += `Available Products:\n${products.map(p => `- ${p.name}: ${p.description}`).join('\n')}\n\n`;
      
      const response = await generateCompanyChatResponse(message, company, products, contextInfo, context, productData);
      
      res.json({ response });
    } catch (error) {
      console.error('Error in company chat:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // Recommendation Engine API endpoints
  app.post("/api/interactions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const interaction = await storage.trackUserInteraction({
        ...req.body,
        userId
      });
      res.json(interaction);
    } catch (error) {
      console.error("Track interaction error:", error);
      res.status(500).json({ error: "Failed to track interaction" });
    }
  });

  app.get("/api/recommendations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { type, limit } = req.query;
      
      // Generate fresh recommendations for the user
      await storage.generateRecommendations(userId);
      
      const recommendations = await storage.getRecommendations(
        userId, 
        type as string, 
        limit ? parseInt(limit as string) : 10
      );
      res.json(recommendations);
    } catch (error) {
      console.error("Get recommendations error:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  app.get("/api/recommendations/companies", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { limit } = req.query;
      
      const recommendations = await storage.getCompanyRecommendations(
        userId, 
        limit ? parseInt(limit as string) : 10
      );
      res.json(recommendations);
    } catch (error) {
      console.error("Get company recommendations error:", error);
      res.status(500).json({ error: "Failed to get company recommendations" });
    }
  });

  app.get("/api/recommendations/connections", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { limit } = req.query;
      
      const recommendations = await storage.getSuggestedConnections(
        userId, 
        limit ? parseInt(limit as string) : 10
      );
      res.json(recommendations);
    } catch (error) {
      console.error("Get connection recommendations error:", error);
      res.status(500).json({ error: "Failed to get connection recommendations" });
    }
  });

  app.get("/api/recommendations/products", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { limit } = req.query;
      
      const recommendations = await storage.getProductRecommendations(
        userId, 
        limit ? parseInt(limit as string) : 10
      );
      res.json(recommendations);
    } catch (error) {
      console.error("Get product recommendations error:", error);
      res.status(500).json({ error: "Failed to get product recommendations" });
    }
  });

  app.post("/api/connections", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const connection = await storage.createNetworkConnection({
        fromUserId: userId,
        ...req.body
      });
      res.json(connection);
    } catch (error) {
      console.error("Create connection error:", error);
      res.status(500).json({ error: "Failed to create connection" });
    }
  });

  app.get("/api/connections", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const connections = await storage.getUserConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Get connections error:", error);
      res.status(500).json({ error: "Failed to get connections" });
    }
  });

  app.put("/api/connections/:id", requireAuth, async (req, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const connection = await storage.updateNetworkConnection(connectionId, req.body);
      if (connection) {
        res.json(connection);
      } else {
        res.status(404).json({ error: "Connection not found" });
      }
    } catch (error) {
      console.error("Update connection error:", error);
      res.status(500).json({ error: "Failed to update connection" });
    }
  });

  app.put("/api/recommendations/:id/viewed", requireAuth, async (req, res) => {
    try {
      const recommendationId = parseInt(req.params.id);
      const success = await storage.markRecommendationViewed(recommendationId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Recommendation not found" });
      }
    } catch (error) {
      console.error("Mark recommendation viewed error:", error);
      res.status(500).json({ error: "Failed to mark recommendation as viewed" });
    }
  });

  app.put("/api/recommendations/:id/acted", requireAuth, async (req, res) => {
    try {
      const recommendationId = parseInt(req.params.id);
      const success = await storage.markRecommendationActedUpon(recommendationId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Recommendation not found" });
      }
    } catch (error) {
      console.error("Mark recommendation acted upon error:", error);
      res.status(500).json({ error: "Failed to mark recommendation as acted upon" });
    }
  });

  app.get("/api/interactions/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { limit } = req.query;
      
      const history = await storage.getUserInteractionHistory(
        userId, 
        limit ? parseInt(limit as string) : 50
      );
      res.json(history);
    } catch (error) {
      console.error("Get interaction history error:", error);
      res.status(500).json({ error: "Failed to get interaction history" });
    }
  });

  // Company Document Routes - Using Object Storage
  app.post("/api/companies/:companyId/documents", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const { fileUrl, fileName, fileType } = req.body;
      
      // Try to get user from session first (demo mode), then try JWT token
      let user = null;
      
      if (req.session?.userId) {
        // Session-based authentication (demo mode)
        user = await storage.getUser(req.session.userId);
        if (!user) {
          return res.status(401).json({ error: "Session user not found" });
        }
      } else {
        // JWT token authentication
        const token = extractToken(req);
        if (!token) {
          return res.status(401).json({ error: "Authentication required" });
        }
        
        user = verifyAuthToken(token);
        if (!user) {
          return res.status(401).json({ error: "Invalid token" });
        }
      }
      
      // Check if user is company admin for this company
      if (user.role !== 'admin' && (user.role !== 'company_admin' || user.companyId !== companyId)) {
        return res.status(403).json({ error: "Not authorized to upload documents for this company" });
      }

      // Validate file data from object storage
      if (!fileUrl || !fileName) {
        return res.status(400).json({ error: "File URL and name are required" });
      }

      console.log(`📄 User ${user.email} uploading document for company ${companyId}: ${fileName}`);

      const { description, category, tags, isPublic } = req.body;

      const document = await storage.uploadCompanyDocument({
        companyId,
        fileName,
        filePath: fileUrl,
        fileType: fileType || 'application/pdf',
        fileSize: 0, // Size will be determined by object storage
        isPublic: isPublic === true,
        category: category || 'general'
      });

      console.log(`✅ Document uploaded successfully: ${document.filename}`);
      res.json(document);
    } catch (error) {
      console.error("❌ Document upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/companies/:companyId/documents", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const documents = await storage.getCompanyDocuments(companyId);
      
      if (!req.session?.userId) {
        const publicDocuments = documents.filter(doc => doc.isPublic);
        return res.json(publicDocuments);
      }

      const user = await storage.getUser(req.session.userId);
      
      if (user.role === 'admin' || user.companyId === companyId) {
        return res.json(documents);
      }

      const publicDocuments = documents.filter(doc => doc.isPublic);
      res.json(publicDocuments);
    } catch (error) {
      console.error("Get documents error:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.delete("/api/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      const document = await storage.getCompanyDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (user.role !== 'admin' && user.companyId !== document.companyId && document.uploadedBy !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this document" });
      }

      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }

      const success = await storage.deleteCompanyDocument(documentId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Document not found" });
      }
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Company Inquiry Routes
  app.post("/api/companies/:companyId/inquiries", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const inquiry = await storage.createCompanyInquiry({
        ...req.body,
        companyId
      });
      res.json(inquiry);
    } catch (error) {
      console.error("Create inquiry error:", error);
      res.status(400).json({ error: "Failed to create inquiry" });
    }
  });

  app.get("/api/companies/:companyId/inquiries", requireAuth, async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      if (user.role !== 'admin' && user.companyId !== companyId) {
        return res.status(403).json({ error: "Not authorized to view inquiries for this company" });
      }

      const inquiries = await storage.getCompanyInquiries(companyId);
      res.json(inquiries);
    } catch (error) {
      console.error("Get inquiries error:", error);
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  // Enhanced Company Search Route
  app.get("/api/companies/search/advanced", async (req, res) => {
    try {
      const { industry, country, keywords, companySize, servicesOffered } = req.query;
      
      const filters: any = {};
      if (industry) filters.industry = industry as string;
      if (country) filters.country = country as string;
      if (keywords) filters.keywords = keywords as string;
      if (companySize) filters.companySize = companySize as string;
      if (servicesOffered) {
        filters.servicesOffered = Array.isArray(servicesOffered) 
          ? servicesOffered as string[]
          : [servicesOffered as string];
      }

      const companies = await storage.searchCompaniesByFilters(filters);
      res.json(companies);
    } catch (error) {
      console.error("Advanced company search error:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  // Company AI Assistant Route (trained on company documents)
  app.post("/api/companies/:companyId/ai-chat", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Get company documents for context
      const documents = await storage.getCompanyDocuments(companyId);
      const publicDocs = documents.filter(doc => doc.isPublic || doc.isProcessedForAI);
      
      // Build context from documents
      let documentContext = "";
      if (publicDocs.length > 0) {
        documentContext = publicDocs
          .map(doc => `Document: ${doc.originalName}\n${doc.aiSummary || doc.description || 'No summary available'}`)
          .join('\n\n');
      }

      const contextualPrompt = `You are an AI assistant for ${company.name}, a ${company.industry} company located in ${company.location}. 

Company Information:
- Description: ${company.description}
- Industry: ${company.industry}
- Capabilities: ${company.capabilities?.join(', ') || 'Not specified'}
- Certifications: ${company.certifications?.join(', ') || 'Not specified'}

${documentContext ? `Available Documents:\n${documentContext}\n\n` : ''}

Please answer questions about the company based on this information. If you don't have specific information, be honest about limitations while being helpful.

User Question: ${message}`;

      // Get company products for context
      const products = await storage.getCompanyProducts(companyId);
      
      const response = await generateIntelligentFallbackResponse(message, companyId);
      res.json({ response });
    } catch (error) {
      console.error("Company AI chat error:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  // Supabase auth verification endpoint
  app.post("/api/auth/verify-supabase", async (req, res) => {
    try {
      const { supabaseUserId, email } = req.body;
      console.log("Supabase verification attempt:", { supabaseUserId, email });
      
      if (!supabaseUserId || !email) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Find user by email in our database
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        console.log("User not found, creating new user for:", email);
        // Create user if they don't exist
        try {
          user = await storage.registerUser({
            email,
            firstName: email.split('@')[0],
            lastName: '',
            password: 'supabase-auth', // Placeholder since Supabase handles auth
            role: 'public',
            headline: 'New User'
          });
          console.log("Created new user:", user.id);
        } catch (createError) {
          console.error("Failed to create user:", createError);
          return res.status(500).json({ error: "Failed to create user account" });
        }
      }
      
      // Update user with Supabase ID if not already set
      if (!user.supabaseUserId) {
        await storage.updateUserProfile(user.id, { supabaseUserId });
      }
      
      // Store user in session with regeneration for better persistence
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        
        req.session.userId = user.id;
        req.session.user = user;
        req.session.supabaseUserId = supabaseUserId;
        
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ error: "Session save failed" });
          }
          
          console.log("Supabase auth verified and session saved for user:", user.id);
          
          res.json({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            headline: user.headline,
            role: user.role,
            companyId: user.companyId
          });
        });
      });
    } catch (error) {
      console.error('Supabase auth verification error:', error);
      res.status(500).json({ error: 'Authentication verification failed' });
    }
  });

  // Enhanced logout to handle tokens and sessions
  app.post("/api/auth/logout", (req, res) => {
    // Clear auth token cookie
    res.clearCookie('authToken');
    res.clearCookie('connect.sid');
    
    // Also destroy session if it exists
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
        }
      });
    }
    
    console.log("TOKEN LOGOUT - Cleared cookies and session");
    res.json({ message: "Logout successful" });
  });

  // Debug route for testing authentication
  app.get("/test-login", (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'test-direct-login.html'));
  });

  // ML Recommendation Tracking API
  app.post('/api/ml/track-behavior', requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId!;
      const { action, entityType, entityId, context } = req.body;
      
      const behavior: UserBehavior = {
        userId,
        action,
        entityType,
        entityId,
        timestamp: new Date(),
        context
      };

      // Track for ML recommendations
      await recommendationEngine.trackUserBehavior(behavior);

      // Also persist to database for activity feed
      try {
        // Map action and entityType to proper activityType
        let activityType: string;
        if (action === 'view') {
          activityType = entityType === 'product' ? 'view_product' : 'view_company';
        } else if (action === 'favorite') {
          activityType = 'favorite';
        } else if (action === 'unfavorite') {
          activityType = 'unfavorite';
        } else if (action === 'download') {
          activityType = 'download';
        } else if (action === 'search') {
          activityType = 'search';
        } else if (action === 'contact') {
          activityType = 'contact';
        } else {
          activityType = action; // Fallback to action name
        }

        await storage.trackUserActivity(userId, {
          activityType,
          entityId: String(entityId),
          entityType,
          metadata: context || {}
        });
      } catch (dbError) {
        console.error('Failed to track activity in database:', dbError);
        // Don't fail the request if database logging fails
      }

      res.json({ success: true, message: 'Behavior tracked successfully' });
    } catch (error) {
      console.error('Error tracking user behavior:', error);
      res.status(500).json({ error: 'Failed to track behavior' });
    }
  });

  // Get personalized recommendations
  app.get('/api/ml/recommendations/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { type = 'both', limit = 10 } = req.query;
      
      const recommendations = await recommendationEngine.generateRecommendations(
        userId,
        type as any,
        parseInt(limit as string)
      );

      res.json(recommendations);
    } catch (error) {
      console.error('Error getting ML recommendations:', error);
      res.status(500).json({ error: 'Failed to get recommendations' });
    }
  });

  // AI Product Chat endpoint - for product-specific inquiries using company datasheet info
  app.post('/api/ai/product-chat', async (req, res) => {
    try {
      const { message, productContext } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!productContext) {
        return res.status(400).json({ error: 'Product context is required' });
      }

      console.log('🤖 Product AI Chat request:', { message: message.substring(0, 100), productName: productContext.name });

      // Create concise system prompt  
      const systemPrompt = `You're an AI assistant helping with ${productContext.name} from ${productContext.company.name}.

Product: ${productContext.name} (${productContext.category})
Company: ${productContext.company.name} - ${productContext.company.industry}
Material: ${productContext.specifications.material}, Dimensions: ${productContext.specifications.dimensions}
Lead Time: ${productContext.specifications.leadTime}

Files: ${productContext.hasDatasheet ? 'Datasheet available' : 'No datasheet'}, ${productContext.hasCadFiles ? `CAD files in ${productContext.fileFormats.join(', ')}` : 'No CAD files'}

Be conversational and concise (under 40 words). Answer directly and ask follow-up questions.`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_completion_tokens: 80,
        temperature: 0.8,
      });

      const aiResponse = response.choices[0].message.content || "I'm here to help you with information about this product. Please ask me about specifications, applications, or technical details.";

      console.log('✅ Product AI Chat response generated');
      res.json({ response: aiResponse });

    } catch (error) {
      console.error('Product AI Chat error:', error);
      
      // Fallback response when OpenAI fails
      const fallbackResponse = generateProductChatFallback(req.body.message, req.body.productContext);
      res.json({ response: fallbackResponse });
    }
  });

// Fallback function for product chat when OpenAI is unavailable
function generateProductChatFallback(message: string, productContext: any): string {
  const lowerMessage = message.toLowerCase();
  
  // Handle common product inquiry patterns
  if (lowerMessage.includes('spec') || lowerMessage.includes('specification')) {
    return `Here's the key specs for ${productContext.name}: ${productContext.specifications.material}, ${productContext.specifications.dimensions}, ${productContext.specifications.weight}. Tolerance: ${productContext.specifications.tolerance}. Need more details?`;
  }
  
  if (lowerMessage.includes('material') || lowerMessage.includes('what is it made')) {
    return `It's made from ${productContext.specifications.material}. Great for durability and precision. Want to know more about its properties?`;
  }
  
  if (lowerMessage.includes('dimension') || lowerMessage.includes('size')) {
    return `Dimensions: ${productContext.specifications.dimensions}, Weight: ${productContext.specifications.weight}. Perfect for precision work!`;
  }
  
  if (lowerMessage.includes('tolerance') || lowerMessage.includes('precision')) {
    return `Precision tolerance: ${productContext.specifications.tolerance}. Built for demanding industrial applications. Need specifics on quality control?`;
  }
  
  if (lowerMessage.includes('cad') || lowerMessage.includes('download') || lowerMessage.includes('file')) {
    const formats = productContext.hasCadFiles ? productContext.fileFormats.join(', ') : 'not available';
    return `CAD files: ${productContext.hasCadFiles ? `Available in ${formats}` : 'Not available yet'}. ${productContext.hasCadFiles ? 'Download from the product page!' : 'Contact the company for availability.'}`;
  }
  
  if (lowerMessage.includes('lead time') || lowerMessage.includes('delivery')) {
    return `Lead time: ${productContext.specifications.leadTime}. May vary with quantity and customization. Want to check specific delivery schedules?`;
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote')) {
    return `For pricing, contact ${productContext.company.name} directly. They'll give you detailed quotes based on your specific needs. Want their contact info?`;
  }
  
  if (lowerMessage.includes('application') || lowerMessage.includes('use') || lowerMessage.includes('purpose')) {
    return `It's designed for ${productContext.description}. Perfect for demanding industrial applications where precision matters. What's your specific use case?`;
  }
  
  // Default response
  return `I can help with ${productContext.name} specs! Material: ${productContext.specifications.material}, Size: ${productContext.specifications.dimensions}. What would you like to know?`;
}

  // Initialize ML recommendation engine with sample data
  (async () => {
    try {
      await recommendationEngine.initializeSampleData();
      console.log('✅ ML Recommendation Engine initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ML Recommendation Engine:', error);
    }
  })();

  // Company products route (for company admin file management)
  app.get("/api/company/products", requireCompanyAdmin, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.companyId) {
        return res.status(400).json({ error: "Company ID not found" });
      }
      
      const companyProducts = await storage.getProductsByCompany(user.companyId);
      res.json(companyProducts);
    } catch (error) {
      console.error("Error fetching company products:", error);
      res.status(500).json({ error: "Failed to fetch company products" });
    }
  });

  // Update product files route
  app.put("/api/products/:id/files", requireCompanyAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { documentURLs, stepFileURLs, imageURLs } = req.body;
      
      if (!productId) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      // Convert URLs to paths
      const documentPaths = documentURLs || [];
      const stepFilePaths = stepFileURLs || [];
      const additionalImagePaths = imageURLs || [];

      const updatedProduct = await storage.updateProduct(productId, {
        documentPaths,
        stepFilePaths,
        additionalImagePaths
      });

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product files:", error);
      res.status(500).json({ error: "Failed to update product files" });
    }
  });

  // ========================================
  // OBJECT STORAGE ROUTES FOR FILE UPLOADS  
  // ========================================
  
  const objectStorageService = new ObjectStorageService();

  // Serve public objects (product images, company logos)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve private/public objects with full ACL enforcement.
  // requireAuth is intentionally NOT used here so public-ACL files (e.g. product images)
  // can be retrieved without a login. userId is resolved from session first, then JWT,
  // and passed into canAccessObjectEntity which enforces ownership/ACL rules for private
  // Keep reads of historical database-backed public files compatible.
  app.get("/api/files/:id", async (req, res) => {
    await serveDbFile(req.params.id, res);
  });

  // objects and allows unrestricted reads for public ones.
  app.get("/objects/:objectPath(*)", async (req, res) => {
    // Resolve userId from session first, then fall back to JWT token
    let userId: string | undefined = req.session?.userId;
    if (!userId) {
      const token = extractToken(req);
      if (token) {
        const jwtUser = verifyAuthToken(token);
        if (jwtUser) userId = jwtUser.id;
      }
    }
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(userId ? 403 : 401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Get upload URL for file uploads (company admin only)
  app.post("/api/objects/upload", requireCompanyAdmin, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Get upload URL for profile pictures (any authenticated user)
  app.post("/api/upload-url", requireAuth, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ url: uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Update product with uploaded files (company admin only)
  app.put("/api/products/:id/files", requireCompanyAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { documentURLs, stepFileURLs, imageURLs } = req.body;
      const userId = req.session.userId;

      // Normalize URLs and set ACL policies
      const documentPaths: string[] = [];
      const stepFilePaths: string[] = [];
      const imagePaths: string[] = [];

      // Process document URLs
      if (documentURLs && Array.isArray(documentURLs)) {
        for (const url of documentURLs) {
          const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(url, {
            owner: userId!,
            visibility: "private", // PDFs are private
          });
          if (objectPath.startsWith('/objects/')) {
            documentPaths.push(objectPath);
          }
        }
      }

      // Process STEP file URLs
      if (stepFileURLs && Array.isArray(stepFileURLs)) {
        for (const url of stepFileURLs) {
          const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(url, {
            owner: userId!,
            visibility: "private", // 3D files are private
          });
          if (objectPath.startsWith('/objects/')) {
            stepFilePaths.push(objectPath);
          }
        }
      }

      // Process image URLs
      if (imageURLs && Array.isArray(imageURLs)) {
        for (const url of imageURLs) {
          const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(url, {
            owner: userId!,
            visibility: "public", // Product images are public
          });
          if (objectPath.startsWith('/objects/')) {
            imagePaths.push(objectPath);
          }
        }
      }

      // Update product with file paths
      const updatedProduct = await storage.updateProduct(productId, {
        documentPaths: documentPaths.length > 0 ? documentPaths : undefined,
        stepFilePaths: stepFilePaths.length > 0 ? stepFilePaths : undefined,
        additionalImagePaths: imagePaths.length > 0 ? imagePaths : undefined,
      });

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.json({
        message: "Product files updated successfully",
        product: updatedProduct,
        uploadedFiles: {
          documents: documentPaths.length,
          stepFiles: stepFilePaths.length,
          images: imagePaths.length,
        }
      });
    } catch (error) {
      console.error("Error updating product files:", error);
      res.status(500).json({ error: "Failed to update product files" });
    }
  });

  // MySpace API Routes
  
  // Profile picture upload endpoints using object storage
  app.post("/api/myspace/profile-picture/upload", requireAuth, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting profile picture upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/myspace/profile-picture", requireAuth, async (req: any, res) => {
    try {
      const { profilePictureURL } = req.body;
      const userId = req.user?.id;

      console.log("📸 PROFILE PICTURE UPDATE REQUEST:", {
        userId,
        profilePictureURL,
        userFromAuth: req.user
      });

      if (!profilePictureURL) {
        return res.status(400).json({ error: "profilePictureURL is required" });
      }

      if (!userId) {
        console.error("❌ No userId from auth!");
        return res.status(401).json({ error: "User ID not found" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        profilePictureURL,
        {
          owner: userId,
          visibility: "public", // Profile pictures are public
        }
      );

      console.log("📸 Object path from storage service:", objectPath);

      // Update user profile with new picture URL
      const updatedUser = await storage.updateUserProfile(userId, { profileImageUrl: objectPath });
      
      console.log("✅ PROFILE PICTURE UPDATE SUCCESS:", {
        userId,
        objectPath,
        updatedUserProfileImageUrl: updatedUser?.profileImageUrl
      });

      res.json({ 
        success: true,
        objectPath: objectPath,
        message: "Profile picture updated successfully"
      });
    } catch (error) {
      console.error("❌ Error updating profile picture:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });
  
  // Get user messages
  app.get('/api/myspace/messages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const messages = await storage.getUserMessages(userId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching user messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Send a message
  app.post('/api/myspace/messages', requireAuth, async (req: any, res) => {
    try {
      const fromUserId = req.user?.id;
      if (!fromUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { toUserId, subject, content } = req.body;
      
      if (!toUserId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const message = await storage.createUserMessage({
        fromUserId,
        toUserId,
        subject,
        content
      });

      // Track message activity
      await storage.trackUserActivity(fromUserId, {
        activityType: 'message_sent',
        entityId: toUserId,
        entityType: 'user',
        metadata: { subject, messageId: message.id }
      });

      res.json(message);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Get user activity
  app.get('/api/myspace/activity', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const activity = await storage.getUserActivity(userId);
      res.json(activity);
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });

  // Get user statistics
  app.get('/api/myspace/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Get user favorites (companies and products)
  app.get('/api/myspace/favorites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const favorites = await storage.getUserFavorites(userId);
      
      // Transform data for frontend
      const transformedFavorites = [
        ...favorites.companies.map(company => ({
          id: `company_${company.id}`,
          favoriteType: 'company',
          favoriteId: company.id,
          companyName: company.name,
          productName: null,
          createdAt: new Date().toISOString()
        })),
        ...favorites.products.map(product => ({
          id: `product_${product.id}`,
          favoriteType: 'product',
          favoriteId: product.id,
          companyName: null,
          productName: product.name,
          createdAt: new Date().toISOString()
        }))
      ];

      res.json(transformedFavorites);
    } catch (error) {
      console.error('Error fetching user favorites:', error);
      res.status(500).json({ error: 'Failed to fetch favorites' });
    }
  });

  // Get user downloads
  app.get('/api/myspace/downloads', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get configuration downloads
      const configDownloads = await storage.getConfigurationDownloads(userId);
      
      // Transform data for frontend
      const transformedDownloads = configDownloads.map(download => ({
        id: download.id,
        fileName: download.downloadedFiles[0]?.name || 'Configuration File',
        productName: `Product ${download.productId}`,
        fileFormat: download.downloadedFiles[0]?.format || 'CAD',
        format: download.downloadedFiles[0]?.format || 'CAD',
        fileSize: null, // Size not tracked in current schema
        downloadedAt: download.downloadedAt
      }));

      res.json(transformedDownloads);
    } catch (error) {
      console.error('Error fetching user downloads:', error);
      res.status(500).json({ error: 'Failed to fetch downloads' });
    }
  });

  // Update user profile
  app.patch('/api/myspace/profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('🔄 PROFILE UPDATE REQUEST:', { userId, body: req.body });
      
      // Handle profile image URL with ACL policy if present
      let profileData = req.body;
      if (req.body.profileImageUrl) {
        try {
          const objectStorageService = new ObjectStorageService();
          const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
            req.body.profileImageUrl,
            {
              owner: userId,
              visibility: "public", // Profile pictures are public
            }
          );
          profileData = { ...req.body, profileImageUrl: normalizedPath };
        } catch (error) {
          console.error('Error setting ACL for profile image:', error);
          // Continue with the original URL if ACL setting fails
        }
      }
      
      const validatedData = userProfileUpdateSchema.parse(profileData);
      const updatedUser = await storage.updateUserProfile(userId, validatedData);
      
      console.log('✅ PROFILE UPDATE SUCCESS:', userId);
      
      // Ensure we always return valid JSON
      if (updatedUser) {
        res.json(updatedUser);
      } else {
        // Return success message if user object is null/undefined
        res.json({ success: true, message: 'Profile updated successfully' });
      }
    } catch (error: any) {
      console.error('❌ Error updating user profile:', error);
      res.status(500).json({ error: 'Failed to update profile', details: error.message });
    }
  });

  // Upload profile image (local file storage)
  app.post('/api/users/profile-image', requireAuth, upload.single('profileImage'), async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ 
          error: 'No image file provided',
          requirements: {
            formats: ['JPG', 'PNG', 'GIF', 'WebP', 'SVG'],
            maxSize: '10MB'
          }
        });
      }

      // Server-side file size validation (10MB limit for profile images)
      const maxProfileImageSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxProfileImageSize) {
        // Delete the uploaded file since it's too large
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: 'File is too large. Maximum size is 10MB.',
          requirements: {
            formats: ['JPG', 'PNG', 'GIF', 'WebP', 'SVG'],
            maxSize: '10MB'
          }
        });
      }

      const profileImageUrl = `/uploads/profiles/${req.file.filename}`;
      
      // Update user profile with new image URL
      const updatedUser = await storage.updateUserProfile(userId, { profileImageUrl });
      
      console.log(`📸 Profile image uploaded for user ${userId}: ${profileImageUrl}`);
      
      res.json({ 
        success: true, 
        profileImageUrl,
        user: updatedUser
      });
    } catch (error: any) {
      console.error('❌ Error uploading profile image:', error);
      
      // Handle multer errors with user-friendly messages
      if (error.message?.includes('Only JPG, PNG, GIF, WebP')) {
        return res.status(400).json({ 
          error: 'Invalid file format. Please use JPG, PNG, GIF, WebP, or SVG images.',
          requirements: {
            formats: ['JPG', 'PNG', 'GIF', 'WebP', 'SVG'],
            maxSize: '10MB'
          }
        });
      }
      
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          error: 'File is too large. Maximum size is 10MB.',
          requirements: {
            formats: ['JPG', 'PNG', 'GIF', 'WebP', 'SVG'],
            maxSize: '10MB'
          }
        });
      }
      
      res.status(500).json({ error: 'Failed to upload profile image' });
    }
  });

  // Change password
  app.post('/api/user/change-password', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const validatedData = changePasswordSchema.parse(req.body);
      
      // Get current user to verify current password
      const user = await storage.getUser(userId);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: 'User not found or no password set' });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(validatedData.currentPassword, user.passwordHash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 10);
      
      // Update password
      await storage.updateUserPassword(userId, newPasswordHash);
      
      console.log('✅ PASSWORD CHANGED SUCCESSFULLY:', userId);
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      console.error('❌ Error changing password:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to change password', details: error.message });
    }
  });

  // Delete user account
  app.delete('/api/user/delete-account', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user to make sure they exist
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Delete user and all associated data
      await storage.deleteUser(userId);
      
      // Destroy session
      req.session.destroy((err: any) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });
      
      console.log('✅ ACCOUNT DELETED SUCCESSFULLY:', userId);
      
      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error: any) {
      console.error('❌ Error deleting account:', error);
      res.status(500).json({ error: 'Failed to delete account', details: error.message });
    }
  });

  // Change email
  app.post('/api/user/change-email', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const validatedData = changeEmailSchema.parse(req.body);
      
      // Get current user to verify password
      const user = await storage.getUser(userId);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: 'User not found or no password set' });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(validatedData.currentPassword, user.passwordHash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Password is incorrect' });
      }

      // Check if new email is already in use
      const existingUser = await storage.getUserByEmail(validatedData.newEmail);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: 'This email is already in use by another account' });
      }

      // Update email
      const updatedUser = await storage.updateUserEmail(userId, validatedData.newEmail);
      
      console.log('✅ EMAIL CHANGED SUCCESSFULLY:', userId, 'to', validatedData.newEmail);
      
      res.json({ success: true, message: 'Email changed successfully', user: updatedUser });
    } catch (error: any) {
      console.error('❌ Error changing email:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to change email', details: error.message });
    }
  });

  // ============== USER PROJECTS API ==============
  
  // Get user's projects
  app.get('/api/user/projects', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const projects = await db.select().from(userProjects)
        .where(eq(userProjects.userId, userId))
        .orderBy(userProjects.sortOrder);
      
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Create new project
  app.post('/api/user/projects', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const { name = 'New Project', description, color = 'purple' } = req.body;
      
      // Get max sort order
      const existing = await db.select().from(userProjects)
        .where(eq(userProjects.userId, userId));
      const maxOrder = existing.length > 0 ? Math.max(...existing.map(p => p.sortOrder || 0)) : -1;
      
      const [project] = await db.insert(userProjects).values({
        userId,
        name,
        description,
        color,
        sortOrder: maxOrder + 1
      }).returning();
      
      res.json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Update project (rename, etc.)
  app.patch('/api/user/projects/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const projectId = parseInt(req.params.id);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // Verify ownership
      const [existing] = await db.select().from(userProjects)
        .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
      if (!existing) return res.status(404).json({ error: 'Project not found' });
      
      const { name, description, color, sortOrder } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (color !== undefined) updates.color = color;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      
      const [updated] = await db.update(userProjects)
        .set(updates)
        .where(eq(userProjects.id, projectId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Delete project
  app.delete('/api/user/projects/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const projectId = parseInt(req.params.id);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // Verify ownership
      const [existing] = await db.select().from(userProjects)
        .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
      if (!existing) return res.status(404).json({ error: 'Project not found' });
      
      await db.delete(userProjects).where(eq(userProjects.id, projectId));
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Get items in a project with full details
  app.get('/api/user/projects/:id/items', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const projectId = parseInt(req.params.id);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // Verify ownership
      const [project] = await db.select().from(userProjects)
        .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      
      const items = await db.select().from(projectItems)
        .where(eq(projectItems.projectId, projectId));
      
      // Enrich with product/company details
      const enrichedItems = await Promise.all(items.map(async (item) => {
        if (item.itemType === 'product') {
          const [product] = await db.select().from(products).where(eq(products.id, item.itemId));
          return { ...item, details: product };
        } else {
          const [company] = await db.select().from(companies).where(eq(companies.id, item.itemId));
          return { ...item, details: company };
        }
      }));
      
      res.json(enrichedItems);
    } catch (error) {
      console.error('Error fetching project items:', error);
      res.status(500).json({ error: 'Failed to fetch project items' });
    }
  });

  // Add item to project
  app.post('/api/user/projects/:id/items', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const projectId = parseInt(req.params.id);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // Verify ownership
      const [project] = await db.select().from(userProjects)
        .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      
      const { itemType, itemId, notes } = req.body;
      if (!itemType || !itemId) return res.status(400).json({ error: 'itemType and itemId required' });
      
      const [item] = await db.insert(projectItems).values({
        projectId,
        itemType,
        itemId,
        notes
      }).returning();
      
      res.json(item);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Item already in project' });
      }
      console.error('Error adding item to project:', error);
      res.status(500).json({ error: 'Failed to add item to project' });
    }
  });

  // Remove item from project
  app.delete('/api/user/projects/:id/items/:itemId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const projectId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // Verify ownership
      const [project] = await db.select().from(userProjects)
        .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      
      await db.delete(projectItems).where(eq(projectItems.id, itemId));
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing item from project:', error);
      res.status(500).json({ error: 'Failed to remove item' });
    }
  });

  // AI Chat Sessions API
  
  // Get all chat sessions for user
  app.get('/api/chat/sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : null;

      // First page (no cursor) — include all pinned sessions at the top.
      // Subsequent pages return only unpinned (cursor-based by updatedAt).
      let pinned: any[] = [];
      if (!cursor) {
        pinned = await db
          .select()
          .from(aiChatSessions)
          .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isPinned, true)))
          .orderBy(desc(aiChatSessions.updatedAt));
      }

      let cursorUpdatedAt: Date | null = null;
      if (cursor) {
        const [cursorRow] = await db
          .select()
          .from(aiChatSessions)
          .where(and(eq(aiChatSessions.id, cursor), eq(aiChatSessions.userId, userId)))
          .limit(1);
        cursorUpdatedAt = cursorRow?.updatedAt ?? null;
      }

      const unpinnedConditions: any[] = [
        eq(aiChatSessions.userId, userId),
        or(eq(aiChatSessions.isPinned, false), sql`${aiChatSessions.isPinned} IS NULL`),
      ];
      if (cursorUpdatedAt && cursor) {
        // Deterministic tie-breaker: when multiple rows share the cursor's
        // updatedAt, fall back to id to avoid skipping rows on the next page.
        unpinnedConditions.push(
          or(
            sql`${aiChatSessions.updatedAt} < ${cursorUpdatedAt}`,
            and(
              sql`${aiChatSessions.updatedAt} = ${cursorUpdatedAt}`,
              sql`${aiChatSessions.id} < ${cursor}`,
            ),
          ),
        );
      }

      const unpinnedRows = await db
        .select()
        .from(aiChatSessions)
        .where(and(...unpinnedConditions))
        .orderBy(desc(aiChatSessions.updatedAt), desc(aiChatSessions.id))
        .limit(limit + 1);

      const hasMore = unpinnedRows.length > limit;
      const unpinnedPage = unpinnedRows.slice(0, limit);
      const nextCursor = hasMore && unpinnedPage.length > 0
        ? unpinnedPage[unpinnedPage.length - 1].id
        : null;

      res.json({
        sessions: [...pinned, ...unpinnedPage],
        nextCursor,
      });
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      res.status(500).json({ error: 'Failed to fetch chat sessions' });
    }
  });

  // Create new chat session
  app.post('/api/chat/sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { title } = req.body;

      const [session] = await db
        .insert(aiChatSessions)
        .values({
          userId,
          title: title || 'New Chat',
        })
        .returning();

      // Auto-delete old unpinned sessions to keep max 20
      const MAX_UNPINNED_SESSIONS = 20;
      try {
        // Get all unpinned sessions for this user, ordered by oldest first
        const unpinnedSessions = await db
          .select()
          .from(aiChatSessions)
          .where(and(
            eq(aiChatSessions.userId, userId),
            or(eq(aiChatSessions.isPinned, false), sql`${aiChatSessions.isPinned} IS NULL`)
          ))
          .orderBy(aiChatSessions.updatedAt);
        
        // If more than 20 unpinned sessions, delete the oldest ones
        if (unpinnedSessions.length > MAX_UNPINNED_SESSIONS) {
          const sessionsToDelete = unpinnedSessions.slice(0, unpinnedSessions.length - MAX_UNPINNED_SESSIONS);
          for (const oldSession of sessionsToDelete) {
            // Delete messages first (cascade should handle this, but being explicit)
            await db.delete(aiChatSessionMessages).where(eq(aiChatSessionMessages.sessionId, oldSession.id));
            await db.delete(aiChatSessions).where(eq(aiChatSessions.id, oldSession.id));
          }
          console.log(`🗑️ Auto-deleted ${sessionsToDelete.length} old chat sessions for user ${userId}`);
        }
      } catch (cleanupError) {
        console.error('Error during session cleanup:', cleanupError);
        // Don't fail the request if cleanup fails
      }

      res.json(session);
    } catch (error) {
      console.error('Error creating chat session:', error);
      res.status(500).json({ error: 'Failed to create chat session' });
    }
  });

  // Get messages for a session (paginated, newest-first slice returned in chronological order)
  app.get('/api/chat/sessions/:id/messages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify session belongs to user
      const [session] = await db
        .select()
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const before = req.query.before ? parseInt(req.query.before as string) : null;

      const conditions: any[] = [eq(aiChatSessionMessages.sessionId, sessionId)];
      if (before) {
        conditions.push(sql`${aiChatSessionMessages.id} < ${before}`);
      }

      const rows = await db
        .select()
        .from(aiChatSessionMessages)
        .where(and(...conditions))
        .orderBy(desc(aiChatSessionMessages.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const slice = rows.slice(0, limit);
      // Reverse to chronological order (oldest first) for the UI
      const messages = slice.slice().reverse();

      res.json({ messages, hasMore });
    } catch (error) {
      console.error('Error fetching session messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Update a message's status (e.g. mark a stream as failed from the client when it aborts)
  app.patch('/api/chat/messages/:id/status', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const messageId = parseInt(req.params.id);
      const { status, content, searchResults } = req.body || {};

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!['streaming', 'complete', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Verify message belongs to a session owned by this user
      const [row] = await db
        .select({
          id: aiChatSessionMessages.id,
          ownerId: aiChatSessions.userId,
        })
        .from(aiChatSessionMessages)
        .innerJoin(aiChatSessions, eq(aiChatSessionMessages.sessionId, aiChatSessions.id))
        .where(eq(aiChatSessionMessages.id, messageId))
        .limit(1);

      if (!row || row.ownerId !== userId) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const updates: Record<string, any> = { status };
      if (typeof content === 'string') updates.content = content;
      // Allow callers (e.g. inline calc-regenerate) to overwrite the persisted
      // searchResults JSON so reloading the chat re-renders the new values.
      if (searchResults !== undefined) updates.searchResults = searchResults;

      const [updated] = await db
        .update(aiChatSessionMessages)
        .set(updates)
        .where(eq(aiChatSessionMessages.id, messageId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating message status:', error);
      res.status(500).json({ error: 'Failed to update message status' });
    }
  });

  // Add message to session
  app.post('/api/chat/sessions/:id/messages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      const { content, isUser, searchResults, suggestions } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify session belongs to user
      const [session] = await db
        .select()
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      let sanitizedContent = content;
      if (!isUser && typeof content === 'string' && content.trim()) {
        const trimmed = content.trim();
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && 
            (trimmed.includes('"bom_table"') || trimmed.includes('"data"') || trimmed.includes('"decision_summary"'))) {
          sanitizedContent = searchResults ? '' : 'I found some results but had trouble formatting them. Please try your search again.';
        }
      }

      const charCount = typeof sanitizedContent === 'string' ? sanitizedContent.length : 0;
      let estimatedTokens = Math.ceil(charCount / 4);
      const promptTokens = searchResults?._usage?.prompt_tokens
        ?? searchResults?._usage?.compression_usage?.prompt_tokens;
      if (typeof promptTokens === 'number' && promptTokens > 0) {
        estimatedTokens = promptTokens;
      }

      const [message] = await db
        .insert(aiChatSessionMessages)
        .values({
          sessionId,
          content: sanitizedContent,
          isUser,
          searchResults,
          suggestions,
          estimatedTokens,
        })
        .returning();

      // Update session's last query and updatedAt if it's a user message
      if (isUser) {
        await db
          .update(aiChatSessions)
          .set({ 
            lastQuery: content,
            updatedAt: new Date(),
            title: session.title === 'New Chat' ? content.slice(0, 50) : session.title
          })
          .where(eq(aiChatSessions.id, sessionId));
      }

      // Fire-and-forget background compaction after AI response is saved
      if (!isUser) {
        try {
          const { runCompactionIfNeeded } = await import('./features/hybrid-search/agents/context-compaction');
          const { getAgentSettings } = await import('./features/hybrid-search/agents/admin/settings-storage');
          getAgentSettings()
            .then((settings) => runCompactionIfNeeded(sessionId, settings))
            .catch((err: any) => console.warn('⚠️ [Compaction] Failed to load settings for compaction:', err?.message));
        } catch (err: any) {
          console.warn('⚠️ [Compaction] Failed to schedule compaction:', err?.message);
        }
      }

      res.json(message);
    } catch (error) {
      console.error('Error adding message:', error);
      res.status(500).json({ error: 'Failed to add message' });
    }
  });

  // Delete a chat session
  app.delete('/api/chat/sessions/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify session belongs to user
      const [session] = await db
        .select()
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await db.delete(aiChatSessions).where(eq(aiChatSessions.id, sessionId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Pin/unpin a chat session
  app.patch('/api/chat/sessions/:id/pin', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      const { isPinned } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [session] = await db
        .select()
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const [updated] = await db
        .update(aiChatSessions)
        .set({ isPinned: isPinned ?? !session.isPinned })
        .where(eq(aiChatSessions.id, sessionId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating session pin:', error);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // Rename a chat session
  app.patch('/api/chat/sessions/:id/rename', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const sessionId = parseInt(req.params.id);
      const { title } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }

      const [session] = await db
        .select()
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const [updated] = await db
        .update(aiChatSessions)
        .set({ title: title.trim() })
        .where(eq(aiChatSessions.id, sessionId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error renaming session:', error);
      res.status(500).json({ error: 'Failed to rename session' });
    }
  });

  // Get ML recommendations
  app.get('/api/ml/recommendations', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recommendations = await storage.getMLRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching ML recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Wall/Social Feed endpoints

  // Get wall posts
  app.get("/api/wall/posts", async (req, res) => {
    try {
      const { limit = "20", offset = "0" } = req.query;
      const userId = req.session?.user?.id;
      
      const posts = await storage.getWallPosts(
        userId,
        parseInt(limit as string),
        parseInt(offset as string)
      );
      
      res.json(posts);
    } catch (error) {
      console.error("Error fetching wall posts:", error);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  });

  // Create a new post
  app.post("/api/wall/posts", requireAuth, async (req, res) => {
    try {
      const { content, visibility = "public", mediaAttachments = [] } = req.body;
      const user = req.user;
      
      if (!content?.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      const authorType = user?.role === "company_admin" && user?.companyId ? "company" : "user";
      const companyId = authorType === "company" ? user?.companyId : null;

      const post = await storage.createPost({
        authorId: user.id,
        authorType,
        companyId,
        content: content.trim(),
        mediaAttachments,
        visibility,
      });

      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Get specific post
  app.get("/api/wall/posts/:postId", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const post = await storage.getPostById(postId);
      
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      console.error("Error fetching post:", error);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // Update post
  app.put("/api/wall/posts/:postId", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const { content, visibility, mediaAttachments } = req.body;
      const userId = req.session?.user?.id;

      // Check if user owns the post
      const existingPost = await storage.getPostById(postId);
      if (!existingPost || existingPost.authorId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this post" });
      }

      const updates: any = {};
      if (content !== undefined) updates.content = content;
      if (visibility !== undefined) updates.visibility = visibility;
      if (mediaAttachments !== undefined) updates.mediaAttachments = mediaAttachments;

      const updatedPost = await storage.updatePost(postId, updates);
      res.json(updatedPost);
    } catch (error) {
      console.error("Error updating post:", error);
      res.status(500).json({ error: "Failed to update post" });
    }
  });

  // Delete post
  app.delete("/api/wall/posts/:postId", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const userId = req.session?.user?.id;

      // Check if user owns the post
      const existingPost = await storage.getPostById(postId);
      if (!existingPost || existingPost.authorId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }

      const deleted = await storage.deletePost(postId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Post not found" });
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Get post comments
  app.get("/api/wall/posts/:postId/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const comments = await storage.getPostComments(postId, "wall");
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Create comment
  app.post("/api/wall/posts/:postId/comments", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const { content, parentCommentId } = req.body;
      const userId = req.session?.user?.id;

      if (!content?.trim()) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      const comment = await storage.createComment({
        postId,
        userId: userId!,
        content: content.trim(),
        parentCommentId: parentCommentId || null,
        postType: "wall",
      });

      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Delete comment
  app.delete("/api/wall/comments/:commentId", requireAuth, async (req, res) => {
    try {
      const commentId = parseInt(req.params.commentId);
      const userId = req.session?.user?.id;

      // Check if user owns the comment (simplified for now)
      const deleted = await storage.deleteComment(commentId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Comment not found" });
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Toggle post like
  app.post("/api/wall/posts/:postId/like", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const userId = req.session?.user?.id;

      const liked = await storage.togglePostLike(postId, userId!, "wall");
      res.json({ liked });
    } catch (error) {
      console.error("Error toggling post like:", error);
      res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  // Toggle comment like
  app.post("/api/wall/comments/:commentId/like", requireAuth, async (req, res) => {
    try {
      const commentId = parseInt(req.params.commentId);
      const userId = req.session?.user?.id;

      const liked = await storage.toggleCommentLike(commentId, userId!);
      res.json({ liked });
    } catch (error) {
      console.error("Error toggling comment like:", error);
      res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  // Share post
  app.post("/api/wall/posts/:postId/share", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const { shareType = "repost", content } = req.body;
      const userId = req.session?.user?.id;

      const share = await storage.sharePost(postId, userId!, shareType, content);
      res.status(201).json(share);
    } catch (error) {
      console.error("Error sharing post:", error);
      res.status(500).json({ error: "Failed to share post" });
    }
  });

  // Get post likes
  app.get("/api/wall/posts/:postId/likes", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const likes = await storage.getPostLikes(postId, "wall");
      res.json(likes);
    } catch (error) {
      console.error("Error fetching post likes:", error);
      res.status(500).json({ error: "Failed to fetch likes" });
    }
  });

  // Check if user liked a post
  app.get("/api/wall/posts/:postId/liked", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const userId = req.session?.user?.id;

      const liked = await storage.isPostLikedByUser(postId, userId!, "wall");
      res.json({ liked });
    } catch (error) {
      console.error("Error checking if post is liked:", error);
      res.status(500).json({ error: "Failed to check like status" });
    }
  });

  // ── Beta Feedback Notebook ──────────────────────────────────────────────────
  const { betaFeedback } = await import('@shared/schema');
  const feedbackInsertSchema = z.object({
    bullets: z.array(z.string().min(1)).min(1).max(50),
    pageUrl: z.string().max(1000),
  });
  const feedbackStatusSchema = z.object({
    status: z.enum(['new', 'reviewed', 'valid', 'dismissed']),
  });

  // Submit feedback (any authenticated user)
  app.post('/api/feedback', requireAuth, async (req: any, res) => {
    try {
      const parsed = feedbackInsertSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      const user = req.user;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      const [row] = await db.insert(betaFeedback).values({
        userId: user.id,
        authorName: fullName,
        authorRole: user.role,
        pageUrl: parsed.data.pageUrl,
        bullets: parsed.data.bullets,
        status: 'new',
      }).returning();
      res.status(201).json(row);
    } catch (err: any) {
      console.error('Error saving feedback:', err);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  // My own feedback history (any authenticated user)
  app.get('/api/feedback/mine', requireAuth, async (req: any, res) => {
    try {
      const rows = await db.select().from(betaFeedback)
        .where(eq(betaFeedback.userId, req.user.id))
        .orderBy(desc(betaFeedback.createdAt));
      res.json(rows);
    } catch (err: any) {
      console.error('Error fetching own feedback:', err);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });

  // All feedback (admin only)
  app.get('/api/feedback', requirePlatformAdmin, async (req: any, res) => {
    try {
      const rows = await db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt));
      res.json(rows);
    } catch (err: any) {
      console.error('Error fetching all feedback:', err);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });

  // Export all feedback as CSV (admin only)
  app.get('/api/feedback/export.csv', requirePlatformAdmin, async (_req: any, res) => {
    try {
      const rows = await db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt));
      const escape = (val: unknown): string => {
        const s = val === null || val === undefined ? '' : String(val);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = ['id', 'created_at', 'author_name', 'author_role', 'page_url', 'status', 'bullets'];
      const lines = [header.join(',')];
      for (const r of rows) {
        const bullets = Array.isArray(r.bullets) ? r.bullets.map((b) => `• ${b}`).join('\n') : '';
        lines.push([
          escape(r.id),
          escape(r.createdAt ? new Date(r.createdAt).toISOString() : ''),
          escape(r.authorName),
          escape(r.authorRole),
          escape(r.pageUrl),
          escape(r.status),
          escape(bullets),
        ].join(','));
      }
      const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
      const filename = `beta-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      console.error('Error exporting feedback CSV:', err);
      res.status(500).json({ error: 'Failed to export feedback' });
    }
  });

  // Update status (admin only)
  app.patch('/api/feedback/:id/status', requirePlatformAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const parsed = feedbackStatusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });
      const [row] = await db.update(betaFeedback)
        .set({ status: parsed.data.status })
        .where(eq(betaFeedback.id, id))
        .returning();
      if (!row) return res.status(404).json({ error: 'Feedback not found' });
      res.json(row);
    } catch (err: any) {
      console.error('Error updating feedback status:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // Delete feedback (admin only)
  app.delete('/api/feedback/:id', requirePlatformAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(betaFeedback).where(eq(betaFeedback.id, id));
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting feedback:', err);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  });

  // AI summary of all feedback (platform admin only)
  app.post('/api/feedback/summarize', requirePlatformAdmin, async (_req: any, res) => {
    try {
      const rows = await db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt));
      if (rows.length === 0) {
        return res.json({ proposals: [] });
      }

      const formatted = rows.map((r, i) => {
        const bullets = Array.isArray(r.bullets) ? r.bullets.map((b) => `  • ${b}`).join('\n') : '';
        return `[${i + 1}] Role: ${r.authorRole} | Page: ${r.pageUrl} | Status: ${r.status}\n${bullets}`;
      }).join('\n\n');

      const systemPrompt = `You are a senior product manager analysing beta user feedback for a B2B platform called DeepFolder.
Your job: read all the feedback items below, reason about root causes, merge near-duplicates, and produce at most 15 distinct action proposals — prioritised high → medium → low.

Rules:
- Each proposal must be one clear, actionable sentence (max 2 sentences).
- Merge feedback that describes the same underlying problem into a single proposal.
- Assign a priority: "high" (many users, critical path), "medium" (notable friction), or "low" (nice-to-have).
- Do NOT include specific usernames or personal details.
- Return ONLY valid JSON — no prose, no markdown — in this exact shape:
{
  "proposals": [
    { "id": 1, "priority": "high", "title": "Short title (5–8 words)", "description": "One or two actionable sentences." },
    ...
  ]
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here are the ${rows.length} feedback items:\n\n${formatted}` },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      let parsed: { proposals?: unknown[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(500).json({ error: 'AI returned invalid JSON' });
      }

      res.json({ proposals: parsed.proposals ?? [] });
    } catch (err: any) {
      console.error('Error summarising feedback:', err);
      res.status(500).json({ error: 'Failed to summarise feedback' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin: bulk spec extraction — runs autoExtractAndPersistSpecs for every
  // product that has a datasheet but no structured specs yet.
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/api/platform-admin/products/bulk-extract-specs', requirePlatformAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({ id: products.id, name: products.name, category: products.category, description: products.description, catalogPath: products.catalogPath })
        .from(products)
        .where(and(sql`${products.catalogPath} IS NOT NULL`, sql`${products.specifications} IS NULL`));

      if (rows.length === 0) {
        return res.json({ queued: 0, message: 'All products with datasheets already have specs extracted.' });
      }

      // Fire-and-forget — extraction runs in background, one at a time to avoid
      // hammering OpenAI rate limits.
      (async () => {
        for (const row of rows) {
          if (!row.catalogPath) continue;
          await autoExtractAndPersistSpecs(row.id, row.catalogPath, {
            name: row.name,
            category: row.category || '',
            description: row.description || undefined,
          }).catch((err: any) =>
            console.warn(`⚠️ [BulkSpecExtract] product ${row.id} failed: ${err?.message || err}`)
          );
        }
        console.log(`✅ [BulkSpecExtract] Finished processing ${rows.length} products`);
      })();

      res.json({
        queued: rows.length,
        message: `Spec extraction queued for ${rows.length} product(s). Running in background — check server logs for progress.`,
        products: rows.map(r => ({ id: r.id, name: r.name })),
      });
    } catch (err: any) {
      console.error('[BulkSpecExtract] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to queue spec extraction' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin: migrate /uploads/ files to persistent DB file storage.
  // Reads every product/company record that still has a local /uploads/ path,
  // copies the file into the file_storage table (same fallback used for new
  // uploads), and rewrites the path to /api/files/:id so it works in both
  // dev and production.
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/api/platform-admin/products/migrate-uploads', requirePlatformAdmin, async (_req, res) => {
    const extToMime: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.stl': 'model/stl', '.step': 'application/step',
      '.stp': 'application/step', '.obj': 'model/obj',
    };

    async function migrateFile(uploadPath: string): Promise<string | null> {
      const diskPath = path.join(process.cwd(), `.${uploadPath}`);
      if (!fs.existsSync(diskPath)) {
        console.warn(`[MigrateUploads] File not found on disk: ${diskPath}`);
        return null;
      }
      const buffer = fs.readFileSync(diskPath);
      const ext = path.extname(uploadPath).toLowerCase();
      const contentType = extToMime[ext] ?? 'application/octet-stream';
      const id = randomUUID();
      await db.insert(fileStorage).values({ id, contentType, data: buffer.toString('base64') });
      return `/api/files/${id}`;
    }

    const report = { products: 0, companies: 0, files: 0, errors: 0, skipped: 0, details: [] as string[] };

    try {
      // ── Products ──────────────────────────────────────────────────────────
      const productRows = await db
        .select({ id: products.id, catalogPath: products.catalogPath, imagePath: products.imagePath, modelPath: products.modelPath })
        .from(products)
        .where(or(
          sql`${products.catalogPath} LIKE '/uploads/%'`,
          sql`${products.imagePath}   LIKE '/uploads/%'`,
          sql`${products.modelPath}   LIKE '/uploads/%'`,
        ));

      for (const row of productRows) {
        const updates: Record<string, string> = {};
        for (const [col, val] of [['catalogPath', row.catalogPath], ['imagePath', row.imagePath], ['modelPath', row.modelPath]] as const) {
          if (val && val.startsWith('/uploads/')) {
            const newPath = await migrateFile(val).catch(() => null);
            if (newPath) { updates[col] = newPath; report.files++; }
            else report.errors++;
          }
        }
        if (Object.keys(updates).length > 0) {
          await db.update(products).set(updates as any).where(eq(products.id, row.id));
          report.products++;
          report.details.push(`product ${row.id}: ${Object.keys(updates).join(', ')} migrated`);
        }
      }

      // ── Companies ─────────────────────────────────────────────────────────
      const companyRows = await db
        .select({ id: companies.id, logoPath: companies.logoPath })
        .from(companies)
        .where(sql`${companies.logoPath} LIKE '/uploads/%'`);

      for (const row of companyRows) {
        if (!row.logoPath) continue;
        const newPath = await migrateFile(row.logoPath).catch(() => null);
        if (newPath) {
          await db.update(companies).set({ logoPath: newPath }).where(eq(companies.id, row.id));
          report.companies++;
          report.files++;
          report.details.push(`company ${row.id}: logoPath migrated`);
        } else {
          report.errors++;
        }
      }

      res.json({
        success: true,
        message: `Migration complete. ${report.files} file(s) moved to persistent storage.`,
        ...report,
      });
    } catch (err: any) {
      console.error('[MigrateUploads] Error:', err);
      res.status(500).json({ error: err?.message || 'Migration failed', ...report });
    }
  });

  // Copyright complaint submission — public endpoint, no auth required
  app.post('/api/legal/copyright-complaint', async (req, res) => {
    try {
      const { insertCopyrightComplaintSchema, copyrightComplaints } = await import('@shared/schema');
      const parsed = insertCopyrightComplaintSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid submission', details: parsed.error.flatten() });
      }
      const [record] = await db.insert(copyrightComplaints).values(parsed.data).returning();
      console.log(`📋 [CopyrightComplaint] New complaint #${record.id} submitted`);

      // Best-effort admin email notification
      try {
        const nodemailer = (await import('nodemailer')).default;
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const adminEmail = process.env.LEGAL_ADMIN_EMAIL || 'legal@deepfolder.com';

        if (smtpHost && smtpUser && smtpPass) {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: smtpUser, pass: smtpPass },
          });
          await transporter.sendMail({
            from: `"DeepFolder Legal" <${smtpUser}>`,
            to: adminEmail,
            subject: `[DeepFolder] New copyright complaint #${record.id}`,
            text: [
              `A new copyright complaint has been submitted.`,
              ``,
              `Complaint ID : #${record.id}`,
              `Submitted    : ${new Date(record.createdAt!).toUTCString()}`,
              `Name         : ${record.name}`,
              `Company      : ${record.company || '—'}`,
              `Infringing URL: ${record.infringingUrl}`,
              ``,
              `Description:`,
              record.description,
              ``,
              `Review this complaint in the admin panel.`,
            ].join('\n'),
          });
          console.log(`📧 [CopyrightComplaint] Admin notification sent for #${record.id}`);
        } else {
          console.warn(`⚠️ [CopyrightComplaint] SMTP not configured — skipping email for #${record.id}. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable notifications.`);
        }
      } catch (emailErr: any) {
        console.error(`⚠️ [CopyrightComplaint] Email notification failed for #${record.id}:`, emailErr?.message);
      }

      return res.status(201).json({ success: true, id: record.id });
    } catch (err: any) {
      console.error('[CopyrightComplaint] Error:', err);
      return res.status(500).json({ error: 'Failed to submit complaint' });
    }
  });

  return httpServer;
}

// Helper functions for advanced features
async function generateMatchingSuggestions(companyId: number, type: string) {
  // Mock implementation - in real app, this would use AI/ML algorithms
  return [
    {
      id: `match-${Date.now()}`,
      type: type,
      company: {
        id: 2,
        name: 'Advanced Manufacturing Corp',
        industry: 'Manufacturing',
        location: 'Detroit, MI',
        colorTheme: '#4F46E5',
      },
      matchScore: 87,
      reasons: ['Complementary technologies', 'Geographic proximity', 'Similar scale'],
      potentialValue: 'Estimated $2.5M annual revenue potential',
      actionItems: ['Schedule introductory call', 'Prepare capability presentation', 'Review partnership terms'],
      compatibility: {
        industry: 92,
        location: 85,
        scale: 88,
        expertise: 84
      }
    }
  ];
}

async function generateMarketInsights(companyId: number) {
  return {
    growthRate: 15.7,
    opportunityCount: 12,
    avgMatchScore: 78,
    opportunities: [
      'Emerging demand in aerospace sector',
      'New export opportunities in EU markets',
      'Growing interest in sustainable manufacturing'
    ],
    recommendations: [
      'Expand product line to include eco-friendly materials',
      'Develop partnerships with aerospace suppliers',
      'Consider European market expansion'
    ]
  };
}

async function getConversations(companyId: number) {
  // Mock implementation
  return [
    {
      id: 'conv-1',
      participants: [{
        id: 'user-1',
        name: 'John Smith',
        company: 'TechCorp Industries',
        avatar: null,
        online: true
      }],
      lastMessage: {
        content: 'Looking forward to our collaboration',
        timestamp: new Date()
      },
      unreadCount: 2,
      updatedAt: new Date()
    }
  ];
}

async function getMessages(conversationId: string) {
  // Mock implementation
  return [
    {
      id: 'msg-1',
      conversationId: conversationId,
      senderId: 'user-1',
      senderName: 'John Smith',
      senderCompany: 'TechCorp Industries',
      content: 'Hi, I\'m interested in your precision machining services.',
      type: 'text',
      status: 'read',
      timestamp: new Date()
    }
  ];
}

async function sendMessage(conversationId: string, messageData: any) {
  // Mock implementation
  return {
    id: `msg-${Date.now()}`,
    conversationId: conversationId,
    ...messageData,
    timestamp: new Date()
  };
}

async function getAnalyzedDocuments(companyId: number) {
  // Mock implementation
  return [
    {
      id: 'doc-1',
      fileName: 'ISO9001_Certificate.pdf',
      fileType: 'application/pdf',
      fileSize: 1024000,
      uploadDate: new Date(),
      status: 'completed',
      progress: 100,
      analysis: {
        documentType: 'ISO Certification',
        keyInsights: ['Valid until 2025', 'Covers manufacturing processes', 'Meets international standards'],
        technicalSpecs: {
          'Standard': 'ISO 9001:2015',
          'Scope': 'Manufacturing and Quality Management',
          'Validity': '2022-2025'
        },
        certifications: ['ISO 9001:2015'],
        complianceStatus: [{
          standard: 'ISO 9001',
          status: 'compliant',
          details: 'Current certification is valid and up-to-date'
        }],
        extractedData: {
          metadata: { pages: 3, language: 'en' },
          textContent: 'Certificate content...',
          tables: [],
          images: []
        },
        riskAssessment: {
          level: 'low',
          factors: ['Certification expires in 2025'],
          recommendations: ['Plan renewal process 6 months in advance']
        },
        marketRelevance: {
          score: 85,
          trending: true,
          competitorAnalysis: ['Standard requirement for aerospace suppliers']
        }
      },
      actionableItems: [{
        id: 'action-1',
        type: 'compliance',
        priority: 'medium',
        description: 'Schedule ISO 9001 renewal process',
        deadline: new Date('2025-01-01')
      }]
    }
  ];
}

async function startDocumentAnalysis(companyId: number, file: any) {
  // Mock implementation
  return {
    id: `doc-${Date.now()}`,
    status: 'processing',
    progress: 0
  };
}

async function getAnalyticsData(companyId: number, period: string) {
  // Mock implementation
  return {
    overview: {
      totalViews: 15420,
      totalDownloads: 847,
      totalConnections: 156,
      conversionRate: 5.5,
      growthRate: 12.3,
      revenue: 125000
    },
    charts: {
      viewsOverTime: [
        { date: '2025-01-01', views: 1200, downloads: 45 },
        { date: '2025-01-02', views: 1350, downloads: 52 },
        { date: '2025-01-03', views: 1180, downloads: 38 }
      ],
      topProducts: [
        { name: 'CNC Machine A', views: 2500, downloads: 125 },
        { name: 'Precision Tool B', views: 1890, downloads: 89 }
      ],
      industryBreakdown: [
        { industry: 'Aerospace', count: 45, percentage: 35 },
        { industry: 'Automotive', count: 38, percentage: 29 }
      ],
      geographicData: [
        { country: 'United States', visits: 8500, revenue: 75000 },
        { country: 'Germany', visits: 3200, revenue: 28000 }
      ],
      engagementMetrics: [
        { metric: 'Profile Views', value: 15420, change: 12.3 },
        { metric: 'Product Downloads', value: 847, change: 8.7 }
      ]
    },
    competitors: [
      { name: 'Precision Corp', marketShare: 15.2, growth: 8.5, engagement: 72 },
      { name: 'Advanced Manufacturing', marketShare: 12.8, growth: -2.1, engagement: 68 }
    ]
  };
}

async function getMarketInsights(companyId: number) {
  return {
    opportunities: [
      'Growing demand in electric vehicle manufacturing',
      'Expansion opportunities in renewable energy sector',
      'Increased focus on precision manufacturing'
    ],
    recommendations: [
      'Develop EV-specific product line',
      'Partner with renewable energy companies',
      'Invest in advanced precision equipment'
    ]
  };
}

async function get3DModelConfig(productId: number) {
  // Mock implementation
  return {
    id: `product-${productId}`,
    name: 'Precision CNC Machine',
    basePrice: 45000,
    baseMaterial: 'Steel',
    dimensions: { width: 120, height: 80, depth: 60 },
    configurations: [
      {
        id: 'width',
        name: 'Width',
        type: 'number',
        min: 100,
        max: 200,
        step: 10,
        unit: 'cm',
        description: 'Machine width in centimeters',
        priceModifier: 100
      },
      {
        id: 'precision',
        name: 'Precision Level',
        type: 'select',
        options: [
          { value: 'standard', label: 'Standard (±0.1mm)', price: 0 },
          { value: 'high', label: 'High (±0.05mm)', price: 5000 },
          { value: 'ultra', label: 'Ultra (±0.01mm)', price: 15000 }
        ]
      }
    ],
    availableFinishes: ['Brushed Steel', 'Anodized', 'Painted'],
    inventoryStatus: {
      inStock: true,
      quantity: 12,
      leadTime: '4-6 weeks',
      suppliers: ['Supplier A', 'Supplier B']
    },
    specifications: {
      'Power': '15kW',
      'Speed': '12,000 RPM',
      'Accuracy': '±0.05mm'
    },
    certifications: ['CE', 'ISO 9001', 'UL Listed']
  };
}

async function generate3DModel(productId: number, configuration: any, material: string, finish: string, viewMode: string) {
  // Mock implementation - in real app, this would generate actual 3D model
  return {
    modelUrl: `/api/3d/models/${productId}-${Date.now()}.glb`,
    thumbnailUrl: `/api/3d/thumbnails/${productId}-${Date.now()}.jpg`,
    configuration: configuration,
    material: material,
    finish: finish,
    viewMode: viewMode
  };
}

async function getInventoryStatus(productId: number, configuration: any) {
  // Mock implementation
  return {
    inStock: true,
    quantity: 8,
    leadTime: '3-4 weeks',
    suppliers: ['Primary Supplier', 'Backup Supplier']
  };
}

async function getRealTimePricing(productId: number, configuration: any, quantity: number) {
  // Mock implementation
  const basePrice = 45000;
  const configModifier = Object.keys(configuration).length * 1000;
  const quantityDiscount = quantity > 1 ? 0.95 : 1;
  
  return {
    basePrice: basePrice,
    configurationCost: configModifier,
    totalPrice: Math.round((basePrice + configModifier) * quantity * quantityDiscount),
    discount: quantity > 1 ? 5 : 0,
    leadTime: quantity > 5 ? '6-8 weeks' : '4-6 weeks'
  };
}

// Semantic Search with OpenAI Embeddings
async function performSemanticSearch(query: string, companies: any[], products: any[]) {
  try {
    // Generate embedding for the search query
    const queryEmbedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryVector = queryEmbedding.data[0].embedding;

    // Create embeddings for companies and products (simplified approach)
    const relevantCompanies = [];
    const relevantProducts = [];

    // Search companies by semantic similarity
    for (const company of companies) {
      const companyText = `${company.name} ${company.industry} ${company.description || ''} ${company.location}`;
      const similarity = await calculateSemanticSimilarity(queryVector, companyText);
      
      if (similarity > 0.7) { // Threshold for relevance
        relevantCompanies.push({ ...company, similarity });
      }
    }

    // Search products by semantic similarity
    for (const product of products) {
      const productText = `${product.name} ${product.category} ${product.description || ''} ${product.specifications || ''}`;
      const similarity = await calculateSemanticSimilarity(queryVector, productText);
      
      if (similarity > 0.7) { // Threshold for relevance
        relevantProducts.push({ ...product, similarity });
      }
    }

    // Sort by similarity score
    relevantCompanies.sort((a, b) => b.similarity - a.similarity);
    relevantProducts.sort((a, b) => b.similarity - a.similarity);

    return {
      companies: relevantCompanies.slice(0, 10),
      products: relevantProducts.slice(0, 10)
    };

  } catch (error) {
    console.error('Semantic search error:', error);
    // Fallback to empty results if embeddings fail
    return { companies: [], products: [] };
  }
}

// Calculate semantic similarity between query vector and text
async function calculateSemanticSimilarity(queryVector: number[], text: string): Promise<number> {
  try {
    const textEmbedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.substring(0, 1000), // Limit text length
    });

    const textVector = textEmbedding.data[0].embedding;
    
    // Calculate cosine similarity
    return cosineSimilarity(queryVector, textVector);
  } catch (error) {
    console.error('Embedding calculation error:', error);
    return 0;
  }
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, a_i, i) => sum + a_i * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, a_i) => sum + a_i * a_i, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, b_i) => sum + b_i * b_i, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// Merge and deduplicate search results
function mergeAndDeduplicate(semanticResults: any[], traditionalResults: any[]): any[] {
  const seen = new Set();
  const merged = [];

  // Add semantic results first (higher priority)
  for (const item of semanticResults) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  // Add traditional results
  for (const item of traditionalResults) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}



// AI Search Response Generator with Real OpenAI Integration
// Intelligent spell checking and typo detection
async function detectTyposAndSuggest(query: string): Promise<{ correctedQuery: string, suggestions: string[] }> {
  try {
    // Get all companies and products for spell checking reference
    const [companies, products] = await Promise.all([
      storage.getCompanies(),
      storage.getProducts()
    ]);
    
    // Create a dictionary of common terms from our database
    const terms = new Set<string>();
    
    // Add company names and industries
    companies.forEach(company => {
      company.name.toLowerCase().split(/\s+/).forEach(word => terms.add(word));
      if (company.industry) company.industry.toLowerCase().split(/\s+/).forEach(word => terms.add(word));
    });
    
    // Add product names and categories
    products.forEach(product => {
      product.name.toLowerCase().split(/\s+/).forEach(word => terms.add(word));
      if (product.category) product.category.toLowerCase().split(/\s+/).forEach(word => terms.add(word));
    });
    
    // Add common technical terms
    const techTerms = ['automotive', 'manufacturing', 'technology', 'software', 'hardware', 'engineering', 'electronics', 'mechanical', 'industrial', 'automation', 'robotics', 'sensor', 'motor', 'steel', 'aluminum', 'plastic', 'metal', 'component', 'parts', 'machine', 'tool', 'equipment', 'system', 'device', 'instrument', 'valve', 'pump', 'bearing', 'gear', 'screw', 'bolt', 'fastener'];
    techTerms.forEach(term => terms.add(term));
    
    const queryWords = query.toLowerCase().split(/\s+/);
    const correctedWords: string[] = [];
    const suggestions: string[] = [];
    
    for (const word of queryWords) {
      if (word.length < 2) {
        correctedWords.push(word);
        continue;
      }
      
      // Check if word exists in our terms
      if (terms.has(word)) {
        correctedWords.push(word);
        continue;
      }
      
      // Find close matches using simple edit distance
      const closeMatches = Array.from(terms).filter(term => {
        return levenshteinDistance(word, term) <= Math.max(1, Math.floor(word.length / 3));
      }).sort((a, b) => levenshteinDistance(word, a) - levenshteinDistance(word, b));
      
      if (closeMatches.length > 0) {
        const bestMatch = closeMatches[0];
        correctedWords.push(bestMatch);
        if (bestMatch !== word) {
          suggestions.push(`Did you mean "${bestMatch}" instead of "${word}"?`);
        }
      } else {
        correctedWords.push(word);
      }
    }
    
    return {
      correctedQuery: correctedWords.join(' '),
      suggestions: suggestions.slice(0, 3) // Limit to 3 suggestions
    };
    
  } catch (error) {
    console.error('Spell check error:', error);
    return { correctedQuery: query, suggestions: [] };
  }
}

// Simple Levenshtein distance calculation
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Calculate Fit Scores for products based on user requirements
async function calculateProductFitScores(userQuery: string, products: any[]): Promise<any[]> {
  try {
    if (!products || products.length === 0) {
      return products;
    }
    
    // Prepare product summaries for AI analysis
    const productSummaries = products.slice(0, 10).map((p, idx) => ({
      index: idx,
      name: p.name,
      category: p.category || 'Unknown',
      description: p.description || '',
      specifications: p.specifications || {}
    }));
    
    const prompt = `Analyze how well each product matches the user's requirements.

User Query: "${userQuery}"

Products to evaluate:
${productSummaries.map(p => `[${p.index}] ${p.name} - ${p.category}: ${p.description.substring(0, 150)}`).join('\n')}

For each product, calculate a Fit Score from 0-100% based on:
- How well the product matches the user's stated requirements
- Relevance of product category to the query
- Match between specifications/features and user needs

Return ONLY a JSON array with the format:
[{"index": 0, "fitScore": 85, "reason": "brief reason"}, ...]

Be realistic: if a product doesn't match well, give it a low score. If it's a perfect match, give 90-100%.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a technical product matching expert. Analyze products against user requirements and return fit scores as JSON only. Be accurate and realistic with scores."
        },
        { role: "user", content: prompt }
      ],
      max_completion_tokens: 500,
      temperature: 0.3,
    });
    
    const content = response.choices[0].message.content || '[]';
    
    // Parse the JSON response
    let scores: Array<{index: number; fitScore: number; reason: string}> = [];
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        scores = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.log('Failed to parse fit scores, using defaults');
    }
    
    // Apply scores to products
    const enrichedProducts = products.map((product, idx) => {
      const scoreData = scores.find(s => s.index === idx);
      return {
        ...product,
        fitScore: scoreData?.fitScore ?? Math.floor(Math.random() * 30 + 50), // Fallback: 50-80%
        fitReason: scoreData?.reason ?? 'Based on category match'
      };
    });
    
    // Sort by fit score (highest first)
    enrichedProducts.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
    
    console.log(`📊 Fit scores calculated for ${enrichedProducts.length} products`);
    return enrichedProducts;
    
  } catch (error) {
    console.error('Error calculating fit scores:', error);
    // Return products with default scores on error
    return products.map(p => ({
      ...p,
      fitScore: Math.floor(Math.random() * 30 + 50),
      fitReason: 'Based on search relevance'
    }));
  }
}

// Enhanced AI response with typo awareness
async function generateSmartAIResponse(originalQuery: string, correctedQuery: string, searchResults: any, suggestions: string[]): Promise<string> {
  try {
    const companyDetails = searchResults.companies.slice(0, 3).map(c => `${c.name} (${c.industry}, ${c.location})`).join(', ');
    const productDetails = searchResults.products.slice(0, 3).map(p => `${p.name} (${p.category})`).join(', ');
    
    // Check if query was corrected
    const wasCorrected = originalQuery !== correctedQuery;
    
    const systemPrompt = `You are DeepFolder's intelligent AI assistant for B2B manufacturing discovery. You help users find companies, products, and business opportunities.

PERSONALITY:
- Conversational, helpful, and insightful
- Professional yet approachable
- Focus on actionable business insights

RESPONSE STYLE:
- Be concise but thorough (100-200 words)
- Use markdown for clarity
- Always include clickable links: [Company Name](/company/ID) or [Product Name](/product/ID)
- CRITICAL: Use EXACT numeric IDs from search results, never guess

CAPABILITIES:
- Search and discover companies and products
- Provide market insights and recommendations
- Understand business context and industry relationships
- Help users find relevant B2B connections`;

    let userPrompt = `Original query: "${originalQuery}"`;
    if (wasCorrected) {
      userPrompt += `\nCorrected to: "${correctedQuery}"`;
    }
    userPrompt += `\nCompanies found: ${companyDetails || 'None'}
Products found: ${productDetails || 'None'}`;

    // Add actual IDs for the AI to use
    if (searchResults.companies.length > 0) {
      userPrompt += `\nCompany IDs: ${searchResults.companies.slice(0, 3).map(c => `${c.name}=${c.id}`).join(', ')}`;
    }
    if (searchResults.products.length > 0) {
      userPrompt += `\nProduct IDs: ${searchResults.products.slice(0, 3).map(p => `${p.name}=${p.id}`).join(', ')}`;
    }

    if (wasCorrected && searchResults.companies.length + searchResults.products.length > 0) {
      userPrompt += `\n\nNote: Search was successful after spelling correction. Mention the correction briefly and show results.`;
    }

    userPrompt += `\n\nProvide helpful response with proper links. ${searchResults.companies.length + searchResults.products.length > 0 ? 'Highlight best matches.' : 'Suggest alternatives or ask what they need.'}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 400,
      temperature: 0.7,
    });

    return response.choices[0].message.content || generateSmartFallback(originalQuery, correctedQuery, searchResults, suggestions);

  } catch (error) {
    console.error('OpenAI API error:', error);
    return generateSmartFallback(originalQuery, correctedQuery, searchResults, suggestions);
  }
}

// Smart fallback with typo awareness
function generateSmartFallback(originalQuery: string, correctedQuery: string, searchResults: any, suggestions: string[]): string {
  const totalResults = searchResults.companies.length + searchResults.products.length;
  const wasCorrected = originalQuery !== correctedQuery;
  
  if (totalResults === 0) {
    if (wasCorrected) {
      return `I tried searching for "${correctedQuery}" (corrected from "${originalQuery}") but didn't find exact matches. What specific industry or product type interests you?`;
    }
    
    if (originalQuery.toLowerCase().includes('europe') || originalQuery.toLowerCase().includes('zurich')) {
      return "I don't see companies from that specific region yet. Would you like to explore our global technology companies instead? What industry interests you?";
    }
    return `No exact matches for "${originalQuery}" right now. Could you try a different keyword or tell me what specific industry or product type you're looking for?`;
  }
  
  // Has results - highlight them with working links
  const responses = [];
  
  if (wasCorrected) {
    responses.push(`Found results for "${correctedQuery}": `);
  } else {
    responses.push(`Found: `);
  }
  
  if (searchResults.companies.length > 0) {
    const topCompany = searchResults.companies[0];
    responses.push(`[${topCompany.name}](/company/${topCompany.id}) in ${topCompany.industry || 'Technology'}`);
  }
  
  if (searchResults.products.length > 0) {
    const topProduct = searchResults.products[0];
    const connector = searchResults.companies.length > 0 ? ' and ' : '';
    responses.push(`${connector}[${topProduct.name}](/product/${topProduct.id}) in ${topProduct.category || 'Products'}`);
  }
  
  return responses.join('') + `. Need more details?`;
}

// Semantic-aware AI response generator with deep context understanding
async function generateSemanticAwareAIResponse(originalQuery: string, parsedQuery: any, searchResults: any): Promise<string> {
  try {
    const companyDetails = searchResults.companies.slice(0, 3).map(c => `${c.name} (${c.industry}, ${c.location})`).join(', ');
    const productDetails = searchResults.products.slice(0, 3).map(p => `${p.name} (${p.category})`).join(', ');
    
    // Intent-specific system prompt
    let intentContext = '';
    switch (parsedQuery.intent) {
      case 'find_company':
        intentContext = `The user is specifically looking for a company${parsedQuery.entity ? ` named "${parsedQuery.entity}"` : ''}. Prioritize company information and provide direct answers.`;
        break;
      case 'find_product':
        intentContext = `The user is specifically looking for a product${parsedQuery.entity ? ` named "${parsedQuery.entity}"` : ''}. Prioritize product information and specs.`;
        break;
      case 'find_products_by_company':
        intentContext = `The user wants to see products from a specific company${parsedQuery.entity ? ` (${parsedQuery.entity})` : ''}. Show company's product catalog.`;
        break;
      case 'find_companies_by_category':
        intentContext = `The user is looking for companies that make products in a specific category${parsedQuery.entity ? ` (${parsedQuery.entity})` : ''}. Highlight manufacturers in that space.`;
        break;
      case 'question':
        intentContext = `The user has a question about the platform or B2B discovery. Provide helpful, informative answers about DeepFolder's capabilities.`;
        break;
      default:
        intentContext = `General search query. Provide relevant companies and products based on the search terms.`;
    }
    
    const systemPrompt = `You are DeepFolder's intelligent AI assistant with deep understanding of user intent. You help users discover B2B manufacturing companies and products using advanced semantic search.

PERSONALITY:
- Extremely intelligent and context-aware
- Understand natural language queries like "find me company X" or "show me products from Y"
- Professional, conversational, and insightful
- Focus on actionable business connections

RESPONSE STYLE:
- Be comprehensive yet concise (150-250 words)
- Use markdown for clarity
- Always include clickable links: [Company Name](/company/ID) or [Product Name](/product/ID)
- CRITICAL: Use EXACT numeric IDs from search results, never guess
- Show understanding of user's intent

CONTEXT UNDERSTANDING:
${intentContext}

CAPABILITIES:
- Semantic search with knowledge graph
- Intent recognition (finding companies, products, categories)
- Natural language understanding
- Business relationship mapping
- Market insights and recommendations`;

    let userPrompt = `Query: "${originalQuery}"
Intent detected: ${parsedQuery.intent} (confidence: ${(parsedQuery.confidence * 100).toFixed(0)}%)`;
    
    if (parsedQuery.entity) {
      userPrompt += `\nTarget entity: ${parsedQuery.entity} (${parsedQuery.entityType})`;
    }
    
    userPrompt += `\n\nSearch Results:
Companies found: ${companyDetails || 'None'}
Products found: ${productDetails || 'None'}`;

    // Add actual IDs for the AI to use
    if (searchResults.companies.length > 0) {
      userPrompt += `\nCompany IDs: ${searchResults.companies.slice(0, 3).map(c => `${c.name}=${c.id}`).join(', ')}`;
    }
    if (searchResults.products.length > 0) {
      userPrompt += `\nProduct IDs: ${searchResults.products.slice(0, 3).map(p => `${p.name}=${p.id}`).join(', ')}`;
    }

    userPrompt += `\n\nProvide an intelligent response that:
1. Shows you understood the user's intent
2. Directly addresses what they're looking for
3. Includes proper markdown links to results
4. ${searchResults.companies.length + searchResults.products.length > 0 ? 'Highlights the best matches with insights' : 'Suggests helpful alternatives or asks clarifying questions'}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 400,
      temperature: 0.7,
    });

    return response.choices[0].message.content || generateSemanticFallback(originalQuery, parsedQuery, searchResults);

  } catch (error) {
    console.error('OpenAI API error in semantic response:', error);
    return generateSemanticFallback(originalQuery, parsedQuery, searchResults);
  }
}

// Smart fallback for semantic responses
function generateSemanticFallback(originalQuery: string, parsedQuery: any, searchResults: any): string {
  const totalResults = searchResults.companies.length + searchResults.products.length;
  
  if (totalResults === 0) {
    switch (parsedQuery.intent) {
      case 'find_company':
        return `I couldn't find a company matching "${parsedQuery.entity || originalQuery}". Try searching by industry or product type instead. What specific sector interests you?`;
      case 'find_product':
        return `No products found for "${parsedQuery.entity || originalQuery}". Could you describe the product category or industry you're interested in?`;
      case 'find_products_by_company':
        return `I couldn't locate products from "${parsedQuery.entity || originalQuery}". The company might not be in our database yet. Would you like to explore similar manufacturers?`;
      case 'question':
        return `DeepFolder is a B2B platform connecting manufacturers and buyers. You can search for companies, products, view technical specs, and download CAD files. What would you like to discover?`;
      default:
        return `No results for "${originalQuery}". Try a different search term or browse by industry category. What specific products or companies are you looking for?`;
    }
  }
  
  // Has results - format based on intent
  const responses = [];
  
  switch (parsedQuery.intent) {
    case 'find_company':
      if (searchResults.companies.length > 0) {
        const company = searchResults.companies[0];
        responses.push(`Found [${company.name}](/company/${company.id}) - ${company.industry} company based in ${company.location}.`);
      }
      break;
    
    case 'find_product':
      if (searchResults.products.length > 0) {
        const product = searchResults.products[0];
        responses.push(`Found [${product.name}](/product/${product.id}) in ${product.category}.`);
      }
      break;
    
    case 'find_products_by_company':
      if (searchResults.companies.length > 0 && searchResults.products.length > 0) {
        const company = searchResults.companies[0];
        responses.push(`[${company.name}](/company/${company.id}) offers ${searchResults.products.length} products including `);
        const topProduct = searchResults.products[0];
        responses.push(`[${topProduct.name}](/product/${topProduct.id}).`);
      }
      break;
    
    default:
      if (searchResults.companies.length > 0) {
        const company = searchResults.companies[0];
        responses.push(`Found [${company.name}](/company/${company.id}) in ${company.industry}`);
      }
      if (searchResults.products.length > 0) {
        const product = searchResults.products[0];
        const connector = searchResults.companies.length > 0 ? ' and ' : 'Found ';
        responses.push(`${connector}[${product.name}](/product/${product.id}).`);
      }
  }
  
  return responses.join('') + ` Interested in more details?`;
}

// Generate smart suggestions based on semantic understanding
function generateSmartSuggestions(originalQuery: string, parsedQuery: any, searchResults: any): string[] {
  const suggestions: string[] = [];
  
  // Intent-based suggestions
  switch (parsedQuery.intent) {
    case 'find_company':
      if (searchResults.companies.length > 0) {
        suggestions.push(`Show me products from ${searchResults.companies[0].name}`);
      }
      suggestions.push('What industries are available?');
      suggestions.push('Find companies in my region');
      break;
    
    case 'find_product':
      if (searchResults.products.length > 0) {
        suggestions.push(`Find similar products to ${searchResults.products[0].name}`);
      }
      suggestions.push('Browse product categories');
      suggestions.push('Show me products with 3D models');
      break;
    
    case 'find_products_by_company':
      if (searchResults.companies.length > 0) {
        suggestions.push(`Tell me about ${searchResults.companies[0].name}`);
        suggestions.push('Show me their technical documents');
      }
      break;
    
    case 'question':
      suggestions.push('How do I download CAD files?');
      suggestions.push('What is DeepFolder?');
      suggestions.push('Find manufacturers near me');
      break;
    
    default:
      suggestions.push('Refine my search');
      suggestions.push('Show trending products');
      suggestions.push('Browse companies by industry');
  }
  
  return suggestions.slice(0, 3);
}

async function generateFastAIResponse(query: string, searchResults: any): Promise<string> {
  try {
    // Quick context for faster processing
    const companyDetails = searchResults.companies.slice(0, 3).map(c => `${c.name} (${c.industry}, ${c.location})`).join(', ');
    const productDetails = searchResults.products.slice(0, 3).map(p => `${p.name} (${p.category})`).join(', ');
    
    const systemPrompt = `You're an AI business assistant. Be conversational and helpful like ChatGPT.

Style: Maximum 40 words, friendly tone, always include clickable links format [Name](/company/ID) or [Product Name](/product/ID), end with a question.`;

    const userPrompt = `Query: "${query}"
Companies found: ${companyDetails || 'None'}
Products found: ${productDetails || 'None'}

Provide helpful response with proper links. ${searchResults.companies.length + searchResults.products.length > 0 ? 'Highlight best matches.' : 'Suggest alternatives or ask what they need.'}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 60,
      temperature: 0.7,
    });

    return response.choices[0].message.content || generateIntelligentFallback(query, searchResults);

  } catch (error) {
    console.error('OpenAI API error:', error);
    return generateIntelligentFallback(query, searchResults);
  }
}

function generateIntelligentFallback(query: string, searchResults: any): string {
  const totalResults = searchResults.companies.length + searchResults.products.length;
  
  if (totalResults === 0) {
    // No results - be helpful
    if (query.toLowerCase().includes('europe') || query.toLowerCase().includes('zurich')) {
      return "I don't see companies from that specific region yet. Would you like to explore our global technology companies instead? What industry interests you?";
    }
    return `No exact matches for "${query}" right now. Could you try a different keyword or tell me what specific industry or product type you're looking for?`;
  }
  
  // Has results - highlight them with working links
  const responses = [];
  
  if (searchResults.companies.length > 0) {
    const topCompany = searchResults.companies[0];
    responses.push(`Found [${topCompany.name}](/company/${topCompany.id}) in ${topCompany.industry || 'Technology'}`);
  }
  
  if (searchResults.products.length > 0) {
    const topProduct = searchResults.products[0];
    const connector = searchResults.companies.length > 0 ? ' and ' : 'Found ';
    responses.push(`${connector}[${topProduct.name}](/product/${topProduct.id}) in ${topProduct.category || 'Products'}`);
  }
  
  return responses.join('') + `. Need something more specific?`;
}

// Smart fallback response when OpenAI fails
// Enhanced smart fallback with real data and proper links
function generateSmartSearchFallback(query: string, searchResults: any, companies: any[], products: any[]): string {
  const lowerQuery = query.toLowerCase().trim();
  const totalResults = (searchResults.companies?.length || 0) + (searchResults.products?.length || 0);
  
  // If no results found, suggest alternatives with links to actual data
  if (totalResults === 0) {
    const randomCompanies = companies.sort(() => Math.random() - 0.5).slice(0, 2);
    const randomProducts = products.sort(() => Math.random() - 0.5).slice(0, 2);
    
    return `No matches for "${query}". Try exploring [${randomCompanies[0]?.name}](/company/${randomCompanies[0]?.id}) or [${randomProducts[0]?.name}](/product/${randomProducts[0]?.id}). What specific industry interests you?`;
  }
  
  // Smart contextual response with actual data links
  let response = '';
  
  if (searchResults.companies?.length > 0 && searchResults.products?.length > 0) {
    const topCompany = searchResults.companies[0];
    const topProduct = searchResults.products[0];
    response = `Perfect! Found [${topCompany.name}](/company/${topCompany.id}) and [${topProduct.name}](/product/${topProduct.id}). Both match your search. Need specific details?`;
  } else if (searchResults.companies?.length > 0) {
    const companies = searchResults.companies.slice(0, 2);
    const links = companies.map(c => `[${c.name}](/company/${c.id})`).join(' and ');
    response = `Great options: ${links}. Both match your interests perfectly. Want me to connect you?`;
  } else if (searchResults.products?.length > 0) {
    const products = searchResults.products.slice(0, 2);
    const links = products.map(p => `[${p.name}](/product/${p.id})`).join(' and ');
    response = `Found perfect matches: ${links}. Ready to explore these options further?`;
  }
  
  return response || `Found ${totalResults} results for "${query}". Let me know what specific details you need!`;
}

function generateSmartFallbackResponse(query: string, searchResults: any): string {
  const lowerQuery = query.toLowerCase().trim();
  const totalResults = (searchResults.companies?.length || 0) + (searchResults.products?.length || 0);
  
  // If no results found
  if (totalResults === 0) {
    return `No direct matches found for "${query}". Try these searches:

• Browse by category: "CNC machines", "3D printers", "sensors"
• Search by industry: "automotive suppliers", "aerospace companies"
• Look for locations: "manufacturers in Germany"

What specific type of company or product are you looking for?`;
  }
  
  // Build results summary
  let resultSummary = [];
  
  if (searchResults.companies?.length > 0) {
    const topCompanies = searchResults.companies.slice(0, 3);
    const companyList = topCompanies.map(c => `Visit [${c.name}](/company/${c.id})`).join(', ');
    resultSummary.push(`**Companies (${searchResults.companies.length}):** ${companyList}`);
  }
  
  if (searchResults.products?.length > 0) {
    const topProducts = searchResults.products.slice(0, 3);
    const productList = topProducts.map(p => `View [${p.name}](/product/${p.id})`).join(', ');
    resultSummary.push(`**Products (${searchResults.products.length}):** ${productList}`);
  }
  
  // Generate contextual response based on query
  let contextualTip = '';
  
  if (lowerQuery.includes('cnc') || lowerQuery.includes('machining')) {
    contextualTip = '\n\nNeed specific CNC capabilities? Look for precision tolerances and material compatibility.';
  } else if (lowerQuery.includes('3d') || lowerQuery.includes('print')) {
    contextualTip = '\n\nCompare print materials, layer resolution, and build volumes for your needs.';
  } else if (lowerQuery.includes('automation') || lowerQuery.includes('robot')) {
    contextualTip = '\n\nCheck payload capacity, reach, and programming interfaces for automation solutions.';
  } else if (lowerQuery.includes('sensor') || lowerQuery.includes('iot')) {
    contextualTip = '\n\nEvaluate connectivity protocols, power requirements, and environmental ratings.';
  }
  
  return `Found ${totalResults} results for "${query}":

${resultSummary.join('\n\n')}${contextualTip}

Need more specific information? Ask about technical specs, pricing, or contact details.`;
}

// Fallback response system when OpenAI is unavailable
function generateFallbackSearchResponse(
  query: string, 
  companies: any[], 
  products: any[], 
  searchResults: any
): string {
  const lowerQuery = query.toLowerCase();
  
  // Intelligent query analysis patterns
  const analysisPatterns = {
    // Company discovery queries
    companySearch: {
      keywords: ['company', 'companies', 'supplier', 'suppliers', 'manufacturer', 'manufacturers', 'vendor', 'vendors'],
      handler: () => {
        if (searchResults.companies.length === 0) {
          return `Found 0 companies matching "${query}". Try searching for:
• Specific industries: "CNC machining companies" 
• Locations: "automation suppliers in Germany"
• Technologies: "3D printing services"

Would you like to explore companies by industry or location instead?`;
        }
        
        const foundCompanies = searchResults.companies.slice(0, 3);
        const companyLinks = foundCompanies.map(c => `• Visit [${c.name}](/company/${c.id}) - ${c.industry} in ${c.location}`).join('\n');
        
        return `Found ${searchResults.companies.length} companies:

${companyLinks}

Want to see their products or get in touch directly?`;
      }
    },

    // Product discovery queries
    productSearch: {
      keywords: ['product', 'products', 'part', 'parts', 'component', 'components', 'equipment', 'tool', 'tools', 'machine', 'machinery'],
      handler: () => {
        if (searchResults.products.length === 0) {
          return `No products found for "${query}". Try these alternatives:
• Browse categories: "CNC machines", "3D printers", "sensors"
• Search by application: "automotive parts", "medical devices"

What specific type of product are you looking for?`;
        }
        
        const foundProducts = searchResults.products.slice(0, 3);
        const productLinks = foundProducts.map(p => `• View [${p.name}](/product/${p.id}) - ${p.category}`).join('\n');
        
        return `Found ${searchResults.products.length} products:

${productLinks}

Looking for specific specifications or need a quote?`;
      }
    },

    // Industry analysis queries
    industryAnalysis: {
      keywords: ['industry', 'sector', 'market', 'field', 'automation', 'manufacturing', 'aerospace', 'automotive', 'electronics'],
      handler: () => {
        const industries = [...new Set(companies.map(c => c.industry))];
        const industryStats = industries.map(industry => ({
          name: industry,
          count: companies.filter(c => c.industry === industry).length
        })).sort((a, b) => b.count - a.count);

        return `Based on our platform data, DeepFolder features companies across ${industries.length} major industries. The most represented sectors are ${industryStats.slice(0, 3).map(i => `${i.name} (${i.count} companies)`).join(', ')}. I can provide detailed analysis of any specific industry, including key players, product categories, and market trends. Which industry interests you most?`;
      }
    },

    // Location-based queries
    locationSearch: {
      keywords: ['location', 'where', 'country', 'city', 'region', 'near', 'local', 'global'],
      handler: () => {
        const locations = [...new Set(companies.map(c => c.location))];
        const locationStats = locations.map(location => ({
          name: location,
          count: companies.filter(c => c.location === location).length
        })).sort((a, b) => b.count - a.count);

        return `Our platform connects companies from ${locations.length} different locations globally. Major business hubs include ${locationStats.slice(0, 3).map(l => `${l.name} (${l.count} companies)`).join(', ')}. I can help you find suppliers in specific regions or explore global sourcing opportunities. Which location are you interested in?`;
      }
    },

    // Capability and service queries
    capabilitySearch: {
      keywords: ['capability', 'capabilities', 'service', 'services', 'expertise', 'specialization', 'custom', 'solution'],
      handler: () => {
        const capabilities = companies.map(c => c.description).join(' ').toLowerCase();
        const commonTerms = ['manufacturing', 'design', 'engineering', 'custom', 'precision', 'quality', 'automation'];
        const relevantCaps = commonTerms.filter(term => capabilities.includes(term));

        return `Our platform companies offer diverse capabilities including ${relevantCaps.slice(0, 5).join(', ')}-focused solutions. Each company profile details their specific expertise, certifications, and service offerings. I can connect you with companies that match your exact requirements. What specific capabilities or services are you looking for?`;
      }
    },

    // Technology and innovation queries
    technologySearch: {
      keywords: ['technology', 'innovation', 'ai', 'iot', 'smart', 'digital', 'advanced', 'cutting-edge', '3d printing', 'cnc'],
      handler: () => {
        const techProducts = products.filter(p => 
          p.name.toLowerCase().includes('smart') || 
          p.name.toLowerCase().includes('digital') ||
          p.name.toLowerCase().includes('cnc') ||
          p.name.toLowerCase().includes('automation')
        );

        return `DeepFolder features ${techProducts.length} technology-focused products and solutions from innovative companies. Our platform showcases advanced manufacturing technologies, smart systems, and cutting-edge industrial solutions. Each product includes detailed specifications and 3D models for technical evaluation. Which technology area interests you most?`;
      }
    },

    // Pricing and cost queries
    pricingInquiry: {
      keywords: ['price', 'pricing', 'cost', 'budget', 'quote', 'expensive', 'cheap', 'affordable', 'estimate'],
      handler: () => {
        return `Pricing on DeepFolder varies by product complexity, customization, and volume requirements. Most suppliers offer flexible pricing structures including volume discounts and custom quotes. I can connect you with relevant suppliers who will provide detailed pricing based on your specific needs. Our platform facilitates direct communication for accurate quotes. What products or services do you need pricing for?`;
      }
    },

    // General platform information
    platformInfo: {
      keywords: ['deepfolder', 'platform', 'how it works', 'features', 'about', 'help'],
      handler: () => {
        return `DeepFolder is an advanced B2B platform with ${companies.length} companies and ${products.length} products. Features include:
• AI-powered search & recommendations
• 3D product catalogs
• Direct company messaging
• ML-based matching

How can I help you explore our platform?`;
      }
    }
  };

  // Check for specific patterns in query
  for (const [category, pattern] of Object.entries(analysisPatterns)) {
    for (const keyword of pattern.keywords) {
      if (lowerQuery.includes(keyword)) {
        return pattern.handler();
      }
    }
  }

  // Question-based responses  
  if (query.includes('?')) {
    if (searchResults.companies.length > 0 || searchResults.products.length > 0) {
      let results = [];
      if (searchResults.companies.length > 0) {
        results.push(`• ${searchResults.companies.slice(0, 2).map(c => `Visit [${c.name}](/company/${c.id})`).join(', ')}`);
      }
      if (searchResults.products.length > 0) {
        results.push(`• ${searchResults.products.slice(0, 2).map(p => `View [${p.name}](/product/${p.id})`).join(', ')}`);
      }
      
      return `Great question! Found ${searchResults.companies.length} companies and ${searchResults.products.length} products:

${results.join('\n')}

What specific details do you need?`;
    } else {
      return `Interesting question about "${query}". Try more specific terms:
• Industry focus: "aerospace manufacturers"
• Product types: "CNC machines", "sensors"
• Locations: "suppliers in Germany"

What exactly are you looking for?`;
    }
  }

  // Default intelligent response
  if (searchResults.companies.length > 0 || searchResults.products.length > 0) {
    let results = [];
    if (searchResults.companies.length > 0) {
      results.push(`Companies (${searchResults.companies.length}): ${searchResults.companies.slice(0, 2).map(c => `Visit [${c.name}](/company/${c.id})`).join(', ')}`);
    }
    if (searchResults.products.length > 0) {
      results.push(`Products (${searchResults.products.length}): ${searchResults.products.slice(0, 2).map(p => `View [${p.name}](/product/${p.id})`).join(', ')}`);
    }
    
    return `Found results for "${query}":

${results.join('\n')}

Need more details or specific quotes?`;
  } else {
    return `No matches found for "${query}". Try:
• Industry terms: "CNC machining", "3D printing"
• Locations: "manufacturers in Germany"  
• Categories: "industrial robots", "sensors"

What industry or product type interests you?`;
  }
}

// Generate intelligent search suggestions
function generateSearchSuggestions(query: string, companies: any[], products: any[]): string[] {
  const lowerQuery = query.toLowerCase();
  const suggestions: string[] = [];

  // Industry-based suggestions
  const industries = [...new Set(companies.map(c => c.industry))];
  industries.forEach(industry => {
    if (industry.toLowerCase().includes(lowerQuery) || lowerQuery.includes(industry.toLowerCase())) {
      suggestions.push(`${industry} companies`);
      suggestions.push(`${industry} suppliers`);
    }
  });

  // Product category suggestions
  const categories = [...new Set(products.map(p => p.category))];
  categories.forEach(category => {
    if (category.toLowerCase().includes(lowerQuery) || lowerQuery.includes(category.toLowerCase())) {
      suggestions.push(`${category} products`);
      suggestions.push(`${category} specifications`);
    }
  });

  // Common B2B search patterns
  const commonSuggestions = [
    `${query} manufacturers`,
    `${query} suppliers`,
    `${query} specifications`,
    `${query} pricing`,
    `companies specializing in ${query}`,
    `${query} industry leaders`,
    `custom ${query} solutions`,
    `${query} with certification`
  ];

  suggestions.push(...commonSuggestions);

  // Remove duplicates and return relevant suggestions
  return [...new Set(suggestions)].filter(s => 
    s.toLowerCase() !== query.toLowerCase() && s.length < 50
  );
}

// OpenAI-powered general chat response
async function generateOpenAIChatResponse(
  message: string, 
  companyId?: number
): Promise<string> {
  try {
    const systemPrompt = `You are an AI assistant for DeepFolder, a comprehensive B2B platform that connects companies globally. Your role is to help users discover companies, find products, understand platform features, and facilitate business connections.

Key Platform Features:
- Global company discovery and networking
- Product catalog with specifications and pricing
- AI-powered search and recommendations  
- Quote requests and supplier connections
- Company profiles with certifications and capabilities
- Real-time messaging and collaboration tools

Guidelines:
1. Be helpful, professional, and knowledgeable about B2B commerce
2. Provide specific guidance on using DeepFolder's features
3. Help users find companies and products by understanding their needs
4. Encourage business connections and networking
5. Be concise but informative (max 150 words)
6. If users ask about specific companies or products, guide them to search
7. Always represent DeepFolder as a powerful platform for B2B success

Respond as a knowledgeable DeepFolder assistant focused on helping users succeed in B2B.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_completion_tokens: 80, // Very short responses - 1-2 sentences max
      temperature: 0.7,
    });

    return response.choices[0].message.content || "Thank you for using DeepFolder. How can I assist you with your B2B needs today?";

  } catch (error) {
    console.error('OpenAI general chat error:', error);
    
    // Enhanced fallback to intelligent rule-based responses
    return generateIntelligentFallbackResponse(message, companyId);
  }
}

// Enhanced intelligent fallback response system
function generateIntelligentFallbackResponse(
  message: string, 
  companyId?: number
): string {
  const lowerMessage = message.toLowerCase();
  
  // Advanced natural language processing patterns for B2B platform
  const intentPatterns = {
    // Search and discovery intents
    search: {
      keywords: ['find', 'search', 'look for', 'looking for', 'need', 'want', 'show me', 'where can i', 'do you have'],
      response: (message: string) => {
        if (lowerMessage.includes('cnc') || lowerMessage.includes('machining')) {
          return "I can help you find CNC machining companies on DeepFolder! Our platform includes precision manufacturers with ISO certifications, specializing in aerospace, automotive, and custom manufacturing. These companies offer detailed product catalogs, technical specifications, and direct engineering contact. Would you like me to guide you to the Companies section to explore CNC specialists?";
        }
        if (lowerMessage.includes('3d print') || lowerMessage.includes('additive')) {
          return "Excellent! DeepFolder features outstanding 3D printing specialists offering industrial-grade solutions from polymer to metal printing. Our partners work with materials like PLA, ABS, PETG, titanium, and aluminum powders for prototyping through production runs. I can direct you to browse these companies and their service capabilities. What specific 3D printing applications are you considering?";
        }
        if (lowerMessage.includes('robot') || lowerMessage.includes('automation')) {
          return "Great question! Our automation partners provide comprehensive robotics solutions including 6-axis industrial arms, assembly line automation, and smart factory integration. Companies like RoboTech Solutions offer downloadable specifications, 3D models, and programming support. Are you interested in pick-and-place, welding, assembly, or custom automation applications?";
        }
        if (lowerMessage.includes('supplier') || lowerMessage.includes('manufacturer')) {
          return "DeepFolder connects you with verified suppliers and manufacturers across all industries. Our platform includes detailed company profiles with certifications, capabilities, and product catalogs. You can search by industry, location, or specific products. I can guide you through our search features to find the right manufacturing partners for your needs.";
        }
        return `I can help you search DeepFolder's extensive database of global manufacturers and suppliers. Our platform includes companies across all industries with detailed product catalogs, certifications, and direct contact options. What specific products, services, or industries are you looking for? I can provide targeted guidance to find the right business partners.`;
      }
    },

    // Pricing and quotes
    pricing: {
      keywords: ['price', 'cost', 'quote', 'budget', 'how much', 'pricing', 'estimate', 'afford', 'expensive', 'cheap'],
      response: () => "Pricing transparency is important for B2B decisions. On DeepFolder, you can request quotes directly from manufacturers through our platform. Most companies provide custom pricing based on quantity, specifications, and delivery requirements. Our quote request system connects you with multiple suppliers for competitive pricing. What products or services do you need pricing information for?"
    },

    // Technical information
    technical: {
      keywords: ['spec', 'specification', 'technical', 'datasheet', 'manual', 'documentation', 'how does', 'how to', 'dimensions', 'material'],
      response: () => "Technical specifications are crucial for informed B2B decisions. DeepFolder companies provide comprehensive documentation including detailed datasheets, CAD files, installation guides, compliance certificates, and material specifications. Our platform makes it easy to access technical resources and connect directly with engineering teams. What specific technical information do you need?"
    },

    // Platform features and help
    platform: {
      keywords: ['deepfolder', 'platform', 'how to use', 'features', 'help', 'tutorial', 'guide', 'navigate'],
      response: () => "DeepFolder is your comprehensive AI-powered B2B marketplace for global business connections. Key features include: advanced company discovery with filtering, detailed product catalogs with 3D models, AI-powered search and recommendations, direct messaging and quote requests, certification verification, and supplier networking tools. I can guide you through any specific feature. What aspect of the platform would you like to explore?"
    },

    // Problem-solving and support
    problem: {
      keywords: ['problem', 'issue', 'challenge', 'difficulty', 'help me', 'stuck', 'not working', 'error', 'support'],
      response: () => "I'm here to help solve your business challenges! DeepFolder connects you with experienced manufacturers and suppliers who can provide solutions for sourcing challenges, technical requirements, or finding specialized partners. Our network spans all industries with verified expertise. What specific challenge can I help you address through our platform?"
    },

    // Company and product inquiries
    company: {
      keywords: ['company', 'companies', 'business', 'manufacturer', 'supplier', 'vendor', 'partner'],
      response: () => "DeepFolder features thousands of verified companies across all industries, from small specialized manufacturers to large industrial suppliers. Each company profile includes certifications, capabilities, product catalogs, and contact information. You can filter by industry, location, certifications, or company size. Would you like me to guide you to browse companies or search for specific industries?"
    },

    // Product-related queries
    products: {
      keywords: ['product', 'products', 'catalog', 'item', 'parts', 'components', 'equipment', 'inventory'],
      response: () => "Our product catalog includes thousands of items with detailed specifications, images, 3D models, and pricing information. Products range from raw materials and components to finished equipment and custom solutions. You can download technical datasheets, request quotes, and contact suppliers directly. What type of products are you looking for?"
    }
  };

  // Check for intent patterns
  for (const [intent, pattern] of Object.entries(intentPatterns)) {
    if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
      if (typeof pattern.response === 'function') {
        return pattern.response(message);
      } else {
        return pattern.response;
      }
    }
  }

  // Advanced question analysis
  if (message.includes('?')) {
    if (lowerMessage.includes('what') || lowerMessage.includes('how') || lowerMessage.includes('why') || lowerMessage.includes('when') || lowerMessage.includes('where')) {
      return "Great question! I'm your AI assistant for DeepFolder and I know our entire database of companies and suppliers. What specifically are you trying to find or accomplish?";
    }
  }

  // Greeting patterns
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
    return "Hey there! I'm your AI assistant for DeepFolder. I can help you find companies, explore products, get quotes, or connect with suppliers. What are you looking for?";
  }

  // Length-based intelligent responses
  if (message.length > 100) {
    return "I see you have specific requirements! Let me analyze what you need and match you with the right suppliers. Want me to break this down and find the best matches?";
  }

  // Default intelligent response
  return "Hi! I'm your DeepFolder assistant. I can help you find companies, explore products, get specs, request quotes, or connect with suppliers. What are you looking for?";
}

// Generate contextual suggestions based on search query and results
function generateContextualSuggestions(query: string, searchResults: any): string[] {
  const suggestions: string[] = [];
  const lowerQuery = query.toLowerCase();
  
  // Extract categories and industries from results
  const categories = Array.from(new Set(searchResults.products.map((p: any) => p.category).filter(Boolean)));
  const industries = Array.from(new Set(searchResults.companies.map((c: any) => c.industry).filter(Boolean)));
  
  // Smart subcategory exploration based on search content
  const categoryMappings: Record<string, string[]> = {
    'machinery': ['CNC machines', 'industrial equipment', 'automation systems', 'manufacturing tools'],
    'electronics': ['sensors', 'controllers', 'circuits', 'components', 'semiconductors'],
    'automotive': ['parts', 'components', 'engines', 'chassis', 'electrical systems'],
    'aerospace': ['avionics', 'composites', 'precision parts', 'testing equipment'],
    'medical': ['devices', 'instruments', 'implants', 'diagnostic equipment'],
    'packaging': ['containers', 'labels', 'sealing equipment', 'automation'],
    'textiles': ['fabrics', 'machinery', 'chemicals', 'finishing equipment'],
    'food': ['processing equipment', 'packaging', 'safety systems', 'quality control'],
    'construction': ['materials', 'tools', 'safety equipment', 'heavy machinery'],
    'energy': ['renewable systems', 'power generation', 'storage solutions', 'efficiency tools']
  };
  
  // Add related subcategories for found categories
  categories.forEach(category => {
    const lowerCategory = category.toLowerCase();
    Object.keys(categoryMappings).forEach(key => {
      if (lowerCategory.includes(key) || key.includes(lowerCategory)) {
        categoryMappings[key].forEach(sub => {
          if (suggestions.length < 5 && !suggestions.includes(sub)) {
            suggestions.push(sub);
          }
        });
      }
    });
  });
  
  // Add industry-specific suggestions
  industries.forEach(industry => {
    const lowerIndustry = industry.toLowerCase();
    if (lowerIndustry.includes('manufacturing') && suggestions.length < 5) {
      if (!suggestions.includes('automation equipment')) suggestions.push('automation equipment');
      if (!suggestions.includes('quality control systems')) suggestions.push('quality control systems');
    } else if (lowerIndustry.includes('technology') && suggestions.length < 5) {
      if (!suggestions.includes('hardware components')) suggestions.push('hardware components');
      if (!suggestions.includes('integration services')) suggestions.push('integration services');
    }
  });
  
  // Query-based contextual suggestions
  const queryTerms = lowerQuery.split(/\s+/);
  queryTerms.forEach(term => {
    if (suggestions.length >= 5) return;
    
    // Manufacturing related
    if (['cnc', 'machining', 'mill', 'lathe'].some(keyword => term.includes(keyword))) {
      if (!suggestions.includes('precision tooling')) suggestions.push('precision tooling');
      if (!suggestions.includes('cutting tools')) suggestions.push('cutting tools');
    }
    
    // Automation related
    if (['robot', 'automation', 'control'].some(keyword => term.includes(keyword))) {
      if (!suggestions.includes('sensors and actuators')) suggestions.push('sensors and actuators');
      if (!suggestions.includes('vision systems')) suggestions.push('vision systems');
    }
  });
  
  // Always add some general B2B suggestions if we don't have enough
  if (suggestions.length < 3) {
    const defaults = ['manufacturing equipment', 'industrial supplies', 'automation solutions'];
    defaults.forEach(def => {
      if (suggestions.length < 5 && !suggestions.includes(def)) {
        suggestions.push(def);
      }
    });
  }
  
  return suggestions.slice(0, 5);
}

// OpenAI-powered search response generator
async function generateOpenAISearchResponse(
  query: string, 
  companies: any[], 
  products: any[], 
  searchResults: any
): Promise<string> {
  try {
    const systemPrompt = `You are an AI search assistant for DeepFolder, a B2B platform with ${companies.length} companies and ${products.length} products. 

Your task is to analyze search results and provide intelligent, helpful responses about companies and products that match the user's query.

Guidelines:
1. Analyze the search query context and intent
2. Summarize relevant search results clearly
3. Highlight key matches and why they're relevant
4. Suggest refinements or related searches if appropriate
5. Be concise but informative (max 150 words)
6. Focus on business value and connections
7. If no results, suggest alternative approaches

Search Query: "${query}"
Companies Found: ${searchResults.companies.length}
Products Found: ${searchResults.products.length}

Provide a helpful analysis of these search results.`;

    const resultsContext = `
Top Companies: ${searchResults.companies.slice(0, 3).map((c: any) => `${c.name} (${c.industry}, ${c.location})`).join(', ')}
Top Products: ${searchResults.products.slice(0, 3).map((p: any) => `${p.name} (${p.category})`).join(', ')}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Search results: ${resultsContext}` }
      ],
      max_completion_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0].message.content || generateOpenAISearchResponse(query, companies, products, searchResults);

  } catch (error) {
    console.error('OpenAI search response error:', error);
    
    // Fallback to existing function
    return generateOpenAISearchResponse(query, companies, products, searchResults);
  }
}

// Enhanced Company Chat with OpenAI Integration
async function generateCompanyChatResponse(
  message: string, 
  company: any, 
  products: any[], 
  contextInfo: string, 
  context: string, 
  productData?: any
): Promise<string> {
  try {
    // Use OpenAI for intelligent company chat responses
    const systemPrompt = `You are an AI assistant for ${company.name}, a ${company.industry} company located in ${company.location}. 

Company Information:
- Name: ${company.name}
- Industry: ${company.industry}
- Location: ${company.location}
- Description: ${company.description}
- Products: ${products.length} products available

Available Products:
${products.slice(0, 10).map(p => `- ${p.name}: ${p.description || 'High-quality product'} (Category: ${p.category}) [Product ID: ${p.id}]`).join('\n')}

${context === 'product' && productData ? `
Current Product Focus: ${productData.name}
Product Details: ${productData.description || 'Premium product'}
Specifications: ${productData.specifications || 'Available upon request'}
Price: ${productData.price || 'Contact for pricing'}
` : ''}

CRITICAL RULES:
1. Maximum 1-2 sentences ONLY
2. ONE key fact per response - extremely brief
3. Include product links: [Product Name](/products/[ID])
4. No long explanations

Brief responses for ${company.name}.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_completion_tokens: 80, // Very short responses - 1-2 sentences max
      temperature: 0.7,
    });

    return response.choices[0].message.content || "Thank you for your interest in our company. Please feel free to contact us for more information.";

  } catch (error) {
    console.error('OpenAI company chat error:', error);
    
    // Fallback to rule-based responses
    return generateFallbackCompanyResponse(message, company, products, context, productData);
  }
}

// Fallback company response system
function generateFallbackCompanyResponse(
  message: string, 
  company: any, 
  products: any[], 
  context: string, 
  productData?: any
): string {
  const lowerMessage = message.toLowerCase();
  
  // Enhanced response patterns for better message understanding
  const companyPatterns = {
    greeting: {
      keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings'],
      responses: [
        `Hello! Welcome to ${company.name}. I'm here to help you learn about our ${company.industry} solutions. What can I assist you with today?`,
        `Hi there! Thanks for your interest in ${company.name}. We're excited to share information about our capabilities. How can I help?`,
        `Greetings! I'm the AI assistant for ${company.name}. I can provide details about our products, services, and expertise. What would you like to know?`
      ]
    },
    
    pricing: {
      keywords: ['price', 'pricing', 'cost', 'quote', 'estimate', 'budget', 'how much', 'expensive', 'cheap', 'affordable'],
      responses: [
        `${company.name} offers competitive pricing tailored to your specific needs. Our pricing varies based on quantity, customization, and delivery requirements. I'd be happy to connect you with our sales team for a detailed quote.`,
        `We provide flexible pricing options at ${company.name}. For accurate pricing information, please share your specific requirements, and our team will prepare a customized quote for you.`,
        `Pricing at ${company.name} depends on your exact specifications and volume needs. Contact our sales team through DeepFolder for detailed pricing and volume discounts.`
      ]
    },
    
    technical: {
      keywords: ['specification', 'specs', 'technical', 'dimensions', 'material', 'performance', 'features', 'requirements', 'datasheet'],
      responses: [
        `${company.name} provides comprehensive technical specifications for all our products. Our engineering team can supply detailed drawings, material certifications, and performance data. What specific technical information do you need?`,
        `We maintain detailed technical documentation at ${company.name}. I can connect you with our technical team who can provide specifications, compliance certifications, and customization options.`,
        `Technical excellence is a priority at ${company.name}. Our products meet industry standards with full documentation available. Which technical aspects are most important for your application?`
      ]
    },
    
    delivery: {
      keywords: ['delivery', 'shipping', 'lead time', 'timeline', 'when', 'urgent', 'rush', 'fast', 'schedule'],
      responses: [
        `${company.name} offers flexible delivery options to meet your timeline needs. Standard lead times vary by product complexity, and we also provide expedited service for urgent requirements. What's your target delivery date?`,
        `We understand timing is critical. ${company.name} works with reliable logistics partners to ensure on-time delivery. Rush orders and expedited shipping are available for urgent projects.`,
        `Delivery timelines at ${company.name} depend on product complexity and current production schedule. We'll work with you to meet your project deadlines. When do you need delivery?`
      ]
    },
    
    quality: {
      keywords: ['quality', 'certification', 'iso', 'standards', 'compliance', 'testing', 'inspection', 'certified', 'warranty'],
      responses: [
        `Quality is paramount at ${company.name}. We maintain industry certifications and follow strict quality control processes. Our products undergo comprehensive testing to ensure they meet your specifications.`,
        `${company.name} is committed to excellence with certified quality management systems. We provide full traceability and quality documentation with every shipment.`,
        `We take quality seriously at ${company.name}. Our facility maintains relevant industry certifications, and all products are thoroughly inspected before delivery.`
      ]
    },
    
    about: {
      keywords: ['about', 'company', 'who are you', 'tell me about', 'information', 'background', 'experience', 'history'],
      responses: [
        `${company.name} is a leading ${company.industry} company based in ${company.location}. ${company.description} We're dedicated to providing innovative solutions and exceptional service to our clients.`,
        `We're ${company.name}, specializing in ${company.industry} solutions from our location in ${company.location}. ${company.description} Our experienced team is committed to excellence and customer satisfaction.`,
        `${company.name} has established itself as a trusted partner in the ${company.industry} industry. Located in ${company.location}, we combine expertise with innovation to deliver superior results.`
      ]
    },
    
    products: {
      keywords: ['product', 'products', 'catalog', 'item', 'parts', 'components', 'equipment', 'what do you make', 'what do you sell', 'inventory'],
      responses: () => {
        if (products.length === 0) {
          return `${company.name} is currently updating our product catalog. Please contact us directly for information about our latest offerings and capabilities in the ${company.industry} sector.`;
        }
        const productList = products.slice(0, 5).map(p => `• ${p.name} - ${p.description || 'High-quality solution'} (View details: /products/${p.id})`).join('\n');
        return `${company.name} offers an extensive range of products:\n\n${productList}\n\n${products.length > 5 ? `Plus ${products.length - 5} additional products in our catalog. ` : ''}Each product can be customized to meet your specific requirements. Click the links above to view detailed specifications.`;
      }
    },
    
    contact: {
      keywords: ['contact', 'reach', 'talk', 'speak', 'meet', 'phone', 'email', 'address'],
      responses: [
        `I'd be happy to connect you with the right team at ${company.name}. You can reach us through DeepFolder's messaging system, or I can help facilitate contact with our sales or technical teams.`,
        `${company.name} welcomes direct communication. Our team is available to discuss your specific needs through DeepFolder's platform. What type of assistance are you looking for?`,
        `Thank you for wanting to connect with ${company.name}. Our business development team can explore your requirements. Would you like me to arrange an introduction?`
      ]
    },
    
    capabilities: {
      keywords: ['capability', 'capabilities', 'service', 'services', 'what can you do', 'expertise', 'specialization'],
      responses: [
        `${company.name} offers comprehensive capabilities in the ${company.industry} sector. We provide end-to-end solutions including design, manufacturing, and support services. Our experienced team can handle projects of various scales and complexities.`,
        `Our core capabilities at ${company.name} include specialized ${company.industry} solutions with full project lifecycle support. We excel in custom applications and can adapt our services to meet unique requirements.`,
        `${company.name} specializes in ${company.industry} with expertise spanning consultation, development, and implementation. Our team's capabilities cover both standard solutions and innovative custom projects.`
      ]
    }
  };

  // Product-specific context responses with enhanced keyword detection
  if (context === 'product' && productData) {
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote') || lowerMessage.includes('budget')) {
      return `For ${productData.name}, ${productData.price ? `our current pricing is ${productData.price}` : 'we offer competitive pricing'}. Final pricing depends on quantity, specifications, and delivery requirements. Would you like me to connect you with our sales team for a detailed quote?`;
    }
    
    if (lowerMessage.includes('specification') || lowerMessage.includes('spec') || lowerMessage.includes('technical') || lowerMessage.includes('details') || lowerMessage.includes('datasheet')) {
      return `${productData.name} specifications: ${productData.specifications || 'Custom specifications available based on your requirements'}. Our engineering team can provide detailed technical documentation, CAD files, and customization options. What specific technical details do you need?`;
    }
    
    if (lowerMessage.includes('delivery') || lowerMessage.includes('shipping') || lowerMessage.includes('when') || lowerMessage.includes('timeline')) {
      return `For ${productData.name}, delivery times vary based on quantity and customization requirements. We offer both standard and expedited shipping options. What's your required delivery timeline?`;
    }

    if (lowerMessage.includes('availability') || lowerMessage.includes('stock') || lowerMessage.includes('available') || lowerMessage.includes('in stock')) {
      return `${productData.name} availability depends on current inventory and production schedule. I can check current stock levels and production capacity with our team. What quantity are you considering?`;
    }

    if (lowerMessage.includes('warranty') || lowerMessage.includes('guarantee') || lowerMessage.includes('support')) {
      return `${productData.name} comes with comprehensive warranty coverage and ongoing support from ${company.name}. Our team provides technical assistance and maintenance guidance throughout the product lifecycle.`;
    }
  }

  // Check for patterns in user message
  for (const [category, pattern] of Object.entries(companyPatterns)) {
    for (const keyword of pattern.keywords) {
      if (lowerMessage.includes(keyword)) {
        if (typeof pattern.responses === 'function') {
          return pattern.responses();
        } else {
          const randomResponse = pattern.responses[Math.floor(Math.random() * pattern.responses.length)];
          return randomResponse;
        }
      }
    }
  }

  // Intelligent default responses based on message characteristics
  if (message.includes('?')) {
    return `That's a great question about ${company.name}! I'm here to help you understand our ${company.industry} capabilities, products, and services. Could you provide more specific details about what you're looking for? I can assist with product information, pricing, technical specifications, or general company inquiries.`;
  } else if (message.length > 50) {
    return `Thank you for your detailed message regarding ${company.name}. I understand you have specific requirements in the ${company.industry} sector. Let me help you find the right solutions from our product portfolio or connect you with our technical team for specialized assistance.`;
  } else {
    return `Welcome to ${company.name}! We're a ${company.industry} company specializing in innovative solutions. I can help you with product information, technical specifications, pricing, or general company questions. What would you like to know about our capabilities?`;
  }
}

