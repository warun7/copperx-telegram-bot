import { Markup } from "telegraf";
import { BotContext } from "../types";
import * as walletService from "../services/wallet.service";
import { setAuthToken } from "../utils/api";

// Define proper types for wallet data
interface WalletData {
  id: string;
  name?: string;
  network: string;
  isDefault?: boolean;
  address?: string;
  walletAddress?: string;
  balance?: string;
  balances?: Array<{
    address?: string;
    balance?: string;
    symbol?: string;
    decimals?: number;
  }>;
}

/**
 * Check if user is authenticated
 */
const checkAuth = async (ctx: BotContext): Promise<boolean> => {
  if (!ctx.session?.user) {
    await ctx.reply(
      "❌ You need to login first to view your wallets.",
      Markup.keyboard([["🔑 Login"]]).resize()
    );
    return false;
  }

  // Set auth token
  setAuthToken(ctx.session.user.token);
  return true;
};

/**
 * Format wallet network name
 */
const formatNetworkName = (network: string): string => {
  if (!network) return "Unknown";

  switch (network.toUpperCase()) {
    case "ETH":
    case "ETHEREUM":
      return "Ethereum";
    case "BSC":
    case "BINANCE":
      return "Binance Smart Chain";
    case "POLYGON":
      return "Polygon";
    case "ARBITRUM":
      return "Arbitrum";
    case "OPTIMISM":
      return "Optimism";
    case "AVALANCHE":
    case "AVAX":
      return "Avalanche";
    case "SOLANA":
    case "SOL":
      return "Solana";
    default:
      // Capitalize first letter of each word
      return network
        .split("_")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");
  }
};

/**
 * Truncate address for display
 */
const truncateAddress = (address: string): string => {
  if (!address) return "Not available";
  if (address.length <= 20) return address;
  return `${address.substring(0, 10)}...${address.substring(
    address.length - 10
  )}`;
};

/**
 * Handle wallet command
 */
export const walletsHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Show loading message
    const loadingMessage = await ctx.reply("🔄 Fetching your wallets...");

    // Get user wallets
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data as WalletData[];

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);

    if (!wallets || wallets.length === 0) {
      await ctx.reply(
        "🏦 You don't have any wallets yet. Use /createwallet to create one."
      );
      return;
    }

    // Format wallets message
    let message = "🏦 *Your Wallets*\n\n";

    wallets.forEach((wallet: WalletData, index: number) => {
      // Handle different wallet data structures
      const walletName = wallet.name || `Wallet ${index + 1}`;
      const walletAddress =
        wallet.address ||
        wallet.walletAddress ||
        (wallet.balances && wallet.balances[0]?.address) ||
        "Not available";
      const isDefault = wallet.isDefault ? " (Default)" : "";
      const networkName = formatNetworkName(wallet.network);

      message += `*${index + 1}. ${walletName}${isDefault}*\n`;
      message += `🌐 Network: ${networkName}\n`;
      message += `📝 Address: \`${walletAddress}\`\n\n`;
    });

    // Add instructions
    message += "Use /setdefault to set a default wallet for transfers.";

    // Create inline keyboard with copy buttons - use wallet index instead of full address
    const keyboard = wallets.map((wallet: WalletData, index: number) => [
      Markup.button.callback(`📋 Copy Address ${index + 1}`, `copy:${index}`),
    ]);

    // Add a button to view balances
    keyboard.push([Markup.button.callback("💰 View Balances", "balance")]);

    // Store wallet addresses in session for copy functionality
    if (!ctx.session.walletAddresses) {
      ctx.session.walletAddresses = [];
    }

    // Update session with current wallet addresses
    ctx.session.walletAddresses = wallets.map(
      (wallet) =>
        wallet.address ||
        wallet.walletAddress ||
        (wallet.balances && wallet.balances[0]?.address) ||
        ""
    );

    await ctx.reply(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(keyboard),
    });
  } catch (error) {
    console.error("Error fetching wallets:", error);

    // Provide more detailed error feedback
    let errorMessage = "❌ Failed to fetch wallets. Please try again later.";

    if (error instanceof Error) {
      console.error(`Error details: ${error.message}`);

      // Check for network or API-specific errors
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ETIMEDOUT")
      ) {
        errorMessage =
          "❌ Network error: Unable to connect to the Copperx API. Please check your internet connection.";
      } else if (error.message.includes("401")) {
        errorMessage =
          "❌ Authentication error: Your session may have expired. Please login again.";
      } else if (error.message.includes("403")) {
        errorMessage =
          "❌ Access denied: You don't have permission to view wallets.";
      }
    }

    await ctx.reply(errorMessage);
  }
};

/**
 * Handle balance command
 */
