import { nanoid } from 'nanoid';
import { storage } from './storage';

// Simple in-memory token store for reliable browser authentication
const tokenStore = new Map<string, { userId: string, expiresAt: number }>();

export function generateAuthToken(userId: string): string {
  const token = nanoid(32);
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  tokenStore.set(token, { userId, expiresAt });
  
  // Clean up expired tokens
  cleanupExpiredTokens();
  
  return token;
}

export async function validateAuthToken(token: string) {
  const tokenData = tokenStore.get(token);
  
  if (!tokenData || tokenData.expiresAt < Date.now()) {
    if (tokenData) {
      tokenStore.delete(token);
    }
    return null;
  }
  
  const user = await storage.getUser(tokenData.userId);
  return user;
}

export function revokeAuthToken(token: string) {
  tokenStore.delete(token);
}

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tokenStore.entries()) {
    if (data.expiresAt < now) {
      tokenStore.delete(token);
    }
  }
}

// Clean up expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);