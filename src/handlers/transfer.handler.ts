import { Markup } from "telegraf";
import { BotContext, Transfer } from "../types";
import * as transferService from "../services/transfer.service";
import * as walletService from "../services/wallet.service";
import { setAuthToken } from "../utils/api";
import * as authService from "../services/auth.service";

/**
 * Check if user is authenticated
 */
const checkAuth = async (ctx: BotContext): Promise<boolean> => {
  if (!ctx.session?.user) {
    await ctx.reply(
      "❌ You need to login first to use this feature.",
      Markup.keyboard([["🔑 Login"]]).resize()
    );
    return false;
  }

  // Set auth token
  setAuthToken(ctx.session.user.token);
  return true;
};

/**
 * Check if user can perform transfers
 */
const canPerformTransfers = async (ctx: BotContext): Promise<boolean> => {
  if (!ctx.session?.user) {
    await ctx.reply(
      "❌ You need to login first to perform transfers.",
      Markup.keyboard([["🔑 Login"]]).resize()
    );
    return false;
  }

  try {
    // Set auth token
    setAuthToken(ctx.session.user.token);

    // Get user profile to check KYC status
    const profileResponse = await authService.getUserProfile();
    const user = profileResponse.data;

    // Check KYC status
    if (user.status !== "APPROVED") {
      await ctx.reply(
        "❌ Your KYC is not approved. You cannot perform transfers until your KYC is approved.\n\n" +
          "Please complete your KYC on the Copperx platform.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return false;
    }

    // Check if user has a default wallet
    const walletResponse = await walletService.getDefaultWallet();
    if (!walletResponse.data || !walletResponse.data.walletAddress) {
      await ctx.reply(
        "❌ You don't have a default wallet set up. Please set up a wallet first.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return false;
    }

    // Check wallet balance
    const balanceResponse = await walletService.getWalletBalance();
    if (
      !balanceResponse.data ||
      !balanceResponse.data.balance ||
      parseFloat(balanceResponse.data.balance) <= 0
    ) {
      await ctx.reply(
        "❌ Your wallet doesn't have sufficient balance to perform transfers.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking transfer eligibility:", error);
    await ctx.reply(
      "❌ Failed to verify transfer eligibility. Please try again later."
    );
    return false;
  }
};

/**
 * Handle transaction history command
 */
export const historyHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  // Initialize history state if not exists
  if (!ctx.session.historyState) {
    ctx.session.historyState = {
      page: 1,
      limit: 5,
    };
  } else {
    // Reset to first page when command is called directly
    ctx.session.historyState.page = 1;
  }

  await fetchAndDisplayHistory(ctx);
};

/**
 * Fetch and display transaction history
 */
const fetchAndDisplayHistory = async (ctx: BotContext) => {
  if (!ctx.session.historyState) {
    ctx.session.historyState = {
      page: 1,
      limit: 5,
    };
  }

  const { page, limit } = ctx.session.historyState;

  try {
    // Show loading message
    const loadingMessage = await ctx.reply(
      "🔄 Fetching your transaction history..."
    );

    // Get transaction history
    const response = await transferService.getTransfers(page, limit);
    const { data, pagination } = response.data;

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);

    if (!data || data.length === 0) {
      await ctx.reply("📭 You don't have any transactions yet.");
      return;
    }

    // Format transaction history
    let message = "📋 *Transaction History*\n\n";

    data.forEach((transaction: any, index: number) => {
      const date = new Date(transaction.createdAt).toLocaleDateString();
      const time = new Date(transaction.createdAt).toLocaleTimeString();

      message += `*${index + 1}. ${transaction.type}*\n`;
      message += `📅 Date: ${date} ${time}\n`;

      if (transaction.amount) {
        const prefix = transaction.direction === "OUTGOING" ? "-" : "+";
        message += `💰 Amount: ${prefix}${transaction.amount} USDC\n`;
      }

      if (transaction.status) {
        const statusEmoji = getStatusEmoji(transaction.status);
        message += `${statusEmoji} Status: ${transaction.status}\n`;
      }

      if (transaction.recipient) {
        message += `👤 Recipient: ${transaction.recipient}\n`;
      }

      if (transaction.sender) {
        message += `👤 Sender: ${transaction.sender}\n`;
      }

      if (transaction.network) {
        message += `🌐 Network: ${formatNetworkName(transaction.network)}\n`;
      }

      if (transaction.txHash) {
        message += `🔗 TX: \`${transaction.txHash}\`\n`;
      }

      message += "\n";
    });

    // Add pagination info
    if (pagination) {
      message += `Page ${page} of ${pagination.totalPages} (${pagination.totalItems} transactions)\n`;
    }

    // Create pagination buttons
    const buttons = [];

    // Previous page button
    if (page > 1) {
      buttons.push(Markup.button.callback("◀️ Previous", "history:prev"));
    }

    // Next page button
    if (pagination && page < pagination.totalPages) {
      buttons.push(Markup.button.callback("Next ▶️", "history:next"));
    }

    // Add refresh button
    buttons.push(Markup.button.callback("🔄 Refresh", "history:refresh"));

    // Send message with pagination buttons
    await ctx.reply(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([buttons]),
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    await ctx.reply(
      "❌ Failed to fetch transaction history. Please try again later."
    );
  }
};

/**
 * Get emoji for transaction status
 */
const getStatusEmoji = (status: string): string => {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "✅";
    case "PENDING":
      return "⏳";
    case "FAILED":
      return "❌";
    case "PROCESSING":
      return "🔄";
    default:
      return "ℹ️";
  }
};

/**
 * Handle history pagination
 */
export const handleHistoryPagination = async (
  ctx: BotContext,
  action: string
) => {
  if (!(await checkAuth(ctx))) return;

  // Initialize history state if not exists
  if (!ctx.session.historyState) {
    ctx.session.historyState = {
      page: 1,
      limit: 5,
    };
  }

  // Update page based on action
  if (action === "prev" && ctx.session.historyState.page > 1) {
    ctx.session.historyState.page--;
  } else if (action === "next") {
    ctx.session.historyState.page++;
  } else if (action === "refresh") {
    // Keep the same page, just refresh
  }

  // Fetch and display history with updated page
  await fetchAndDisplayHistory(ctx);
};

/**
 * Send command handler
 */
export const sendHandler = async (ctx: BotContext) => {
  // Check if user can perform transfers
  if (!(await canPerformTransfers(ctx))) {
    return;
  }

  // Initialize session if not exists
  if (!ctx.session) {
    ctx.session = {};
  }

  // Set transfer state
  ctx.session.transferState = {
    type: "EMAIL",
    recipient: undefined,
    amount: undefined,
  };

  await ctx.reply(
    "Please enter the recipient's email address:",
    Markup.forceReply().placeholder("Enter recipient email")
  );
};

/**
 * Handle email input for transfer
 */
export const handleEmailInput = async (ctx: BotContext, email: string) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.transferState) {
    ctx.session.transferState = {};
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    await ctx.reply(
      "❌ Invalid email format. Please enter a valid email address."
    );
    return;
  }

  // Store recipient email
  ctx.session.transferState.type = "EMAIL";
  ctx.session.transferState.recipient = email;

  await ctx.reply(
    "Please enter the amount to send (in USDC):",
    Markup.forceReply().placeholder("Enter amount")
  );
};