export const balanceHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Show loading message
    const loadingMessage = await ctx.reply("🔄 Fetching your balances...");

    // Get user balances
    const balancesResponse = await walletService.getWalletBalances();
    const walletBalances = balancesResponse.data as WalletData[];

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);

    if (!walletBalances || walletBalances.length === 0) {
      await ctx.reply(
        "💰 You don't have any balances yet. Use /deposit to add funds."
      );
      return;
    }

    // Format balances message
    let message = "💰 *Your Balances*\n\n";
    let totalBalance = 0;

    // Handle the API response structure which might be different than expected
    walletBalances.forEach((wallet: WalletData) => {
      const networkName = formatNetworkName(wallet.network);

      // Check if wallet has balances array
      if (wallet.balances && wallet.balances.length > 0) {
        wallet.balances.forEach((balance) => {
          // Safely parse balance with validation
          let balanceAmount = 0;
          if (balance.balance && !isNaN(parseFloat(balance.balance))) {
            balanceAmount = parseFloat(balance.balance);
          }

          totalBalance += balanceAmount;
          const symbol = balance.symbol || "USDC";
          message += `*${networkName}*: ${balanceAmount.toFixed(
            2
          )} ${symbol}\n`;
        });
      } else {
        // Handle case where balance is directly on the wallet object
        let balanceAmount = 0;
        if (wallet.balance && !isNaN(parseFloat(wallet.balance as string))) {
          balanceAmount = parseFloat(wallet.balance as string);
        }

        totalBalance += balanceAmount;
        message += `*${networkName}*: ${balanceAmount.toFixed(2)} USDC\n`;
      }
    });

    // Add total balance
    message += `\n*Total Balance*: ${totalBalance.toFixed(2)} USDC\n\n`;

    // Add actions
    message += "What would you like to do?\n";
    message += "• /deposit - Add funds to your wallet\n";
    message += "• /send - Send funds to another user\n";
    message += "• /withdraw - Withdraw funds to external wallet";

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error fetching balances:", error);

    // Provide more detailed error feedback
    let errorMessage = "❌ Failed to fetch balances. Please try again later.";

    if (error instanceof Error) {
      console.error(`Error details: ${error.message}`);

      // Check for specific error types
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ETIMEDOUT")
      ) {
        errorMessage =
          "❌ Network error: Unable to connect to the Copperx API. Please check your internet connection.";
      } else if (error.message.includes("401")) {
        errorMessage =
          "❌ Authentication error: Your session may have expired. Please login again.";
      }
    }

    await ctx.reply(errorMessage);
  }
};

/**
 * Handle set default wallet command
 */
export const setDefaultWalletHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Get user wallets
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data as WalletData[];

    if (!wallets || wallets.length === 0) {
      await ctx.reply(
        "🏦 You don't have any wallets yet. Use /createwallet to create one."
      );
      return;
    }

    // If only one wallet, set it as default
    if (wallets.length === 1) {
      await walletService.setDefaultWallet(wallets[0].id);
      await ctx.reply(
        `✅ Your wallet "${
          wallets[0].name || "Wallet 1"
        }" has been set as default.`
      );
      return;
    }

    // Create inline keyboard for wallet selection
    const keyboard = wallets.map((wallet: WalletData, index: number) => [
      Markup.button.callback(
        `${wallet.name || `Wallet ${index + 1}`} (${formatNetworkName(
          wallet.network
        )})${wallet.isDefault ? " ✓" : ""}`,
        `setdefault:${wallet.id}`
      ),
    ]);

    await ctx.reply("🏦 Select a wallet to set as default:", {
      ...Markup.inlineKeyboard(keyboard),
    });
  } catch (error) {
    console.error("Error fetching wallets:", error);
    await ctx.reply("❌ Failed to fetch wallets. Please try again later.");
  }
};

/**
 * Handle set default wallet selection
 */
export const handleSetDefaultWallet = async (
  ctx: BotContext,
  walletId: string
) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Set default wallet
    await walletService.setDefaultWallet(walletId);

    // Get updated wallet info
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data as WalletData[];
    const defaultWallet = wallets.find((w) => w.id === walletId);

    if (defaultWallet) {
      await ctx.answerCbQuery(
        `✅ ${defaultWallet.name || "Wallet"} set as default wallet`
      );
      await ctx.reply(
        `✅ Your wallet "${
          defaultWallet.name || "Wallet"
        }" has been set as default.`
      );
    } else {
      await ctx.answerCbQuery("✅ Default wallet updated");
      await ctx.reply("✅ Your default wallet has been updated.");
    }
  } catch (error) {
    console.error("Error setting default wallet:", error);
    await ctx.answerCbQuery("❌ Failed to set default wallet");
    await ctx.reply("❌ Failed to set default wallet. Please try again later.");
  }
};

/**
 * Handle copy address action
 */
export const handleCopyAddress = async (ctx: BotContext, indexStr: string) => {
  try {
    const index = parseInt(indexStr);

    // Check if we have wallet addresses in session
    if (!ctx.session.walletAddresses || !ctx.session.walletAddresses[index]) {
      await ctx.answerCbQuery("❌ Address not found");
      return;
    }

    const address = ctx.session.walletAddresses[index];
    const truncated = truncateAddress(address);

    await ctx.answerCbQuery(`📋 Address copied: ${truncated}`);
    await ctx.reply(`📋 *Wallet Address Copied*\n\n\`${address}\``, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error handling copy address:", error);
    await ctx.answerCbQuery("❌ Failed to copy address");
  }
};
