import api from "../utils/api";

/**
 * Get all wallets for the authenticated user
 */
export const getWallets = async () => {
  return api.get("/wallets");
};

/**
 * Get wallet balances for the authenticated user
 */
export const getWalletBalances = async () => {
  try {
    const response = await api.get("/wallets/balances");
    return response;
  } catch (error) {
    console.error("Error fetching wallet balances:", error);
    // Return empty data instead of throwing
    return { data: [] };
  }
};

/**
 * Set a wallet as the default wallet
 * @param walletId - The ID of the wallet to set as default
 */
export const setDefaultWallet = async (walletId: string) => {
  return api.post("/wallets/default", { walletId });
};

/**
 * Get the default wallet for the authenticated user
 */
export const getDefaultWallet = async () => {
  try {
    const response = await api.get("/wallets/default");
    return response;
  } catch (error) {
    console.error("Error fetching default wallet:", error);
    // Return empty data instead of throwing
    return { data: null };
  }
};

export const getWalletBalance = async () => {
  try {
    const response = await api.get("/wallets/balance");
    return response;
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    // Return empty data instead of throwing
    return { data: null };
  }
};

export const generateWallet = async (network: string) => {
  return api.post("/wallets", { network });
};
