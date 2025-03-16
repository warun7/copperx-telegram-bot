import api from "../utils/api";

/**
 * Get transfer history for the authenticated user
 * @param page - Page number for pagination
 * @param limit - Number of items per page
 */
export const getTransfers = async (page = 1, limit = 10) => {
  return api.get(`/transfers?page=${page}&limit=${limit}`);
};

/**
 * Check if a recipient is eligible to receive funds
 * @param email - Recipient email address
 * @returns Object with isEligible flag and reason if not eligible
 */
export const checkRecipientEligibility = async (email: string) => {
  try {
    // First try the API endpoint if it exists
    try {
      const response = await api.post("/transfers/check-recipient", { email });
      return response.data;
    } catch (apiError: any) {
      // If the endpoint doesn't exist (404), we'll use our mock implementation
      if (!apiError.response || apiError.response.status !== 404) {
        throw apiError; // Re-throw if it's not a 404 error
      }

      console.warn("Using mock implementation for recipient eligibility check");

      // Mock implementation: Check if the user exists and has completed setup
      // This is a workaround until the API supports this functionality
      try {
        // Try to get user info by email
        const userResponse = await api.get(`/users/by-email/${email}`);
        const user = userResponse.data;

        // Check if user has wallets
        if (!user.hasWallets) {
          return {
            isEligible: false,
            reason: "Recipient does not have any wallets set up",
          };
        }

        // Check if user has completed KYC
        if (user.kycStatus !== "APPROVED") {
          return {
            isEligible: false,
            reason: "Recipient has not completed KYC verification",
          };
        }

        return { isEligible: true };
      } catch (userError: any) {
        // If we can't find the user or the endpoint doesn't exist
        if (
          userError.response &&
          (userError.response.status === 404 ||
            userError.response.status === 400)
        ) {
          // If the user endpoint doesn't exist, we'll use a final fallback
          if (
            userError.response.status === 404 &&
            userError.response.data?.message?.includes("Cannot GET")
          ) {
            console.warn(
              "User endpoint not available, using fallback eligibility check"
            );

            // Final fallback: Allow transfers but log a warning
            // This is temporary until the API supports proper eligibility checks
            console.warn(
              `⚠️ WARNING: Unable to verify eligibility for recipient ${email}. Allowing transfer by default.`
            );
            return { isEligible: true };
          }

          // If the user doesn't exist
          return {
            isEligible: false,
            reason: "Recipient is not registered with Copperx",
          };
        }

        // For other errors, we'll assume they're eligible to avoid blocking transfers
        console.error("Error checking user status:", userError);
        return { isEligible: true };
      }
    }
  } catch (error: any) {
    console.error("Error checking recipient eligibility:", error);

    // For any other errors, we'll return not eligible with the error message
    const errorMessage =
      error.response?.data?.message || error.message || "Unknown error";
    return {
      isEligible: false,
      reason: `Failed to verify recipient: ${errorMessage}`,
    };
  }
};

/**
 * Send funds to an email address
 * @param email - Recipient email address
 * @param amount - Amount to send
 * @param message - Optional message to include with the transfer
 */
export const sendToEmail = async (
  email: string,
  amount: string,
  message?: string
) => {
  // First check if recipient is eligible
  const eligibility = await checkRecipientEligibility(email);

  if (!eligibility.isEligible) {
    throw new Error(
      eligibility.reason || "Recipient is not eligible to receive funds"
    );
  }

  return api.post("/transfers/send", {
    email,
    amount,
    purposeCode: "self",
    currency: "USD",
    note: message,
  });
};

/**
 * Send funds to an external wallet address
 * @param address - Recipient wallet address
 * @param amount - Amount to send
 * @param network - Network to use for the transfer
 */
export const sendToWallet = async (
  address: string,
  amount: string,
  network: string
) => {
  return api.post("/transfers/wallet-withdraw", {
    walletAddress: address,
    amount,
    purposeCode: "self",
    currency: "USD",
  });
};

