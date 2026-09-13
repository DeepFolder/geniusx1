import type { RequestHandler } from "express";

export const requireAI: RequestHandler = (_req, res, next) => {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({
      error: process.env.NODE_ENV === "production"
        ? "AI generation is unavailable. Contact the administrator."
        : "AI generation needs an OpenAI API key. Set OPENAI_API_KEY in .env and restart the app.",
      code: "AI_NOT_CONFIGURED",
    });
    return;
  }
  next();
};
