import api from "../utils/api";
import Pusher from "pusher-js";
import { config } from "../config";

/**
 * Authenticate with the notification service
 * @param socketId - Pusher socket ID
 * @param channelName - Pusher channel name
 */
export const authenticatePusher = async (
  socketId: string,
  channelName: string
) => {
  return api.post("/notifications/auth", {
    socket_id: socketId,
    channel_name: channelName,
  });
};

/**
 * Initialize Pusher client for real-time notifications
 * @param token - Authentication token
 * @param organizationId - Organization ID
 * @param onDepositCallback - Callback function to handle deposit events
 */
export const initializePusher = (
  token: string,
  organizationId: string,
  onDepositCallback: (data: any) => void
) => {
  const pusherClient = new Pusher(config.pusher.key, {
    cluster: config.pusher.cluster,
    authorizer: (channel) => ({
      authorize: async (socketId, callback) => {
        try {
          const response = await api.post(
            "/notifications/auth",
            {
              socket_id: socketId,
              channel_name: channel.name,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (response.data) {
            callback(null, response.data);
          } else {
            callback(new Error("Pusher authentication failed"), null);
          }
        } catch (error) {
          console.error("Pusher authorization error:", error);
          callback(error as Error, null);
        }
      },
    }),
  });

  // Subscribe to organization's private channel
  const channel = pusherClient.subscribe(`private-org-${organizationId}`);

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("Successfully subscribed to private channel");
  });

  channel.bind("pusher:subscription_error", (error: any) => {
    console.error("Subscription error:", error);
  });

  // Bind to the deposit event
  channel.bind("deposit", (data: any) => {
    onDepositCallback(data);
  });

  return pusherClient;
};
