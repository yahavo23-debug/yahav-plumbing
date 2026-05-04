// Supabase Edge Function — check-upcoming
// Called every 5 minutes by pg_cron.
// Finds service calls and personal events starting in ~60 minutes and sends
// push notifications to every device that has a subscription for that user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@3.6.7";

const CRON_SECRET       = Deno.env.get("CRON_SECRET")       ?? "yahav-push-cron-k9x2m";
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "BGETmSsR4q4O56saqKoR93x9ETQZpED4I4AXJe5YY0rVCRcNlqPTh6XWPdP9_nUn_qAqqVechWDW0jVVP6DXoq4";
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

async function sendPushToUser(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  title: string,
  body: string,
  url: string,
  adminClient: ReturnType<typeof createClient>
) {
  const payload = JSON.stringify({ title, body, url, icon: "/favicon.ico", badge: "/favicon.ico", tag: "upcoming-" + Date.now() });
  const stale: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600 }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient      = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Fetch all push subscriptions grouped by user ──────────────────────
    const { data: allSubs, error: subsErr } = await adminClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth");

    if (subsErr || !allSubs || allSubs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user_id
    const subsByUser: Record<string, typeof allSubs> = {};
    for (const s of allSubs) {
      (subsByUser[s.user_id] ??= []).push(s);
    }

    const userIds = Object.keys(subsByUser);
    let totalSent = 0;

    // ── 2. Service calls starting in 55–60 minutes ────────────────────────────
    const { data: upcomingCalls } = await adminClient
      .from("service_calls")
      .select("id, scheduled_at, job_type, notes, customers(name)")
      .gte("scheduled_at", new Date(Date.now() + 55 * 60 * 1000).toISOString())
      .lt( "scheduled_at", new Date(Date.now() + 60 * 60 * 1000).toISOString())
      .not("status", "in", '("completed","cancelled")');

    if (upcomingCalls && upcomingCalls.length > 0) {
      for (const call of upcomingCalls) {
        const scheduledAt   = new Date(call.scheduled_at);
        const timeStr       = scheduledAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
        const customerName  = (call.customers as { name: string } | null)?.name || "לקוח";
        const jobLabel      = call.job_type || "קריאת שירות";

        const title = `🔔 פגישה בעוד שעה — ${customerName}`;
        const body  = `${timeStr} • ${jobLabel}${call.notes ? ` • ${call.notes.slice(0, 60)}` : ""}`;
        const url   = `/service-calls/${call.id}`;

        // Send to ALL users with subscriptions (service calls are team-wide)
        for (const uid of userIds) {
          await sendPushToUser(subsByUser[uid], title, body, url, adminClient);
          totalSent += subsByUser[uid].length;
        }
      }
    }

    // ── 3. Personal events starting in 55–60 minutes ──────────────────────────
    // Compare date + time as a timestamp in UTC (events are stored as local date+time)
    const nowPlus55 = new Date(Date.now() + 55 * 60 * 1000);
    const nowPlus60 = new Date(Date.now() + 60 * 60 * 1000);

    // Format as "YYYY-MM-DD HH:MM" to compare with date + time columns
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

    const { data: upcomingEvents } = await adminClient
      .from("personal_events")
      .select("id, user_id, date, time, title")
      .in("user_id", userIds)
      .filter("(date || ' ' || time)::timestamp", "gte", fmt(nowPlus55))
      .filter("(date || ' ' || time)::timestamp", "lt",  fmt(nowPlus60));

    if (upcomingEvents && upcomingEvents.length > 0) {
      for (const ev of upcomingEvents) {
        const timeStr = (ev.time as string).slice(0, 5); // HH:MM
        const title   = `📅 פגישה בעוד שעה — ${ev.title}`;
        const body    = `${timeStr} • ${ev.title}`;
        const url     = "/calendar";

        const subs = subsByUser[ev.user_id];
        if (subs) {
          await sendPushToUser(subs, title, body, url, adminClient);
          totalSent += subs.length;
        }
      }
    }

    console.log(`check-upcoming: sent ${totalSent} pushes`);
    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-upcoming error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
