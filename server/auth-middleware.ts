import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db, withDbRetry } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

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

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  // Check cookies for token (multiple possible cookie names)
  const cookieToken = req.cookies?.token || req.cookies?.authToken || req.cookies?.jwt;
  if (cookieToken) {
    return cookieToken;
  }
  
  return null;
}

export function verifyAuthToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error: any) {
    console.log("❌ Invalid JWT token:", error.message);
    return null;
  }
}

export async function requireAuth(req: any, res: Response, next: NextFunction) {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = verifyAuthToken(token);
  if (!user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Check current user status and role in database (critical for real-time suspension
  // enforcement and role changes taking effect without requiring re-login)
  try {
    const [currentUser] = await withDbRetry(() =>
      db
        .select({ isActive: users.isActive, role: users.role, companyId: users.companyId, approvalStatus: users.approvalStatus })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
    );

    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    if (currentUser.role !== 'admin' && currentUser.approvalStatus === 'pending') {
      return res.status(403).json({ 
        error: "Account pending approval",
        code: "PENDING_APPROVAL",
        message: "Your account is awaiting admin approval. You will be notified once your request is reviewed."
      });
    }

    if (currentUser.role !== 'admin' && currentUser.approvalStatus === 'rejected') {
      return res.status(403).json({ 
        error: "Access request rejected",
        code: "ACCESS_REJECTED",
        message: "Your access request was not approved. Please contact us for more information."
      });
    }

    if (currentUser.isActive === false) {
      console.log(`⛔ Suspended user attempted access: ${user.email || user.id}`);
      return res.status(403).json({ 
        error: "Account suspended", 
        message: "Your account has been suspended. Please contact support for assistance." 
      });
    }

    // Always use the fresh role and companyId from the DB so admin/role changes
    // take effect immediately without the user having to log out and back in.
    user.role = currentUser.role;
    user.companyId = currentUser.companyId;
  } catch (error) {
    console.error("Error checking user status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  req.user = user;
  next();
}

export function requireCompanyAdmin(req: any, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "company_admin") {
    return res.status(403).json({ error: "Company admin access required" });
  }
  next();
}