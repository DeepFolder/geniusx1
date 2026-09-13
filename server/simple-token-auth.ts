import jwt from 'jsonwebtoken';
import type { User } from '@shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function extractTokenFromRequest(req: any): string | null {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log("TOKEN FOUND in Authorization header");
    return authHeader.substring(7);
  }
  
  // Check cookies
  const token = req.cookies?.authToken;
  if (token) {
    console.log("TOKEN FOUND in cookies");
    return token;
  }
  
  console.log("NO TOKEN FOUND - Headers:", req.headers.authorization ? "has auth" : "no auth", "Cookies:", req.cookies?.authToken ? "has cookie" : "no cookie");
  return null;
}