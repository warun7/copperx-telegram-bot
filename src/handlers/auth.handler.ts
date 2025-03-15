import { Markup } from "telegraf";
import { BotContext } from "../types";
import * as authService from "../services/auth.service";
import { setAuthToken } from "../utils/api";

/**
 * Start command handler - sent when user first interacts with the bot
 */
export const startHandler = async (ctx: BotContext) => {
  // Get user's first name if available
  const firstName = ctx.from?.first_name || "there";

  // Create a welcome message with emoji and formatting
  let welcomeMessage = `👋 *Welcome to Copperx Telegram Bot, ${firstName}!*\n\n`;

  welcomeMessage +=
    "This bot allows you to manage your Copperx wallet, send/receive USDC, and track your transactions directly from Telegram.\n\n";

  welcomeMessage += "🔑 *Getting Started*\n";
  welcomeMessage += "You need to login first before using any features:\n";
  welcomeMessage += "• /login - Connect to your Copperx account\n\n";

  welcomeMessage += "📋 *Available Commands*\n";
  welcomeMessage += "• /help - Show this help message\n";
  welcomeMessage += "• /support - Get support information\n";
  welcomeMessage += "• /profile - View your profile information\n";
  welcomeMessage += "• /logout - Disconnect your account\n\n";

  welcomeMessage += "💰 *Wallet Commands* (requires login)\n";
  welcomeMessage += "• /balance - Check your wallet balance\n";
  welcomeMessage += "• /wallets - View and manage your wallets\n";
  welcomeMessage += "• /setdefault - Set your default wallet\n\n";

  welcomeMessage += "💸 *Transfer Commands* (requires login)\n";
  welcomeMessage += "• /send - Send USDC to an email or wallet\n";
  welcomeMessage += "• /withdraw - Withdraw to external wallet\n";
  welcomeMessage += "• /deposit - Get deposit instructions\n";
  welcomeMessage += "• /history - View transaction history\n\n";

  welcomeMessage +=
    "Please start by using the /login command to connect your Copperx account.";

  // Send the welcome message with a login button
  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔑 Login", "login")]]),
  });

  // Also provide a keyboard with common commands
  await ctx.reply(
    "Use these buttons for quick access:",
    Markup.keyboard([
      ["🔑 Login", "ℹ️ Help", "📞 Support"],
      ["💰 Balance", "📜 History", "👤 Profile"],
    ]).resize()
  );
};

/**
 * Help command handler
 */
export const helpHandler = async (ctx: BotContext) => {
  // Create a help message with emoji and formatting
  let helpMessage = `📚 *Copperx Bot Commands*\n\n`;

  helpMessage += "🔑 *Authentication*\n";
  helpMessage += "• /login - Connect to your Copperx account\n";
  helpMessage += "• /logout - Disconnect your account\n";
  helpMessage += "• /profile - View your profile information\n\n";

  helpMessage += "💰 *Wallet Management*\n";
  helpMessage += "• /balance - Check your wallet balance\n";
  helpMessage += "• /wallets - View and manage your wallets\n";
  helpMessage += "• /setdefault - Set your default wallet\n\n";

  helpMessage += "💸 *Transfers*\n";
  helpMessage += "• /send - Send USDC to an email or wallet\n";
  helpMessage += "• /withdraw - Withdraw to external wallet\n";
  helpMessage += "• /deposit - Get deposit instructions\n";
  helpMessage += "• /history - View transaction history\n\n";

  helpMessage += "ℹ️ *Support*\n";
  helpMessage += "• /help - Show this help message\n";
  helpMessage += "• /support - Get support information\n\n";

  helpMessage +=
    "💡 *Tip*: Most commands require you to be logged in. Use /login first if you haven't already.";

  await ctx.reply(helpMessage, { parse_mode: "Markdown" });
};

/**
 * Support command handler
 */
