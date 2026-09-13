import express from "express";
import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { users, passwordResetTokens } from "@shared/schema";
import { eq, and, gt, isNull, lt, or, isNotNull } from "drizzle-orm";
import { sendEmail } from "../services/mailer";

const router = express.Router();

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many password reset requests. Please try again in an hour.",
    });
  },
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(req: express.Request): string {
  const appUrl = process.env.APP_URL || process.env.SITE_URL || process.env.FRONTEND_URL;
  if (appUrl) return appUrl.replace(/\/$/, "");
  const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
  if (replitDomain) return `https://${replitDomain}`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  if (!process.env.SMTP_HOST || !smtpUser || !process.env.SMTP_PASS) {
    console.warn(`⚠️ [PasswordReset] SMTP not configured — reset URL for ${to}: ${resetUrl}`);
    return;
  }
  await sendEmail({
    to,
    subject: "Reset your DeepFolder password",
    text: [
      "You requested a password reset for your DeepFolder account.",
      "",
      "Click the link below to set a new password (expires in 1 hour):",
      "",
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <p>You requested a password reset for your DeepFolder account.</p>
      <p>Click the link below to set a new password (expires in 1 hour):</p>
      <p><a href="${resetUrl}" style="color:#2563eb">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const genericResponse = {
      message: "If that email is registered, you'll receive a reset link shortly.",
    };

    if (!email || typeof email !== "string") {
      return res.json(genericResponse);
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return res.json(genericResponse);
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      id: nanoid(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;

    try {
      await sendResetEmail(user.email, resetUrl);
    } catch (emailErr: any) {
      console.error("[PasswordReset] Email send failed:", emailErr.message);
    }

    return res.json(genericResponse);
  } catch (err: any) {
    console.error("[PasswordReset] forgot-password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== "string" || !newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ error: "Invalid request" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!row) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, row.userId));

    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.id));

    return res.json({ message: "Password updated successfully." });
  } catch (err: any) {
    console.error("[PasswordReset] reset-password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export async function cleanupExpiredResetTokens(): Promise<void> {
  try {
    const now = new Date();
    const result = await db
      .delete(passwordResetTokens)
      .where(or(lt(passwordResetTokens.expiresAt, now), isNotNull(passwordResetTokens.usedAt)));
    console.log("[PasswordReset] Cleanup: removed stale reset tokens.");
  } catch (err: any) {
    console.error("[PasswordReset] Cleanup error:", err.message);
  }
}

export default router;
