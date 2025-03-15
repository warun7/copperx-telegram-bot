import { Context, Middleware } from "telegraf";
import { BotContext } from "../types";

// In-memory session storage
const sessions = new Map<number, any>();

/**
 * Session middleware for Telegraf
 */
export const sessionMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const chatId = ctx.chat?.id;

  if (!chatId) {
    return next();
  }

  // Get session from storage or create new one
  let session = sessions.get(chatId) || {};

  // Attach session to context
  ctx.session = session;

  // Call next middleware
  await next();

  // Save session back to storage
  sessions.set(chatId, ctx.session);
};