export const supportHandler = async (ctx: BotContext) => {
  await ctx.reply(
    "📞 *Need help?*\n\n" +
      "Join our community for support:\n" +
      "https://t.me/copperxcommunity/2183",
    { parse_mode: "Markdown" }
  );
};

/**
 * Login command handler - initiates the login process
 */
export const loginHandler = async (ctx: BotContext) => {
  // Initialize session if not exists
  if (!ctx.session) {
    ctx.session = {};
  }

  // Reset auth state
  ctx.session.authState = {
    email: undefined,
    awaitingOTP: false,
  };

  await ctx.reply(
    "Please enter your email address to login to your Copperx account:",
    Markup.forceReply().placeholder("Enter your email")
  );
};

/**
 * Handle email input for login
 */
export const handleEmailInput = async (ctx: BotContext, email: string) => {
  if (!ctx.session) {
    ctx.session = {};
  }

  if (!ctx.session.authState) {
    ctx.session.authState = {
      awaitingOTP: false,
    };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    await ctx.reply(
      "❌ Invalid email format. Please enter a valid email address."
    );
    return;
  }

  try {
    // Request OTP
    const response = await authService.requestEmailOTP(email);

    // Update session state with email and sid
    ctx.session.authState.email = email;
    ctx.session.authState.awaitingOTP = true;
    ctx.session.authState.sid = response.sid; // Store the session ID

    console.log(
      `Stored session ID: ${ctx.session.authState.sid} for email: ${email}`
    );

    await ctx.reply(
      "✅ OTP has been sent to your email address.\n\n" +
        "Please enter the OTP to complete the login process:",
      Markup.forceReply().placeholder("Enter OTP")
    );
  } catch (error) {
    console.error("Error requesting OTP:", error);
    await ctx.reply("❌ Failed to send OTP. Please try again later.");
  }
};

/**
 * Handle OTP input for login
 */
export const handleOTPInput = async (ctx: BotContext, otp: string) => {
  if (
    !ctx.session?.authState?.email ||
    !ctx.session.authState.awaitingOTP ||
    !ctx.session.authState.sid
  ) {
    await ctx.reply(
      "❌ Invalid session state. Please start the login process again.",
      Markup.keyboard([["🔑 Login"]]).resize()
    );
    return;
  }

  // Validate OTP format (should be numeric and have appropriate length)
  if (!/^\d+$/.test(otp)) {
    await ctx.reply(
      "❌ Invalid OTP format. OTP should contain only numbers. Please try again."
    );
    return;
  }

  try {
    // Authenticate with OTP and session ID
    const response = await authService.authenticateWithOTP(
      ctx.session.authState.email,
      otp,
      ctx.session.authState.sid
    );

    if (!response.accessToken) {
      await ctx.reply("❌ Authentication failed. Please try again.");
      return;
    }

    // Set auth token for API calls
    setAuthToken(response.accessToken);

    // Get user profile
    const profileResponse = await authService.getUserProfile();
    const user = profileResponse.data;

    // Store user session
    ctx.session.user = {
      userId: user.id,
      email: user.email,
      token: response.accessToken,
      organizationId: user.organizationId,
    };

    // Reset auth state
    ctx.session.authState = {
      email: undefined,
      awaitingOTP: false,
      sid: undefined,
    };

    await ctx.reply(
      `✅ Login successful!\n\nWelcome, ${user.firstName || user.email}!`,
      Markup.keyboard([
        ["💰 Balance", "📜 History"],
        ["💸 Send", "🏦 Withdraw"],
        ["👤 Profile", "ℹ️ Help"],
      ]).resize()
    );

    // Check KYC status
    try {
      const kycResponse = await authService.getKYCStatus();
      const kyc = kycResponse.data;

      if (kyc && kyc.length > 0) {
        const latestKyc = kyc[0];
        if (latestKyc.status !== "APPROVED") {
          await ctx.reply(
            "⚠️ Your KYC is not approved yet. Some features may be limited.\n\n" +
              "Please complete your KYC on the Copperx platform."
          );
        }
      } else {
        await ctx.reply(
          "⚠️ You haven't submitted your KYC yet. Some features may be limited.\n\n" +
            "Please complete your KYC on the Copperx platform."
        );
      }
    } catch (error) {
      console.error("Error checking KYC status:", error);
    }
  } catch (error: any) {
    console.error("Error authenticating with OTP:", error);

    // Provide more detailed error messages
    let errorMessage = "❌ Authentication failed. ";
    let specificError = "";

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 422) {
        errorMessage += "The OTP validation failed. ";

        // Extract specific validation errors
        if (data && data.message && Array.isArray(data.message)) {
          specificError = JSON.stringify(data.message);

          // Check for common validation issues
          if (specificError.includes("expired")) {
            errorMessage += "The OTP has expired. Please request a new OTP.";
          } else if (specificError.includes("invalid")) {
            errorMessage += "The OTP is invalid. Please check and try again.";
          } else if (specificError.includes("sid")) {
            errorMessage += "Session expired. Please request a new OTP.";
          } else {
            errorMessage += specificError;
          }
        } else {
          errorMessage += "Please request a new OTP and try again.";
        }
      } else if (status === 401) {
        errorMessage +=
          "Invalid credentials. Please check your email and try again.";
      } else if (status === 429) {
        errorMessage +=
          "Too many attempts. Please wait a few minutes before trying again.";
      } else if (data && data.message) {
        // If the API provides a specific error message
        if (Array.isArray(data.message)) {
          errorMessage += data.message.join(", ");
        } else {
          errorMessage += data.message;
        }
      }
    } else {
      errorMessage += "Please try again later.";
    }

    await ctx.reply(errorMessage);

    // Offer to restart the login process
    await ctx.reply(
      "Would you like to request a new OTP?",
      Markup.inlineKeyboard([
        Markup.button.callback("Yes, send new OTP", "login:new_otp"),
        Markup.button.callback("No, cancel login", "login:cancel"),
      ])
    );
  }
};

