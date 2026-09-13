import rateLimit from "express-rate-limit";
import type { Request } from "express";

function emailFromBody(req: Request): string {
  const raw = req.body?.email;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "";
}

export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const email = emailFromBody(req);
    return email ? `login:email:${email}` : `login:ip:${req.ip ?? "unknown"}`;
  },
  skip: (req) => req.method !== "POST",
  handler: (req, res) => {
    const email = emailFromBody(req);
    console.warn(`⚠️  Login rate limit exceeded for email: ${email || req.ip}`);
    res.status(429).json({
      error: "Too many login attempts",
      message: "Too many login attempts for this account. Please try again in 15 minutes.",
    });
  },
});

export const registerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const email = emailFromBody(req);
    return email ? `register:email:${email}` : `register:ip:${req.ip ?? "unknown"}`;
  },
  skip: (req) => req.method !== "POST",
  handler: (req, res) => {
    const email = emailFromBody(req);
    console.warn(`⚠️  Registration rate limit exceeded for email: ${email || req.ip}`);
    res.status(429).json({
      error: "Too many registration attempts",
      message: "Too many registration attempts for this email. Please try again in 1 hour.",
    });
  },
});
