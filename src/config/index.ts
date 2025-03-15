import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || "",
  apiBaseUrl: process.env.API_BASE_URL || "https://income-api.copperx.io/api",
  pusher: {
    key: process.env.PUSHER_KEY || "",
    cluster: process.env.PUSHER_CLUSTER || "eu",
    authEndpoint: "/notifications/auth",
  },
  proxy: {
    host: process.env.PROXY_HOST,
    port: process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : undefined,
    auth: {
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    },
  },
  supportLink: "https://t.me/copperxcommunity/2183",
};

// Validate required environment variables
if (!config.botToken) {
  throw new Error("BOT_TOKEN environment variable is required");
}
