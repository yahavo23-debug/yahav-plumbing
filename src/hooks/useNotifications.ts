import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY =
  "BGETmSsR4q4O56saqKoR93x9ETQZpED4I4AXJe5YY0rVCRcNlqPTh6XWPdP9_nUn_qAqqVechWDW0jVVP6DXoq4";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getOrCreateSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  // Register (or reuse existing) service worker
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Return existing subscription if we already have one
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  // Create a new subscription
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh:   json.keys.p256dh,
      auth:     json.keys.auth,
    },
    { onConflict: "user_id,endpoint" }
  );
}

export function useNotifications() {
  const isSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const permission = isSupported ? Notification.permission : ("not-supported" as const);

  /** Ask for permission, register SW, subscribe to push, save to DB. */
  const requestPermission = async (): Promise<NotificationPermission | "not-supported"> => {
    if (!isSupported) return "not-supported";

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm;

    try {
      const sub = await getOrCreateSubscription();
      if (sub) await saveSubscription(sub);
    } catch (err) {
      console.error("Push subscription setup error:", err);
    }

    return perm;
  };

  /**
   * Send a push notification via the Edge Function.
   * Falls back to a local (in-tab) notification if the call fails.
   */
  const notify = async (title: string, body: string, url = "/") => {
    if (!isSupported) return;

    if (Notification.permission !== "granted") return;

    // Ensure we have a subscription saved (handles first-run or SW restart)
    try {
      const sub = await getOrCreateSubscription();
      if (sub) await saveSubscription(sub);
    } catch {
      // ignore — will try local fallback below
    }

    try {
      const { error } = await supabase.functions.invoke("send-push", {
        body: { title, body, url },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Push send via Edge Function failed:", err);
      // Graceful fallback: in-tab notification
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        dir: "rtl",
        lang: "he",
      });
    }
  };

  return { requestPermission, notify, permission, isSupported };
}
