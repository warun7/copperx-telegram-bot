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

    // Check KYC status using the global function
    const kycApproved = await authService.isKycApproved();

    if (!kycApproved) {
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

    const buttons: Array<Array<any>> = [];

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

      // Add view button to inline keyboard
      if (transaction.id) {
        buttons.push([
          Markup.button.callback(
            `🔍 View Details #${index + 1}`,
            `view:transfer:${transaction.id}`
          ),
        ]);
      }

      message += "\n";
    });

    // Add pagination info
    if (pagination) {
      message += `Page ${page} of ${pagination.totalPages} (${pagination.totalItems} transactions)\n`;
    }

    // Create pagination buttons
    const paginationButtons = [];

    // Previous page button
    if (page > 1) {
      paginationButtons.push(
        Markup.button.callback("◀️ Previous", "history:prev")
      );
    }

    // Next page button
    if (pagination && page < pagination.totalPages) {
      paginationButtons.push(Markup.button.callback("Next ▶️", "history:next"));
    }

    // Add refresh button
    paginationButtons.push(
      Markup.button.callback("🔄 Refresh", "history:refresh")
    );

    // Combine all buttons
    const allButtons = [...buttons];
    if (paginationButtons.length > 0) {
      allButtons.push(paginationButtons);
    }

    // Send message with pagination buttons
    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: allButtons,
      },
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
  if (!(await checkAuth(ctx))) return;

  try {
    // Check KYC status
    const kycApproved = await authService.isKycApproved();

    if (!kycApproved) {
      await ctx.reply(
        "❌ Your KYC is not approved. You cannot perform transfers until your KYC is approved.\n\n" +
          "Please complete your KYC on the Copperx platform.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return;
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
      return;
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
  } catch (error) {
    console.error("Error checking transfer eligibility:", error);
    await ctx.reply(
      "❌ Failed to verify transfer eligibility. Please try again later."
    );
  }
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
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: "transfer:confirm" },
            { text: "❌ Cancel", callback_data: "transfer:cancel" },
          ],
        ],
      },
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
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: "transfer:confirm" },
            { text: "❌ Cancel", callback_data: "transfer:cancel" },
          ],
        ],
      },
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
  if (!(await checkAuth(ctx))) return;

  try {
    // Check KYC status
    const kycApproved = await authService.isKycApproved();

    if (!kycApproved) {
      await ctx.reply(
        "❌ Your KYC is not approved. You cannot perform withdrawals until your KYC is approved.\n\n" +
          "Please complete your KYC on the Copperx platform.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return;
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
      return;
    }

    // Check wallet balance
    const balanceResponse = await walletService.getWalletBalance();
    if (
      !balanceResponse.data ||
      !balanceResponse.data.balance ||
      parseFloat(balanceResponse.data.balance) <= 0
    ) {
      await ctx.reply(
        "❌ Your wallet doesn't have sufficient balance to perform withdrawals.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return;
    }

    await ctx.reply(
      "Select withdrawal method:",
      Markup.inlineKeyboard([
        Markup.button.callback("To External Wallet", "withdraw:wallet"),
        Markup.button.callback("To Bank Account", "withdraw:bank"),
      ])
    );
  } catch (error) {
    console.error("Error checking withdrawal eligibility:", error);
    await ctx.reply(
      "❌ Failed to verify withdrawal eligibility. Please try again later."
    );
  }
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
    // Check KYC status
    const kycApproved = await authService.isKycApproved();

    if (!kycApproved) {
      await ctx.reply(
        "❌ Your KYC is not approved. You cannot perform deposits until your KYC is approved.\n\n" +
          "Please complete your KYC on the Copperx platform.",
        Markup.keyboard([
          ["💰 Balance", "📜 History"],
          ["👤 Profile", "ℹ️ Help"],
        ]).resize()
      );
      return;
    }

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
        reply_markup: {
          inline_keyboard: buttons,
        },
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
 * Show deposit network selection
 */
export const showDepositNetworkSelection = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Define supported networks with their chain IDs
    const supportedNetworks = [
      { name: "Polygon", chainId: "137" },
      { name: "Arbitrum", chainId: "42161" },
      { name: "Ethereum", chainId: "1" },
      { name: "Base", chainId: "8453" },
      { name: "Optimism", chainId: "10" },
      { name: "BSC", chainId: "56" },
      { name: "Avalanche", chainId: "43114" },
      { name: "Blast", chainId: "23434" },
    ];

    // Create inline keyboard for network selection
    const buttons = supportedNetworks.map((network) => [
      Markup.button.callback(
        `Deposit to ${network.name}`,
        `deposit:${network.chainId}`
      ),
    ]);

    await ctx.reply(
      "💰 *Deposit Funds*\n\n" + "Select the network you want to deposit to:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: buttons,
        },
      }
    );
  } catch (error) {
    console.error("Error showing deposit network selection:", error);
    await ctx.reply(
      "❌ Failed to show deposit options. Please try again later."
    );
  }
};