/**
 * Handle amount input for transfer
 */
export const handleAmountInput = async (ctx: BotContext, amount: string) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.transferState) {
    await ctx.reply(
      "❌ Invalid session state. Please start the transfer process again."
    );
    return;
  }

  // Validate amount format
  const amountRegex = /^\d+(\.\d{1,6})?$/;
  if (!amountRegex.test(amount)) {
    await ctx.reply("❌ Invalid amount format. Please enter a valid number.");
    return;
  }

  // Store amount
  ctx.session.transferState.amount = amount;

  // Get transfer details
  const transferType = ctx.session.transferState.type || "EMAIL"; // Default to EMAIL if undefined
  const recipient = ctx.session.transferState.recipient;
  const network = ctx.session.transferState.network;

  try {
    // Get fee information
    const feeResponse = await transferService.getFeeInfo(
      transferType,
      amount,
      network
    );
    const feeInfo = feeResponse.data;

    // Format confirmation message with fee details
    let confirmMessage = "📤 *Confirm Transfer*\n\n";

    if (transferType === "EMAIL") {
      confirmMessage += `*Recipient:* ${recipient}\n`;
      confirmMessage += `*Amount:* ${amount} USDC\n`;
    } else if (transferType === "WALLET") {
      confirmMessage += `*Recipient Address:* \`${recipient}\`\n`;
      confirmMessage += `*Network:* ${formatNetworkName(network || "")}\n`;
      confirmMessage += `*Amount:* ${amount} USDC\n`;
    }

    // Add fee information
    if (feeInfo) {
      if (feeInfo.fee) {
        confirmMessage += `*Fee:* ${feeInfo.fee} USDC\n`;
      }

      if (feeInfo.totalAmount) {
        confirmMessage += `*Total Amount:* ${feeInfo.totalAmount} USDC\n`;
      }

      if (feeInfo.estimatedTime) {
        confirmMessage += `*Estimated Time:* ${feeInfo.estimatedTime}\n`;
      }
    }

    confirmMessage += "\nDo you want to proceed with this transfer?";

    await ctx.reply(confirmMessage, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm", "transfer:confirm"),
          Markup.button.callback("❌ Cancel", "transfer:cancel"),
        ],
      ]),
    });
  } catch (error) {
    console.error("Error getting fee information:", error);

    // Fallback to basic confirmation without fee details
    let confirmMessage = "📤 *Confirm Transfer*\n\n";

    if (transferType === "EMAIL") {
      confirmMessage += `*Recipient:* ${recipient}\n`;
      confirmMessage += `*Amount:* ${amount} USDC\n`;
    } else if (transferType === "WALLET") {
      confirmMessage += `*Recipient Address:* \`${recipient}\`\n`;
      confirmMessage += `*Network:* ${formatNetworkName(network || "")}\n`;
      confirmMessage += `*Amount:* ${amount} USDC\n`;
    }

    confirmMessage += "\nDo you want to proceed with this transfer?";

    await ctx.reply(confirmMessage, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm", "transfer:confirm"),
          Markup.button.callback("❌ Cancel", "transfer:cancel"),
        ],
      ]),
    });
  }
};

