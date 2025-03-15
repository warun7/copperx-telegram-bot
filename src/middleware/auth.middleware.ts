import { Context, Middleware } from "telegraf";
import { BotContext } from "../types";
import { setAuthToken, isTokenExpired } from "../utils/api";
import { refreshToken } from "../services/auth.service";

/**
 * Middleware to handle authentication
 */
export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
  // Check if user session exists
  if (ctx.session?.user) {
    // Check if token is expired
    if (isTokenExpired()) {
      console.log("Session token expired, attempting to refresh...");

      try {
        // Try to refresh the token
        const newToken = await refreshToken();

        if (newToken) {
          // Update session with new token
          ctx.session.user.token = newToken.token;
          setAuthToken(newToken.token, newToken.expiresIn);
          console.log("Session token refreshed successfully");
        } else {
          // Clear session if refresh fails
          console.log("Failed to refresh token, clearing session");
          ctx.session.user = undefined;
        }
      } catch (error) {
        console.error("Error refreshing session token:", error);
        // Clear session on error
        ctx.session.user = undefined;
      }
    } else {
      // Set auth token from session
      setAuthToken(ctx.session.user.token);
    }
  }

  return next();
};

/**
 * Middleware to require authentication for protected routes
 */
export const requireAuth: Middleware<BotContext> = async (ctx, next) => {
  // Initialize session if not exists
  if (!ctx.session) {
    ctx.session = {};
  }

  // Check if user is authenticated
  if (!ctx.session.user) {
    await ctx.reply("❌ You need to login first to use this feature.", {
      reply_markup: {
        keyboard: [["🔑 Login"]],
        resize_keyboard: true,
      },
    });
    return;
  }

  // Set auth token for API calls
  setAuthToken(ctx.session.user.token);

  return next();
};