/**
 * Handle deposit network selection with fallback method
 */
export const handleDepositNetworkSelection = async (
  ctx: BotContext,
  network: string
) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Show loading message
    const loadingMsg = await ctx.reply("⏳ Preparing deposit information...");

    // Network parameter is now the chainId directly from our updated showDepositNetworkSelection
    const chainId = network;
    const networkName = formatNetworkName(chainId);

    console.log(
      `Setting up deposit for network: ${networkName} (chainId: ${chainId})`
    );

    // Get user's wallets
    const walletsResponse = await walletService.getWallets();
    const wallets = walletsResponse.data;

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

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

    // Find wallet for the selected network
    const wallet = wallets.find(
      (w: any) => w.network === chainId || w.chainId === chainId
    );

    if (!wallet) {
      await ctx.reply(
        `❌ You don't have a wallet for ${networkName} network.\n\n` +
          "Would you like to generate one?",
        Markup.inlineKeyboard([
          Markup.button.callback(
            `Generate ${networkName} Wallet`,
            `generate:${chainId}`
          ),
        ])
      );
      return;
    }

    // Format deposit instructions
    let message = `💰 *Deposit USDC on ${networkName}*\n\n`;
    message += "To deposit funds, send USDC to your wallet address:\n\n";
    message += `\`${wallet.walletAddress}\`\n\n`;
    message += "⚠️ *Important Notes:*\n";
    message += `• Only send USDC on the ${networkName} network\n`;
    message += "• Minimum deposit amount: 1 USDC\n";
    message += "• Deposits typically take 5-20 minutes to be credited\n\n";
    message +=
      "You will receive a notification once your deposit is credited to your account.";

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📜 View Transaction History",
              callback_data: "history:refresh",
            },
          ],
        ],
      },
    });
  } catch (error: any) {
    console.error("Error setting up deposit form:", error);

    let errorMessage = "❌ Failed to set up deposit form.";
    if (error.message) {
      errorMessage += ` ${error.message}`;
    }

    await ctx.reply(
      `${errorMessage}\n\nPlease try again or select a different network.`
    );

    // Try to recover by showing network selection again
    await showDepositNetworkSelection(ctx);
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
 * Handle deposit amount input
 */
export const handleDepositAmountInput = async (
  ctx: BotContext,
  amount: string
) => {
  if (!(await checkAuth(ctx))) return;

  if (!ctx.session.depositState) {
    await ctx.reply(
      "❌ Invalid session state. Please start the deposit process again."
    );
    return;
  }

  // Validate amount format
  const amountRegex = /^\d+(\.\d{1,6})?$/;
  if (!amountRegex.test(amount)) {
    await ctx.reply("❌ Invalid amount format. Please enter a valid number.");
    return;
  }

  // Validate minimum amount
  const numAmount = parseFloat(amount);
  if (numAmount < 1) {
    await ctx.reply(
      "❌ Minimum deposit amount is 1 USDC. Please enter a larger amount."
    );
    return;
  }

  // Check if chainId exists
  if (!ctx.session.depositState.chainId) {
    await ctx.reply(
      "❌ Missing chain ID. Please start the deposit process again."
    );
    await showDepositNetworkSelection(ctx);
    return;
  }

  try {
    // Show loading message
    const loadingMsg = await ctx.reply("⏳ Creating deposit transaction...");

    const chainId = ctx.session.depositState.chainId.toString();
    const networkName = formatNetworkName(chainId);

    console.log(
      `Creating deposit transaction: amount=${amount}, chainId=${chainId}`
    );

    // Create deposit transaction
    const response = await transferService.createDeposit(amount, chainId);
    console.log(
      "Deposit transaction response:",
      JSON.stringify(response.data, null, 2)
    );
    const deposit = response.data;

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

    // Format success message
    let message = "✅ *Deposit Transaction Created*\n\n";
    message += `*Amount:* ${amount} USDC\n`;
    message += `*Network:* ${networkName}\n`;
    message += `*Status:* ${deposit.status || "Pending"}\n\n`;

    if (deposit.paymentUrl) {
      message += `*Payment URL:* ${deposit.paymentUrl}\n\n`;
    }

    // Add deposit address information if available
    if (deposit.transactions && deposit.transactions.length > 0) {
      const transaction = deposit.transactions[0];
      if (
        transaction.depositAccount &&
        transaction.depositAccount.walletAddress
      ) {
        message += `*Deposit Address:* \`${transaction.depositAccount.walletAddress}\`\n\n`;
      }
    }

    message +=
      "You will receive a notification once your deposit is credited to your account.";

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📜 View Transaction History",
              callback_data: "history:refresh",
            },
          ],
        ],
      },
    });

    // Reset deposit state
    ctx.session.depositState = {};
  } catch (error: any) {
    console.error("Error creating deposit transaction:", error);

    // Log detailed error information
    if (error.response?.data) {
      console.error(
        "API Error Response:",
        JSON.stringify(error.response.data, null, 2)
      );

      // Log the actual constraints objects for better debugging
      if (
        error.response.data.message &&
        Array.isArray(error.response.data.message)
      ) {
        error.response.data.message.forEach((validationError: any) => {
          if (validationError.constraints) {
            console.error(
              `Constraints for ${validationError.property}:`,
              validationError.constraints
            );
          }
        });
      }
    }

    let errorMessage = "❌ Failed to create deposit transaction.";

    // Check if there's a specific error message from the API
    if (error.message && error.message.includes("Validation error")) {
      errorMessage = `❌ ${error.message}`;
    } else if (error.response?.data?.message) {
      if (Array.isArray(error.response.data.message)) {
        // Format validation errors
        const validationErrors = error.response.data.message
          .map((err: any) => {
            const field = err.property;
            let constraints = "";

            if (err.constraints) {
              // Get the actual error messages from the constraints object
              constraints = Object.values(err.constraints).join(", ");
            }

            return `${field}: ${constraints}`;
          })
          .join("; ");
        errorMessage += ` Validation error: ${validationErrors}`;
      } else {
        errorMessage += ` Error: ${error.response.data.message}`;
      }
    }

    await ctx.reply(`${errorMessage}\n\nPlease try again with a valid amount.`);

    // Show deposit network selection again to restart the process
    await showDepositNetworkSelection(ctx);
  }
};