/**
 * Handle transfer confirmation
 */
export const handleTransferConfirm = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.transferState) {
    await ctx.reply(
      "❌ Invalid session state. Please start the transfer process again."
    );
    return;
  }

  try {
    const transferType = ctx.session.transferState.type;
    const recipient = ctx.session.transferState.recipient;
    const amount = ctx.session.transferState.amount;

    // Validate required fields
    if (!recipient || !amount) {
      await ctx.reply(
        "❌ Missing recipient or amount. Please start the transfer process again."
      );
      return;
    }

    try {
      if (transferType === "EMAIL") {
        // Send to email
        await transferService.sendToEmail(recipient, amount);
      } else if (transferType === "WALLET") {
        // Send to wallet
        const network = ctx.session.transferState.network;
        if (!network) {
          await ctx.reply(
            "❌ Missing network. Please start the transfer process again."
          );
          return;
        }
        await transferService.sendToWallet(recipient, amount, network);
      }

      await ctx.editMessageText(
        "✅ Transfer initiated successfully!\n\n" +
          "You can check the status in your transaction history with /history."
      );

      // Reset transfer state
      ctx.session.transferState = {};
    } catch (error: any) {
      console.error("Error processing transfer:", error);

      // Check if this is a recipient eligibility error
      if (
        error.message &&
        (error.message.includes("not eligible") ||
          error.message.includes("Failed to verify recipient"))
      ) {
        await ctx.editMessageText(
          "❌ Transfer failed: " +
            error.message +
            "\n\n" +
            "The recipient may not have completed their account setup or KYC verification."
        );
      } else {
        await ctx.editMessageText(
          "❌ Failed to process transfer. Please try again later."
        );
      }

      // Reset transfer state
      ctx.session.transferState = {};
    }
  } catch (error) {
    console.error("Error in transfer confirmation handler:", error);
    await ctx.reply("❌ An unexpected error occurred. Please try again later.");

    // Reset transfer state
    if (ctx.session) {
      ctx.session.transferState = {};
    }
  }
};

/**
 * Handle transfer cancellation
 */
export const handleTransferCancel = async (ctx: BotContext) => {
  // Reset transfer state
  if (ctx.session) {
    ctx.session.transferState = {};
  }

  await ctx.editMessageText("❌ Transfer cancelled.");
};

/**
 * Withdraw command handler
 */
export const withdrawHandler = async (ctx: BotContext) => {
  // Check if user can perform transfers
  if (!(await canPerformTransfers(ctx))) {
    return;
  }

  await ctx.reply(
    "Select withdrawal method:",
    Markup.inlineKeyboard([
      Markup.button.callback("To External Wallet", "withdraw:wallet"),
      Markup.button.callback("To Bank Account", "withdraw:bank"),
    ])
  );
};

/**
 * Handle wallet withdrawal selection
 */
export const handleWalletWithdraw = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  // Initialize transfer state
  if (!ctx.session.transferState) {
    ctx.session.transferState = {};
  }

  ctx.session.transferState = {
    type: "WALLET",
    recipient: undefined,
    amount: undefined,
    network: undefined,
  };

  // Get available networks
  try {
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data;

    if (!wallets || wallets.length === 0) {
      await ctx.reply(
        "You don't have any wallets yet.\n\n" +
          "Please create a wallet on the Copperx platform first."
      );
      return;
    }

    // Extract unique networks
    const networksSet = new Set<string>();
    wallets.forEach((wallet: any) => {
      if (wallet.network && typeof wallet.network === "string") {
        networksSet.add(wallet.network);
      }
    });
    const networks = Array.from(networksSet);

    // Create inline keyboard for network selection
    const buttons = networks.map((network) => [
      Markup.button.callback(network, `network:${network}`),
    ]);

    await ctx.editMessageText(
      "Select network for withdrawal:",
      Markup.inlineKeyboard(buttons)
    );
  } catch (error) {
    console.error("Error fetching wallets:", error);
    await ctx.reply("❌ Failed to fetch wallets. Please try again later.");
  }
};

