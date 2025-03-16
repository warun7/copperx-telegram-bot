import axios, { AxiosProxyConfig } from "axios";
import https from "https";
import dotenv from "dotenv";
import { config } from "../config";
import { refreshToken } from "../services/auth.service";

// Load environment variables
dotenv.config();

// Create an HTTPS agent that will ignore SSL certificate validation
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // WARNING: This is insecure and should only be used in development
});

// Configure proxy if provided in environment variables
const proxyHost = process.env.PROXY_HOST;
const proxyPort = process.env.PROXY_PORT
  ? parseInt(process.env.PROXY_PORT)
  : undefined;

// Create axios instance with appropriate configuration
const api = axios.create({
  baseURL: process.env.API_BASE_URL + "/api",
  timeout: 30000,
  allowAbsoluteUrls: true,
  headers: {
    "Content-Type": "application/json",
  },
  httpsAgent: httpsAgent, // Use the HTTPS agent that ignores SSL certificate validation
  ...(proxyHost && proxyPort
    ? {
        proxy: {
          host: proxyHost,
          port: proxyPort,
          ...(process.env.PROXY_AUTH
            ? {
                auth: {
                  username: process.env.PROXY_USERNAME || "",
                  password: process.env.PROXY_PASSWORD || "",
                },
              }
            : {}),
        } as AxiosProxyConfig,
      }
    : {}),
});

let authToken: string | null = null;
let tokenExpiry: number | null = null;

// Set auth token for API calls
export const setAuthToken = (token: string, expiresIn?: number) => {
  authToken = token;
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  // Set token expiry if provided
  if (expiresIn) {
    // Convert expiresIn (seconds) to timestamp
    tokenExpiry = Date.now() + expiresIn * 1000;
  } else {
    // Default expiry: 24 hours
    tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
  }

  // Set up token refresh if expiry is provided
  if (expiresIn) {
    // Schedule token refresh 5 minutes before expiry
    const refreshTimeout = (expiresIn - 300) * 1000;
    setTimeout(async () => {
      // Implement token refresh logic here
      console.log("Token refresh needed");
    }, refreshTimeout);
  }
};

// Clear auth token
export const clearAuthToken = () => {
  authToken = null;
  tokenExpiry = null;
  delete api.defaults.headers.common["Authorization"];
};

// Check if token is expired
export const isTokenExpired = (): boolean => {
  if (!tokenExpiry) return false;

  // Consider token expired 5 minutes before actual expiry
  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  return Date.now() > tokenExpiry - bufferTime;
};

// Add request interceptor to handle auth token
api.interceptors.request.use(
  async (config) => {
    // Check if we have a token and it's not expired
    if (authToken) {
      // If token is expired, try to refresh it
      if (isTokenExpired()) {
        try {
          console.log("Token expired, attempting to refresh...");
          const newToken = await refreshToken();
          if (newToken) {
            authToken = newToken.token;
            tokenExpiry =
              Date.now() + (newToken.expiresIn || 24 * 60 * 60) * 1000;
            console.log("Token refreshed successfully");
          }
        } catch (error) {
          console.error("Failed to refresh token:", error);
          // Clear token if refresh fails
          clearAuthToken();
          // Continue with request without token
          return config;
        }
      }

      // Set Authorization header
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 Unauthorized and we haven't tried to refresh yet
    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        console.log("Unauthorized error, attempting to refresh token...");
        const newToken = await refreshToken();
        if (newToken) {
          authToken = newToken.token;
          tokenExpiry =
            Date.now() + (newToken.expiresIn || 24 * 60 * 60) * 1000;

          // Update Authorization header
          originalRequest.headers.Authorization = `Bearer ${authToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error("Failed to refresh token:", refreshError);
        // Clear token if refresh fails
        clearAuthToken();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