/**
 * View specific transfer details
 */
export const viewTransferHandler = async (
  ctx: BotContext,
  transferId: string
) => {
  if (!(await checkAuth(ctx))) return;

  try {
    // Show loading message
    const loadingMessage = await ctx.reply("🔄 Fetching transfer details...");

    // Get transfer details
    const response = await transferService.getTransfer(transferId);
    const transfer = response.data;

    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);

    if (!transfer) {
      await ctx.reply(
        "❌ Transfer not found or you don't have permission to view it."
      );
      return;
    }

    // Format transfer details
    let message = "🧾 *Transfer Details*\n\n";

    message += `*ID:* ${transfer.id}\n`;
    message += `*Type:* ${transfer.type || "Unknown"}\n`;
    message += `*Status:* ${getStatusEmoji(transfer.status)} ${
      transfer.status || "Unknown"
    }\n`;
    message += `*Amount:* ${transfer.amount || "0"} ${
      transfer.currency || "USDC"
    }\n`;

    if (transfer.totalFee) {
      message += `*Fee:* ${transfer.totalFee} ${
        transfer.feeCurrency || "USDC"
      }\n`;
    }

    message += `*Date:* ${new Date(transfer.createdAt).toLocaleString()}\n\n`;

    // Add source and destination details
    if (transfer.sourceAccount) {
      message += "*From:* ";
      if (transfer.sourceAccount.type === "web3_wallet") {
        message += `Wallet (${truncateAddress(
          transfer.sourceAccount.walletAddress || ""
        )})\n`;
      } else {
        message += `${transfer.sourceAccount.type || "Unknown"}\n`;
      }
    }

    if (transfer.destinationAccount) {
      message += "*To:* ";
      if (transfer.destinationAccount.type === "web3_wallet") {
        message += `Wallet (${truncateAddress(
          transfer.destinationAccount.walletAddress || ""
        )})\n`;
      } else if (transfer.destinationAccount.payeeEmail) {
        message += `${transfer.destinationAccount.payeeEmail}\n`;
      } else {
        message += `${transfer.destinationAccount.type || "Unknown"}\n`;
      }
    }

    // Add transaction details if available
    if (transfer.transactions && transfer.transactions.length > 0) {
      message += "\n*Transaction Details:*\n";

      transfer.transactions.forEach((tx: any, index: number) => {
        message += `\n*Transaction ${index + 1}:*\n`;
        message += `*Status:* ${getStatusEmoji(tx.status)} ${
          tx.status || "Unknown"
        }\n`;

        if (tx.transactionHash) {
          message += `*Hash:* \`${tx.transactionHash}\`\n`;
        }

        if (tx.fromAmount && tx.fromCurrency) {
          message += `*Amount:* ${tx.fromAmount} ${tx.fromCurrency}\n`;
        }

        if (tx.totalFee && tx.feeCurrency) {
          message += `*Fee:* ${tx.totalFee} ${tx.feeCurrency}\n`;
        }
      });
    }

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📜 Back to History", callback_data: "history:refresh" }],
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching transfer details:", error);
    await ctx.reply(
      "❌ Failed to fetch transfer details. Please try again later."
    );
  }
};

/**
 * Handle add payee command
 */
export const addPayeeHandler = async (ctx: BotContext) => {
  if (!(await checkAuth(ctx))) return;

  await ctx.reply(
    "➕ *Add a New Payee*\n\n" +
      "To add a new payee, please enter their email address:",
    {
      parse_mode: "Markdown",
      reply_markup: Markup.forceReply().reply_markup,
    }
  );
};

/**
 * Handle create deposit transaction
 */
export const handleCreateDeposit = async (ctx: BotContext, network: string) => {
  if (!(await checkAuth(ctx))) return;

  try {
    await ctx.answerCbQuery("Starting deposit process...");

    // Simply call our new handleDepositNetworkSelection function
    await handleDepositNetworkSelection(ctx, network);
  } catch (error) {
    console.error("Error starting deposit process:", error);
    await ctx.answerCbQuery(
      "Failed to start deposit process. Please try again."
    );
    await ctx.reply(
      "❌ Failed to start deposit process. Please try again later."
    );
  }
};
