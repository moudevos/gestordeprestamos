import webpush from "web-push";
import { env } from "./env.js";

const pushEnabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);

if (pushEnabled) {
  webpush.setVapidDetails("mailto:admin@example.com", env.vapidPublicKey, env.vapidPrivateKey);
}

export async function sendPushNotification(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: object) {
  if (!pushEnabled) {
    return;
  }

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    },
    JSON.stringify(payload)
  );
}
