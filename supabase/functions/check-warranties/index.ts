// Supabase Edge Function — check-warranties
// רצה פעם ביום (pg_cron). סופרת את תוקף האחריות של כל המוצרים:
// - אחריות שנכנסת ל-30 הימים האחרונים שלה → התראת "עומדת לפוג" (פעם אחת)
// - אחריות שפגה → התראת "פגה" (פעם אחת)
// ההתראות נשלחות בפוש לכל המכשירים הרשומים.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@3.6.7";

const CRON_SECRET       = Deno.env.get("CRON_SECRET")       ?? "";
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

webpush.setVapidDetails(
  "mailto:admin@yahav-plumbing.co.il",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

async function sendPushToAll(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  title: string,
  body: string,
  url: string,
  adminClient: ReturnType<typeof createClient>
) {
  const payload = JSON.stringify({ title, body, url, icon: "/favicon.ico", badge: "/favicon.ico", tag: "warranty-" + Date.now() });
  const stale: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 86400 }
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) stale.push(sub.id);
      else console.error("push error:", status, err);
    }
  }
  if (stale.length > 0) {
    await adminClient.from("push_subscriptions").delete().in("id", stale);
  }
}

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("he-IL");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    const allSubs = (subs || []) as any[];

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    let sent = 0;

    // 1) אחריות שנכנסת לחודש האחרון שלה — התראה חד-פעמית
    const { data: expiring } = await adminClient
      .from("warranties")
      .select("id, product_name, warranty_until, customer_id, customers(name)")
      .gte("warranty_until", today)
      .lte("warranty_until", in30)
      .is("expiry_notified_at", null);

    for (const w of (expiring || []) as any[]) {
      const daysLeft = Math.ceil((new Date(w.warranty_until + "T23:59:59").getTime() - Date.now()) / 86400000);
      if (allSubs.length > 0) {
        await sendPushToAll(
          allSubs,
          "🛡 אחריות עומדת להיגמר",
          `${w.product_name} של ${w.customers?.name || "לקוח"} — נגמרת ב-${fmtDate(w.warranty_until)} (בעוד ${daysLeft} ימים)`,
          `/customers/${w.customer_id}?tab=warranties`,
          adminClient
        );
        sent++;
      }
      await adminClient.from("warranties")
        .update({ expiry_notified_at: new Date().toISOString() })
        .eq("id", w.id);
    }

    // 2) אחריות שפגה — התראה חד-פעמית
    const { data: expired } = await adminClient
      .from("warranties")
      .select("id, product_name, warranty_until, customer_id, customers(name)")
      .lt("warranty_until", today)
      .is("expired_notified_at", null);

    for (const w of (expired || []) as any[]) {
      if (allSubs.length > 0) {
        await sendPushToAll(
          allSubs,
          "🔴 אחריות נגמרה",
          `${w.product_name} של ${w.customers?.name || "לקוח"} — האחריות הסתיימה ב-${fmtDate(w.warranty_until)}`,
          `/customers/${w.customer_id}?tab=warranties`,
          adminClient
        );
        sent++;
      }
      await adminClient.from("warranties")
        .update({ expired_notified_at: new Date().toISOString() })
        .eq("id", w.id);
    }

    return new Response(JSON.stringify({ sent, expiring: (expiring || []).length, expired: (expired || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-warranties error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
