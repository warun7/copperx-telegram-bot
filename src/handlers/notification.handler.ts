import { Telegraf } from "telegraf";
import Pusher from "pusher-js";
import { BotContext } from "../types";
import { config } from "../config";
import { setAuthToken } from "../utils/api";
import * as walletService from "../services/wallet.service";

// Store active Pusher instances by user
const activePusherInstances: { [key: string]: Pusher } = {};

/**
 * Format currency amount with proper decimal places
 */
const formatAmount = (
  amount: string | number,
  decimals: number = 2
): string => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return numAmount.toFixed(decimals);
};

/**
 * Format network name to be more user-friendly
 */
const formatNetworkName = (network: string): string => {
  const networkMap: { [key: string]: string } = {
    "1": "Ethereum",
    "137": "Polygon",
    "56": "BSC",
    "42161": "Arbitrum",
    "8453": "Base",
    "23434": "Blast",
  };

  return networkMap[network] || network;
};

/**
 * Initialize Pusher for a user
 * @param bot - Telegraf bot instance
 * @param chatId - Telegram chat ID
 * @param token - User's auth token
 * @param organizationId - User's organization ID
 */
export const initializeUserPusher = (
  bot: Telegraf<BotContext>,
  chatId: number,
  token: string,
  organizationId: string
) => {
  // Check if Pusher is already initialized for this user
  const instanceKey = `${chatId}:${organizationId}`;
  if (activePusherInstances[instanceKey]) {
    console.log(`Pusher already initialized for user ${instanceKey}`);
    return;
  }

  try {
    console.log(`Initializing Pusher for user ${instanceKey}`);

    // Set auth token for API calls
    setAuthToken(token);

    // Initialize Pusher
    const pusher = new Pusher(config.pusher.key, {
      cluster: config.pusher.cluster,
      authEndpoint: `${config.apiBaseUrl}/notifications/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Subscribe to private channel for this organization
    const channel = pusher.subscribe(`private-organization.${organizationId}`);

    // Listen for deposit events
    channel.bind("deposit", async (data: any) => {
      console.log(`Deposit event received for user ${instanceKey}:`, data);

      try {
        // Format deposit notification message
        let message = "💰 *New Deposit Received!*\n\n";

        // Add transaction details
        if (data.transaction) {
          const tx = data.transaction;

          // Add amount and currency
          if (tx.amount) {
            const amount = formatAmount(tx.amount, tx.decimals || 2);
            const symbol = tx.symbol || "USDC";
            message += `*Amount:* ${amount} ${symbol}\n`;
          }

          // Add network
          if (tx.network) {
            const networkName = formatNetworkName(tx.network);
            message += `*Network:* ${networkName}\n`;
          }

          // Add transaction hash with link if available
          if (tx.hash) {
            const explorerUrl = getExplorerUrl(tx.network, tx.hash);
            if (explorerUrl) {
              message += `*Transaction:* [View on Explorer](${explorerUrl})\n`;
            } else {
              message += `*Transaction Hash:* \`${tx.hash}\`\n`;
            }
          }

          // Add status
          if (tx.status) {
            const statusEmoji =
              tx.status.toLowerCase() === "completed" ? "✅" : "⏳";
            message += `*Status:* ${statusEmoji} ${tx.status}\n`;
          }

          // Add timestamp
          if (tx.createdAt) {
            const date = new Date(tx.createdAt);
            message += `*Time:* ${date.toLocaleString()}\n`;
          }
        } else {
          // Fallback for minimal data
          message += "A new deposit has been received in your wallet.\n";
        }

        // Add call to action
        message += "\nUse /balance to check your updated wallet balance.";

        // Send notification to user
        await bot.telegram.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });

        // Refresh wallet balances in the background
        try {
          await walletService.getWalletBalances();
        } catch (error) {
          console.error("Error refreshing wallet balances:", error);
        }
      } catch (error) {
        console.error(
          `Error processing deposit notification for user ${instanceKey}:`,
          error
        );
      }
    });

    // Listen for withdrawal events
    channel.bind("withdrawal", async (data: any) => {
      console.log(`Withdrawal event received for user ${instanceKey}:`, data);

      try {
        // Format withdrawal notification message
        let message = "📤 *Withdrawal Processed*\n\n";

        // Add transaction details
        if (data.transaction) {
          const tx = data.transaction;

          // Add amount and currency
          if (tx.amount) {
            const amount = formatAmount(tx.amount, tx.decimals || 2);
            const symbol = tx.symbol || "USDC";
            message += `*Amount:* ${amount} ${symbol}\n`;
          }

          // Add network
          if (tx.network) {
            const networkName = formatNetworkName(tx.network);
            message += `*Network:* ${networkName}\n`;
          }

          // Add recipient if available
          if (tx.recipient) {
            message += `*Recipient:* ${tx.recipient}\n`;
          }

          // Add transaction hash with link if available
          if (tx.hash) {
            const explorerUrl = getExplorerUrl(tx.network, tx.hash);
            if (explorerUrl) {
              message += `*Transaction:* [View on Explorer](${explorerUrl})\n`;
            } else {
              message += `*Transaction Hash:* \`${tx.hash}\`\n`;
            }
          }

          // Add status
          if (tx.status) {
            const statusEmoji =
              tx.status.toLowerCase() === "completed" ? "✅" : "⏳";
            message += `*Status:* ${statusEmoji} ${tx.status}\n`;
          }

          // Add timestamp
          if (tx.createdAt) {
            const date = new Date(tx.createdAt);
            message += `*Time:* ${date.toLocaleString()}\n`;
          }
        } else {
          // Fallback for minimal data
          message += "Your withdrawal has been processed.\n";
        }

        // Add call to action
        message += "\nUse /balance to check your updated wallet balance.";

        // Send notification to user
        await bot.telegram.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error(
          `Error processing withdrawal notification for user ${instanceKey}:`,
          error
        );
      }
    });

    // Store Pusher instance
    activePusherInstances[instanceKey] = pusher;
    console.log(`Pusher initialized for user ${instanceKey}`);
  } catch (error) {
    console.error(`Error initializing Pusher for user ${instanceKey}:`, error);
  }
};

/**
 * Get blockchain explorer URL for a transaction
 */
const getExplorerUrl = (network: string, txHash: string): string | null => {
  const explorers: { [key: string]: string } = {
    "1": "https://etherscan.io/tx/",
    "137": "https://polygonscan.com/tx/",
    "56": "https://bscscan.com/tx/",
    "42161": "https://arbiscan.io/tx/",
    "8453": "https://basescan.org/tx/",
    "23434": "https://blastscan.io/tx/",
  };

  return explorers[network] ? `${explorers[network]}${txHash}` : null;
};

/**
 * Clean up Pusher instances for a user
 */
export const cleanupUserPusher = (chatId: number, organizationId: string) => {
  const instanceKey = `${chatId}:${organizationId}`;
  if (activePusherInstances[instanceKey]) {
    console.log(`Cleaning up Pusher for user ${instanceKey}`);
    activePusherInstances[instanceKey].disconnect();
    delete activePusherInstances[instanceKey];
  }
};
