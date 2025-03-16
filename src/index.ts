import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "./config";
import { BotContext } from "./types";
import { sessionMiddleware } from "./middleware/session.middleware";
import { authMiddleware } from "./middleware/auth.middleware";
import * as authHandler from "./handlers/auth.handler";
import * as walletHandler from "./handlers/wallet.handler";
import * as transferHandler from "./handlers/transfer.handler";
import { initializeUserPusher } from "./handlers/notification.handler";
import { Markup } from "telegraf";
import * as authService from "./services/auth.service";
import * as walletService from "./services/wallet.service";
import { setAuthToken } from "./utils/api";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { helpHandler } from "./handlers/auth.handler";

// Create bot instance
const bot = new Telegraf<BotContext>(config.botToken);

// Register middleware
bot.use(sessionMiddleware);
bot.use(authMiddleware);

// Register command handlers
bot.command("start", authHandler.startHandler);
bot.command("help", authHandler.helpHandler);
bot.command("support", authHandler.supportHandler);
bot.command("login", authHandler.loginHandler);
bot.command("logout", authHandler.logoutHandler);
bot.command("profile", authHandler.profileHandler);
bot.command("kycstatus", authHandler.kycStatusHandler);

bot.command("balance", walletHandler.balanceHandler);
bot.command("wallets", walletHandler.walletsHandler);
bot.command("setdefault", walletHandler.setDefaultWalletHandler);

bot.command("send", transferHandler.sendHandler);
bot.command("withdraw", transferHandler.withdrawHandler);
bot.command("deposit", transferHandler.depositHandler);
bot.command("history", transferHandler.historyHandler);

// Register text handlers
bot.hears("🔑 Login", authHandler.loginHandler);
bot.hears("ℹ️ Help", authHandler.helpHandler);
bot.hears("📞 Support", authHandler.supportHandler);
bot.hears("👤 Profile", authHandler.profileHandler);
bot.hears("💰 Balance", walletHandler.balanceHandler);
bot.hears("📜 History", transferHandler.historyHandler);
bot.hears("💸 Send", transferHandler.sendHandler);
bot.hears("🏦 Withdraw", transferHandler.withdrawHandler);
bot.hears("💳 Deposit", transferHandler.depositHandler);
bot.hears("⚙️ Set Default Wallet", walletHandler.setDefaultWalletHandler);
bot.hears("📜 Transactions", transferHandler.historyHandler);
bot.hears("➕ Add Payee", transferHandler.addPayeeHandler);

// Add text message handlers for keyboard buttons
bot.hears("👤 Profile", authHandler.profileHandler);
bot.hears("🔑 Login", authHandler.loginHandler);
bot.hears("🔒 Logout", authHandler.logoutHandler);
bot.hears("ℹ️ Help", helpHandler);
bot.hears("📞 Support", authHandler.supportHandler);
bot.hears("🔑 KYC Status", authHandler.kycStatusHandler);
bot.hears("💰 Balance", walletHandler.balanceHandler);
bot.hears("🪙 Wallets", walletHandler.walletsHandler);
bot.hears("💸 Send Money", transferHandler.sendHandler);
bot.hears("📥 Deposit", transferHandler.depositHandler);
bot.hears("⚙️ Set Default Wallet", walletHandler.setDefaultWalletHandler);
bot.hears("📜 Transactions", transferHandler.historyHandler);

// Handle text messages
bot.on(message("text"), async (ctx) => {
  // Get reply message text if it exists
  const replyMessage = ctx.message.reply_to_message;
  const replyText =
    replyMessage && "text" in replyMessage ? replyMessage.text : "";

  // Check if we're awaiting email input for login
  if (
    replyText &&
    ctx.session?.authState?.awaitingOTP === false &&
    replyText.includes("enter your email address")
  ) {
    await authHandler.handleEmailInput(ctx, ctx.message.text);
    return;
  }

  // Check if we're awaiting OTP input for login
  if (
    replyText &&
    ctx.session?.authState?.awaitingOTP === true &&
    replyText.includes("enter the OTP")
  ) {
    await authHandler.handleOTPInput(ctx, ctx.message.text);
    return;
  }

  // Check if we're awaiting email input for transfer
  if (
    replyText &&
    ctx.session?.transferState?.type === "EMAIL" &&
    replyText.includes("recipient's email address")
  ) {
    await transferHandler.handleEmailInput(ctx, ctx.message.text);
    return;
  }

  // Check if we're awaiting wallet address input for transfer
  if (
    replyText &&
    ctx.session?.transferState?.type === "WALLET" &&
    replyText.includes("recipient wallet address")
  ) {
    await transferHandler.handleWalletAddressInput(ctx, ctx.message.text);
    return;
  }

  // Check if we're awaiting amount input for transfer
  if (replyText && ctx.session?.transferState && replyText.includes("amount")) {
    await transferHandler.handleAmountInput(ctx, ctx.message.text);
    return;
  }

  // Check if we're awaiting deposit amount input
  if (
    replyText &&
    ctx.session?.depositState &&
    replyText.includes("amount you want to deposit")
  ) {
    await transferHandler.handleDepositAmountInput(ctx, ctx.message.text);
    return;
  }

  // If none of the above conditions match, show the help menu for unknown commands
  console.log("Unknown command received:", ctx.message.text);
  await authHandler.helpHandler(ctx);
});

