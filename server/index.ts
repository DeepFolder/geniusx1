import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import MemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadEnvFile() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const envPathCandidates = [
    path.resolve(currentDir, ".env"),
    path.resolve(currentDir, "..", ".env"),
  ];
  const envPath = envPathCandidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) {
    return;
  }
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const rawKey = trimmed.slice(0, equalIndex).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice(7).trim() : rawKey;
    if (!key) {
      continue;
    }
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();

function toOrigin(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

// Trust proxy - required for secure cookies behind Replit's HTTPS proxy
app.set('trust proxy', 1);

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Vite dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for development
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️  Rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for static assets and non-API routes
    return !req.path.startsWith('/api');
  }
});

// CORS configuration with origin whitelist
const allowedOrigins = [
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
  process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : null,
  // REPLIT_DOMAINS covers all domains in production deployments (e.g. deepfolder.replit.app)
  ...(process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',').map(d => `https://${d.trim()}`) : []),
  toOrigin(process.env.APP_URL),
  toOrigin(process.env.FRONTEND_URL),
  toOrigin(process.env.SITE_URL),
  'https://deepfolder.ai',
  'https://www.deepfolder.ai',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin requests don't send Origin header
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(cookieParser());

// CSRF Protection via custom header verification for API requests
// This works in conjunction with sameSite: 'lax' cookies and CORS whitelist
// Browsers cannot send custom headers cross-origin without CORS permission
app.use('/api', (req, res, next) => {
  // Skip CSRF check for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for auth endpoints (they don't have a session yet)
  const skipPaths = ['/api/auth/login', '/api/auth/register', '/api/companies/create-with-admin'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  // For authenticated requests, verify origin matches allowed list
  const origin = req.headers.origin;
  // If origin header exists and is not in whitelist, reject
  if (origin && !allowedOrigins.includes(origin)) {
    console.warn(`⚠️  CSRF: Rejected request from unauthorized origin: ${origin}`);
    return res.status(403).json({ error: 'Forbidden: Invalid origin' });
  }
  
  // Additional protection: require a custom header for API requests
  // This prevents simple form-based CSRF attacks
  const customHeader = req.headers['x-requested-with'];
  if (!customHeader && origin) {
    console.warn(`⚠️  CSRF: Missing X-Requested-With header from origin: ${origin}`);
    // Allow for now but log the warning
  }
  
  next();
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/companies/create-with-admin', authLimiter);
app.use('/api', apiLimiter);

// Validate critical secrets on startup
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'deepfolder-secret-key-development') {
  console.error('❌ SECURITY ERROR: SESSION_SECRET environment variable must be set to a strong random value');
  console.error('   Generate a secure secret with: openssl rand -base64 32');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  } else {
    console.warn('⚠️  WARNING: Using default SESSION_SECRET in development mode - DO NOT use in production!');
  }
}

// Session middleware configuration with secure settings
const MemStore = MemoryStore(session);
app.use(session({
  secret: process.env.SESSION_SECRET || 'deepfolder-secret-key-development',
  name: 'connect.sid',
  store: new MemStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent JavaScript access to session cookie
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax', // CSRF protection - allows same-site navigation
    domain: undefined
  }
}));

// Serve generated product images
app.use('/attached_assets', express.static('attached_assets'));

// Serve coming-soon landing page for preview/design
app.use('/coming-soon', express.static('coming-soon'));

// Skip JSON parsing for file upload routes only (not for AI chat routes)
app.use((req, res, next) => {
  const skipJsonRoutes = ['/api/products', '/api/documents'];
  const shouldSkip = skipJsonRoutes.some(route => req.path === route) && req.method === 'POST';
  
  if (shouldSkip) {
    return next();
  }
  express.json({ limit: '100mb' })(req, res, next);
});

app.use((req, res, next) => {
  const skipUrlencodedRoutes = ['/api/products', '/api/documents'];
  const shouldSkip = skipUrlencodedRoutes.some(route => req.path === route) && req.method === 'POST';
  
  if (shouldSkip) {
    return next();
  }
  express.urlencoded({ extended: true, limit: '100mb' })(req, res, next);
});

