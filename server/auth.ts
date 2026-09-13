import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, companies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sendEmail } from "./services/mailer";

// Validate JWT_SECRET on module load
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  console.error('❌ SECURITY ERROR: JWT_SECRET environment variable must be set to a strong random value');
  console.error('   Generate a secure secret with: openssl rand -base64 32');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  } else {
    console.warn('⚠️  WARNING: Using default JWT_SECRET in development mode - DO NOT use in production!');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  companyId: number | null;
  isActive?: boolean;
}

// Generate JWT token
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      isActive: user.isActive !== false, // Default to true if not specified
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Verify JWT token
export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      role: decoded.role,
      companyId: decoded.companyId,
      isActive: decoded.isActive !== false, // Default to true if not present for backwards compatibility
    };
  } catch (error) {
    return null;
  }
}

// Extract token from request
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  // Also check cookies
  return req.cookies?.token || null;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Verify password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Create user session (simplified for JWT-based auth)
export async function createSession(userId: string): Promise<string> {
  return nanoid(); // Simple session ID for tracking
}

// Authenticate user
export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!user || !user.passwordHash) {
      return null;
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      isActive: user.isActive,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

// Register new user
export async function registerUser(userData: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  companyName?: string;
}): Promise<{ user: AuthUser; token: string; sessionId: string } | null> {
  try {
    const hashedPassword = await hashPassword(userData.password);
    
    // If registering as company admin, create company first
    let companyId = null;
    if (userData.role === "company_admin" && userData.companyName) {
      const [company] = await db
        .insert(companies)
        .values({
          name: userData.companyName,
          description: `Welcome to ${userData.companyName}`,
          industry: "Manufacturing",
          location: "Not specified",
          website: "",
          colorTheme: "blue",
        })
        .returning();
      companyId = company.id;
    }

    const userId = nanoid();
    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        role: userData.role || "public",
        companyId,
      })
      .returning();

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      isActive: user.isActive,
    };

    const token = generateToken(authUser);
    const sessionId = await createSession(user.id);

    // Notify admin about the new pending registration
    const displayName = [userData.firstName, userData.lastName].filter(Boolean).join(" ") || userData.email;
    const companyLine = userData.companyName ? `\nCompany: ${userData.companyName}` : "";
    sendEmail({
      to: "info@deepfolder.ai",
      subject: `New registration request — ${displayName}`,
      text: [
        `A new user has registered and is awaiting approval.`,
        ``,
        `Name: ${displayName}`,
        `Email: ${userData.email}${companyLine}`,
        ``,
        `Please review and approve or reject their request in the DeepFolder admin panel under Access Requests.`,
      ].join("\n"),
      html: `
        <p>A new user has registered and is awaiting approval.</p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Name</td><td style="padding:4px 0"><strong>${displayName}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td style="padding:4px 0">${userData.email}</td></tr>
          ${userData.companyName ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Company</td><td style="padding:4px 0">${userData.companyName}</td></tr>` : ""}
        </table>
        <p style="margin-top:16px">Please review and approve or reject their request in the <strong>DeepFolder admin panel</strong> under <em>Access Requests</em>.</p>
      `,
    }).catch((err) => {
      console.warn("[Registration] Admin notification email failed:", err.message);
    });

    return { user: authUser, token, sessionId };
  } catch (error) {
    console.error("Registration error:", error);
    return null;
  }
}

// Authentication middleware
export async function requireAuth(req: any, res: Response, next: NextFunction) {
  const token = extractToken(req);
  
  if (!token) {
    console.log("🔍 No authentication token found");
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = verifyToken(token);
  if (!user) {
    console.log("🔍 Invalid authentication token");
    return res.status(401).json({ error: "Invalid token" });
  }

  // Check current user status in database (critical for real-time suspension enforcement)
  try {
    const [currentUser] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!currentUser || currentUser.isActive === false) {
      console.log(`⛔ Suspended user attempted access: ${user.email}`);
      return res.status(403).json({ 
        error: "Account suspended", 
        message: "Your account has been suspended. Please contact support for assistance." 
      });
    }
  } catch (error) {
    console.error("Error checking user status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  req.user = user;
  next();
}

// Company admin middleware
export function requireCompanyAdmin(req: any, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "company_admin") {
    return res.status(403).json({ error: "Company admin access required" });
  }
  next();
}

// Get user profile with company info
export async function getUserProfile(userId: string) {
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        companyId: users.companyId,
        profileImageUrl: users.profileImageUrl,
        companyName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(eq(users.id, userId));

    return user || null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}