// Handle callback queries
bot.action(/setdefault:(.+)/, async (ctx) => {
  const walletId = ctx.match[1];
  await walletHandler.handleSetDefaultWallet(ctx, walletId);
});

// Add handlers for login callbacks
bot.action("login:new_otp", async (ctx) => {
  // Get email from session
  const email = ctx.session?.authState?.email;

  if (!email) {
    await ctx.editMessageText(
      "❌ Session expired. Please start the login process again."
    );
    return;
  }

  try {
    // Request new OTP
    const response = await authService.requestEmailOTP(email);

    // Update session state
    if (ctx.session && ctx.session.authState) {
      ctx.session.authState.awaitingOTP = true;
      ctx.session.authState.sid = response.sid; // Store the new session ID
    }

    await ctx.editMessageText(
      "✅ A new OTP has been sent to your email address.\n\n" +
        "Please enter the OTP to complete the login process:"
    );
  } catch (error) {
    console.error("Error requesting OTP:", error);
    await ctx.editMessageText("❌ Failed to send OTP. Please try again later.");
  }
});

bot.action("login:cancel", async (ctx) => {
  // Reset auth state
  if (ctx.session) {
    ctx.session.authState = {
      email: undefined,
      awaitingOTP: false,
    };
  }

  // First edit the message
  await ctx.editMessageText(
    "❌ Login cancelled. You can try again by clicking the Login button."
  );

  // Then send a new message with keyboard
  await ctx.reply(
    "Use the buttons below to navigate:",
    Markup.keyboard([["🔑 Login"], ["ℹ️ Help", "📞 Support"]]).resize()
  );
});

bot.action("transfer:confirm", async (ctx) => {
  await transferHandler.handleTransferConfirm(ctx);
});

bot.action("transfer:cancel", async (ctx) => {
  await transferHandler.handleTransferCancel(ctx);
});

bot.action("withdraw:wallet", async (ctx) => {
  await transferHandler.handleWalletWithdraw(ctx);
});

bot.action("withdraw:bank", async (ctx) => {
  await transferHandler.handleBankWithdraw(ctx);
});

bot.action(/network:(.+)/, async (ctx) => {
  const network = ctx.match[1];
  await transferHandler.handleNetworkSelection(ctx, network);
});

// Initialize Pusher for authenticated users
bot.on("message", async (ctx) => {
  // Check if user is authenticated and has organization ID
  if (ctx.session?.user?.token && ctx.session.user.organizationId) {
    // Initialize Pusher for this user
    initializeUserPusher(
      bot,
      ctx.chat.id,
      ctx.session.user.token,
      ctx.session.user.organizationId
    );
  }
});

// Add handlers for wallet generation
bot.action(/generate:(.+)/, async (ctx) => {
  const network = ctx.match[1];

  if (!ctx.session?.user) {
    await ctx.editMessageText(
      "❌ You need to login first to generate a wallet."
    );
    return;
  }

  try {
    // Set auth token
    setAuthToken(ctx.session.user.token);

    // Generate wallet
    const response = await walletService.generateWallet(network);
    const wallet = response.data;

    // Set as default if it's the first wallet
    try {
      const defaultWalletResponse = await walletService.getDefaultWallet();
      if (!defaultWalletResponse.data) {
        await walletService.setDefaultWallet(wallet.id);
      }
    } catch (error) {
      console.error("Error setting default wallet:", error);
    }

    const networkName =
      network === "137"
        ? "Polygon"
        : network === "42161"
        ? "Arbitrum"
        : network === "8453"
        ? "Base"
        : network === "23434"
        ? "Blast"
        : network;

    await ctx.editMessageText(
      `✅ ${networkName} wallet generated successfully!\n\n` +
        `Address: ${wallet.walletAddress}\n\n` +
        `Use /wallets to view all your wallets.`
    );
  } catch (error) {
    console.error("Error generating wallet:", error);
    await ctx.editMessageText(
      "❌ Failed to generate wallet. Please try again later."
    );
  }
});