/**
 * Handle network selection for wallet withdrawal
 */
export const handleNetworkSelection = async (
  ctx: BotContext,
  network: string
) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.transferState) {
    ctx.session.transferState = {};
  }

  // Store network
  ctx.session.transferState.type = "WALLET";
  ctx.session.transferState.network = network;

  // Use a different approach for forcing reply
  await ctx.reply(
    `Network selected: ${network}\n\n` +
      "Please enter the recipient wallet address:",
    Markup.forceReply().placeholder("Enter wallet address")
  );
};

/**
 * Handle wallet address input for withdrawal
 */
export const handleWalletAddressInput = async (
  ctx: BotContext,
  address: string
) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.transferState) {
    ctx.session.transferState = {};
  }

  // Store recipient address
  ctx.session.transferState.recipient = address;

  await ctx.reply(
    "Please enter the amount to withdraw (in USDC):",
    Markup.forceReply().placeholder("Enter amount")
  );
};

/**
 * Handle bank withdrawal selection
 */
export const handleBankWithdraw = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  await ctx.editMessageText(
    "🏦 Bank withdrawal is currently only available through the Copperx web platform.\n\n" +
      "Please visit the Copperx platform to withdraw funds to your bank account."
  );
};

/**
 * Deposit command handler
 */
export const depositHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Get user's wallets
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data;

    if (!wallets || wallets.length === 0) {
      await ctx.reply(
        "❌ You don't have any wallets set up yet.\n\n" +
          "Would you like to generate a wallet?",
        Markup.inlineKeyboard([
          Markup.button.callback("Generate Polygon Wallet", "generate:137"),
          Markup.button.callback("Generate Arbitrum Wallet", "generate:42161"),
        ])
      );
      return;
    }

    // Extract unique networks
    const networksSet = new Set<string>();
    wallets.forEach((wallet: any) => {
      if (wallet.network && typeof wallet.network === "string") {
        networksSet.add(wallet.network);
      }
    });
    const networks = Array.from(networksSet);

    // Create inline keyboard for network selection
    const buttons = networks.map((network) => [
      Markup.button.callback(
        `Deposit to ${formatNetworkName(network)}`,
        `deposit:${network}`
      ),
    ]);

    await ctx.reply(
      "💰 *Deposit Funds*\n\n" + "Select the network you want to deposit to:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  } catch (error) {
    console.error("Error fetching wallets for deposit:", error);
    await ctx.reply("❌ Failed to fetch wallets. Please try again later.");
  }
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
 * Handle deposit network selection
 */
export const handleDepositNetworkSelection = async (
  ctx: BotContext,
  network: string
) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Get deposit information
    const depositInfoResponse = await transferService.getDepositInfo(network);
    const depositInfo = depositInfoResponse.data;

    if (!depositInfo || !depositInfo.address) {
      await ctx.editMessageText(
        "❌ Failed to get deposit information for this network. Please try again later."
      );
      return;
    }

    // Format network name
    const networkName = formatNetworkName(network);

    // Create QR code URL for the address
    const qrCodeUrl = `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${depositInfo.address}`;

    // Format deposit instructions
    let message = `💰 *Deposit to ${networkName}*\n\n`;
    message += `To deposit funds to your ${networkName} wallet, send USDC to the following address:\n\n`;
    message += `\`${depositInfo.address}\`\n\n`;

    // Add network-specific instructions
    message += "⚠️ *Important Notes:*\n";
    message += `• Make sure to send only USDC on the ${networkName} network\n`;
    message += "• Sending other tokens may result in loss of funds\n";
    message += "• Deposits typically take 5-20 minutes to be credited\n\n";

    // Add fee information if available
    if (depositInfo.fee) {
      message += `*Fee:* ${depositInfo.fee} USDC\n\n`;
    }

    message += "You will receive a notification once your deposit is credited.";

    // Send message with QR code
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📋 Copy Address",
              callback_data: `copy:${depositInfo.address}`,
            },
          ],
          [
            {
              text: "🔄 Refresh Deposit Status",
              callback_data: `refresh:deposit:${network}`,
            },
          ],
        ],
      },
    });

    // Send QR code as a separate message
    await ctx.replyWithPhoto(qrCodeUrl, {
      caption: `QR Code for your ${networkName} deposit address`,
    });
  } catch (error) {
    console.error("Error getting deposit information:", error);
    await ctx.editMessageText(
      "❌ Failed to get deposit information. Please try again later."
    );
  }
};
