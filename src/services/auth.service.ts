import api, { setAuthToken } from "../utils/api";

export const requestEmailOTP = async (email: string) => {
  console.log(`Requesting OTP for email: ${email}`);
  const response = await api.post("/auth/email-otp/request", { email });
  console.log("OTP request response:", response.data);
  return response.data; // This should include the sid
};

export const authenticateWithOTP = async (
  email: string,
  otp: string,
  sid: string
) => {
  console.log(
    `Authenticating with OTP for email: ${email}, OTP: ${otp}, SID: ${sid}`
  );
  try {
    const response = await api.post("/auth/email-otp/authenticate", {
      email,
      otp,
      sid,
    });
    console.log("Authentication successful:", response.data);

    // Extract token and expiry information
    const { accessToken, expireAt } = response.data;

    if (accessToken) {
      // Calculate expiresIn in seconds
      const expiresIn = expireAt
        ? Math.floor((new Date(expireAt).getTime() - Date.now()) / 1000)
        : undefined;

      // Set auth token with expiry
      setAuthToken(accessToken, expiresIn);
    }

    return response.data;
  } catch (error: any) {
    console.error("Authentication error:", error.message);
    if (error.response) {
      console.error("Error response status:", error.response.status);
      console.error(
        "Error response data:",
        JSON.stringify(error.response.data, null, 2)
      );

      // Check if there's a specific validation error message
      if (error.response.data && error.response.data.message) {
        if (Array.isArray(error.response.data.message)) {
          console.error("Validation errors:", error.response.data.message);
        } else {
          console.error("Error message:", error.response.data.message);
        }
      }
    }
    throw error;
  }
};

/**
 * Refresh the authentication token
 * @returns New token information or null if refresh fails
 */
export const refreshToken = async () => {
  try {
    const response = await api.post("/auth/refresh-token");

    if (response.data && response.data.accessToken) {
      const { accessToken, expireAt } = response.data;

      // Calculate expiresIn in seconds
      const expiresIn = expireAt
        ? Math.floor((new Date(expireAt).getTime() - Date.now()) / 1000)
        : 24 * 60 * 60; // Default: 24 hours

      return {
        token: accessToken,
        expiresIn,
      };
    }

    return null;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
};

export const getUserProfile = async () => {
  return api.get("/auth/me");
};

export const getKYCStatus = async () => {
  return api.get("/kycs");
};