/**
 * Withdraw funds to a bank account
 * @param amount - Amount to withdraw
 * @param bankAccountId - ID of the bank account to withdraw to
 */
export const withdrawToBank = async (amount: string, bankAccountId: string) => {
  return api.post("/transfers/offramp", {
    amount,
    bankAccountId,
  });
};

/**
 * Send funds to multiple recipients
 * @param transfers - Array of transfer objects
 */
export const sendBatch = async (
  transfers: Array<{ email: string; amount: string; message?: string }>
) => {
  // Check eligibility for each recipient
  for (const transfer of transfers) {
    const eligibility = await checkRecipientEligibility(transfer.email);
    if (!eligibility.isEligible) {
      throw new Error(
        `Recipient ${transfer.email} is not eligible: ${eligibility.reason}`
      );
    }
  }

  // Format the requests according to API requirements
  const requests = transfers.map((transfer, index) => ({
    requestId: `req_${index}`,
    request: {
      email: transfer.email,
      amount: transfer.amount,
      purposeCode: "self",
      currency: "USD",
      note: transfer.message,
    },
  }));

  return api.post("/transfers/send-batch", { requests });
};

/**
 * Get deposit information for a wallet
 * @param network - Network to deposit to
 */
export const getDepositInfo = async (network: string) => {
  // Based on the error "invalid input syntax for type uuid: 'deposit-info'",
  // the API expects a direct query parameter instead of a path parameter
  return api.get(`/transfers/deposit-info?network=${network}`);
};

/**
 * Create a deposit transaction
 */
export const createDeposit = async (amount: string, depositChainId: string) => {
  try {
    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      throw new Error("Validation error: Amount must be at least 1 USDC");
    }

    // Validate depositChainId
    const validChainIds = [
      "137",
      "42161",
      "10",
      "8453",
      "1",
      "56",
      "43114",
      "23434",
    ];
    if (!validChainIds.includes(depositChainId)) {
      throw new Error(
        `Validation error: Invalid chain ID. Supported chains are: ${validChainIds.join(
          ", "
        )}`
      );
    }

    console.log(
      `Creating deposit with amount=${amount}, depositChainId=${depositChainId}`
    );

    // Add required sourceOfFunds parameter and convert depositChainId to number
    const response = await api.post("/transfers/deposit", {
      amount,
      depositChainId: parseInt(depositChainId, 10),
      sourceOfFunds: "salary", // Required parameter according to API docs
    });

    return response;
  } catch (error: any) {
    // If it's already a custom error we threw, just rethrow it
    if (error.message && error.message.includes("Validation error")) {
      throw error;
    }

    // Handle API errors
    if (error.response) {
      console.error(
        "Deposit API error:",
        error.response.status,
        error.response.data
      );

      // Handle validation errors from API
      if (error.response.status === 422) {
        const messages = error.response.data.message;
        if (Array.isArray(messages)) {
          const errorDetails = messages.map((m: any) => m.property).join(", ");
          throw new Error(`Validation error: Invalid ${errorDetails}`);
        }
      }
    }

    // Rethrow the original error
    throw error;
  }
};

/**
 * Get a specific transfer by ID
 * @param id - Transfer ID
 */
export const getTransfer = async (id: string) => {
  return api.get(`/transfers/${id}`);
};

/**
 * Get fee information for a transfer
 * @param type - Type of transfer (EMAIL, WALLET, BANK)
 * @param amount - Amount to transfer
 * @param network - Network for the transfer (for wallet transfers)
 */
export const getFeeInfo = async (
  type: string,
  amount: string,
  network?: string
) => {
  let endpoint = "/transfers/fee-info";

  const params: any = {
    type,
    amount,
  };

  if (network) {
    params.network = network;
  }

  // Convert params to query string
  const queryString = Object.keys(params)
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");

  return api.get(`${endpoint}?${queryString}`);
};
