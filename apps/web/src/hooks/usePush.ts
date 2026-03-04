import { supabase } from "../lib/supabase";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function registerPush(profile: { organization_id: string; user_id: string }) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
    });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      organization_id: profile.organization_id,
      user_id: profile.user_id,
      endpoint: subscription.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!))),
      user_agent: navigator.userAgent,
      is_active: true
    },
    {
      onConflict: "user_id,endpoint"
    }
  );

  if (error && error.code !== "23505") {
    throw error;
  }
}