// Sanitized request/response logger - excludes sensitive data
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Only log response for non-sensitive routes
      const sensitiveRoutes = ['/api/auth/login', '/api/auth/register', '/api/user/profile', '/api/auth/logout'];
      const isSensitiveRoute = sensitiveRoutes.some(route => path.startsWith(route));
      
      if (capturedJsonResponse && !isSensitiveRoute) {
        // Sanitize response - remove tokens, passwords, and sensitive fields
        const sanitized = sanitizeLogData(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(sanitized)}`;
      }

      if (logLine.length > 200) {
        logLine = logLine.slice(0, 199) + "…";
      }

      // log(logLine);
      console.log(logLine);
    }
  });

  next();
});

// Helper function to sanitize log data
function sanitizeLogData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = ['password', 'token', 'secret', 'passwordHash', 'authorization', 'cookie', 'session'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in sanitized) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  
  return sanitized;
}

(async () => {
  const [{ registerRoutes }, { ensureSemanticSearchInitialized }] = await Promise.all([
    import("./routes.js"),
    import("./services/semantic-search.js"),
  ]);
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    
    // Log detailed error server-side
    console.error('❌ Server error:', {
      method: req.method,
      path: req.path,
      status,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Send generic error to client in production
    const message = process.env.NODE_ENV === 'production' 
      ? (status >= 500 ? 'Internal server error' : err.message || 'Request failed')
      : err.message || "Internal Server Error";

    res.status(status).json({ 
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV !== "production") {
    // Use a dynamic import with a variable to prevent esbuild from bundling vite in production
    const vitePath = "./vite.js";
    const { setupVite } = await import(vitePath);
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./static.js");
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    // log(`serving on port ${port}`);
    console.log(`serving on port ${port}`);
    
    // Migrate stale DeepFolder agent instructions to Genius X1 defaults
    import('./features/hybrid-search/agents/admin/settings-storage.js').then(({ migrateStaleInstructions }) => {
      migrateStaleInstructions().catch((err: any) => {
        console.warn('[startup] migrateStaleInstructions failed:', err?.message);
      });
    });

    // Initialize semantic search embeddings in background (non-blocking)
    ensureSemanticSearchInitialized().catch((error) => {
      console.error('Failed to initialize semantic search:', error);
    });

    // Initialize model price cache from DB (seeds hardcoded values on first boot)
    import('./features/hybrid-search/connections/usage-tracking.js').then(({ initPriceCache }) => {
      initPriceCache().catch((err: any) => {
        console.warn('[startup] initPriceCache failed:', err?.message);
      });
    });

    // One-time backfill: populate datasheet_text and specifications for products
    // that have a catalog_path but are missing either column.
    // Rate-limited to avoid hammering OpenAI or the file store at startup.
    (async () => {
      try {
        const { db } = await import('./db.js');
        const { products } = await import('../shared/schema.js');
        const { sql, and, isNull, isNotNull, or } = await import('drizzle-orm');

        const rows = await db
          .select({
            id: products.id,
            name: products.name,
            category: products.category,
            description: products.description,
            catalogPath: products.catalogPath,
          })
          .from(products)
          .where(
            and(
              isNotNull(products.catalogPath),
              or(
                isNull(products.datasheetText),
                isNull(products.specifications),
              ),
            ),
          );

        if (rows.length === 0) {
          console.log('✅ [StartupBackfill] All products are up to date — nothing to backfill.');
          return;
        }

        console.log(`🔄 [StartupBackfill] Backfilling datasheet text/specs for ${rows.length} product(s)...`);
        const { autoExtractAndPersistSpecs } = await import('./routes.js');

        for (const row of rows) {
          if (!row.catalogPath) continue;
          await autoExtractAndPersistSpecs(row.id, row.catalogPath, {
            name: row.name,
            category: row.category || '',
            description: row.description || undefined,
          }).catch((err: any) =>
            console.warn(`⚠️ [StartupBackfill] product ${row.id} failed: ${err?.message || err}`)
          );
          // Short delay between products to avoid hammering OpenAI at boot.
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        console.log(`✅ [StartupBackfill] Finished backfilling ${rows.length} product(s).`);
      } catch (err: any) {
        console.warn(`⚠️ [StartupBackfill] Startup backfill encountered an error: ${err?.message || err}`);
      }
    })();
  });
})();