// Add handler for deposit network selection
bot.action(/^deposit:(.+)$/, async (ctx) => {
  const network = ctx.match[1];
  await transferHandler.handleDepositNetworkSelection(ctx, network);
});

// Add handler for creating deposit transaction
bot.action(/^create:deposit:(.+)$/, async (ctx) => {
  const network = ctx.match[1];
  await transferHandler.handleCreateDeposit(ctx, network);
});

// Add handler for viewing specific transfer
bot.action(/^view:transfer:(.+)$/, async (ctx) => {
  const transferId = ctx.match[1];
  await transferHandler.viewTransferHandler(ctx, transferId);
});

// Add handler for copy address
bot.action(/copy:(.+)/, async (ctx) => {
  const index = ctx.match[1];
  await walletHandler.handleCopyAddress(ctx, index);
});

// Add handler for refresh deposit status
bot.action(/refresh:deposit:(.+)/, async (ctx) => {
  const network = ctx.match[1];
  try {
    await ctx.answerCbQuery("Creating a new deposit transaction...");
    await transferHandler.handleCreateDeposit(ctx, network);
  } catch (error) {
    console.error("Error creating deposit transaction:", error);
    await ctx.answerCbQuery("Failed to create deposit transaction");
    await ctx.reply(
      "❌ Failed to create deposit transaction. Please try again later."
    );
  }
});

// Register history pagination handlers
bot.action(/history:(prev|next|refresh)/, async (ctx) => {
  const action = ctx.match[1];
  await transferHandler.handleHistoryPagination(ctx, action);
});

// Add handler for login button in welcome message
bot.action("login", async (ctx) => {
  await ctx.answerCbQuery("Starting login process...");
  await authHandler.loginHandler(ctx);
});

// Add handler for "View Balances" button
bot.action("balance", walletHandler.balanceHandler);

// Create a simple HTTP server for Render
const PORT = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    // Health check endpoint
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        message: "Copperx Telegram Bot is running",
      })
    );
  } else {
    // Default response
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html>
        <head>
          <title>Copperx Telegram Bot</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              line-height: 1.6;
            }
            h1 {
              color: #2c3e50;
            }
            .container {
              border: 1px solid #ddd;
              border-radius: 5px;
              padding: 20px;
              margin-top: 20px;
            }
            .status {
              color: #27ae60;
              font-weight: bold;
            }
            a {
              color: #3498db;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <h1>Copperx Telegram Bot</h1>
          <div class="container">
            <p><span class="status">✅ Bot is running</span></p>
            <p>This is the web server for the Copperx Telegram Bot.</p>
            <p>To use the bot, search for it on Telegram and start a conversation.</p>
            <p><a href="https://t.me/copperxcommunity/2183" target="_blank">Join our community</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// Start both the HTTP server and the bot
server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);

  // Create a flag file to indicate the bot is running
  const lockFile = path.join(__dirname, "bot.lock");

  try {
    // Check if another instance is running
    if (fs.existsSync(lockFile)) {
      const lockData = fs.readFileSync(lockFile, "utf8");
      const lockTime = new Date(lockData);
      const now = new Date();

      // If the lock is older than 1 minute, it might be stale
      if (now.getTime() - lockTime.getTime() < 60 * 1000) {
        console.log(
          "Another bot instance appears to be running. This instance will only serve HTTP requests."
        );
        return;
      } else {
        console.log("Found a stale lock file. Overwriting it.");
        // Force remove the stale lock file
        try {
          fs.unlinkSync(lockFile);
        } catch (unlinkError) {
          console.error("Error removing stale lock file:", unlinkError);
        }
      }
    }

    // Create or update the lock file
    fs.writeFileSync(lockFile, new Date().toISOString());

    // Start bot with a small delay to ensure any previous instance has fully terminated
    setTimeout(() => {
      bot
        .launch()
        .then(() => {
          console.log("Bot started successfully!");
        })
        .catch((err) => {
          console.error("Error starting bot:", err);
          // Remove lock file on error
          if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
          }
        });
    }, 2000);

    // Remove lock file on exit
    const removeLock = () => {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log("Lock file removed.");
      }
    };

    process.on("exit", removeLock);
    process.on("SIGINT", removeLock);
    process.on("SIGTERM", removeLock);
  } catch (error) {
    console.error("Error managing bot lock file:", error);
    // Start bot anyway as fallback with a delay
    setTimeout(() => {
      bot
        .launch()
        .then(() => console.log("Bot started successfully!"))
        .catch((err) => console.error("Error starting bot:", err));
    }, 3000);
  }
});

// Enable graceful stop
const shutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  bot.stop(signal);
  server.close();
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