/**
 * Logout command handler
 */
export const logoutHandler = async (ctx: BotContext) => {
  if (!ctx.session?.user) {
    await ctx.reply("You are not logged in.");
    return;
  }

  // Clear session
  ctx.session.user = undefined;

  await ctx.reply(
    "✅ You have been logged out successfully.",
    Markup.keyboard([["🔑 Login"], ["ℹ️ Help", "📞 Support"]]).resize()
  );
};

/**
 * Profile command handler
 */
export const profileHandler = async (ctx: BotContext) => {
  if (!ctx.session?.user) {
    await ctx.reply(
      "❌ You need to login first to view your profile.",
      Markup.keyboard([["🔑 Login"]]).resize()
    );
    return;
  }

  try {
    // Set auth token
    setAuthToken(ctx.session.user.token);

    // Get user profile
    const profileResponse = await authService.getUserProfile();
    const user = profileResponse.data;

    // Get KYC status
    const kycResponse = await authService.getKYCStatus();
    const kyc = kycResponse.data;

    let kycStatus = "Not submitted";
    if (kyc && kyc.length > 0) {
      const latestKyc = kyc[0];
      kycStatus = latestKyc.status;
    }

    await ctx.reply(
      "👤 *Your Profile*\n\n" +
        `*Email:* ${user.email}\n` +
        `*Name:* ${user.firstName || "N/A"} ${user.lastName || ""}\n` +
        `*Organization ID:* ${user.organizationId}\n` +
        `*KYC Status:* ${kycStatus}\n\n` +
        (kycStatus !== "APPROVED"
          ? "⚠️ Your KYC is not approved. Some features may be limited.\n"
          : "✅ Your KYC is approved. All features are available."),
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error fetching profile:", error);
    await ctx.reply("❌ Failed to fetch profile. Please try again later.");
  }
};
