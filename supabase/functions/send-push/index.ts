// Supabase Edge Function — send Web Push notifications to a user's devices
// Uses npm:web-push which handles VAPID JWT + AES-128-GCM payload encryption.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY =
  "BGETmSsR4q4O56saqKoR93x9ETQZpED4I4AXJe5YY0rVCRcNlqPTh6XWPdP9_nUn_qAqqVechWDW0jVVP6DXoq4";
const VAPID_PRIVATE_KEY = "89-hSLd7cw7SzZBWPRb3JnazGHAJxtUGNkn6RfDOKTc";

webpush.setVapidDetails(
  "mailto:admin@yahav-plumbing.co.il",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title = "יהב אינסטלציה", body = "", url = "/" } =
      await req.json();

    // Fetch push subscriptions for this user
    const { data: subs, error: subsError } = await anonClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user.id);

    if (subsError) {
      console.error("Fetch subscriptions error:", subsError.message);
      return new Response(JSON.stringify({ error: subsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      url,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "yahav-notification",
    });

    let sent = 0;
    const stale: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 86400 }
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        console.error(`Push to ${sub.id} failed:`, status, err);
        if (status === 404 || status === 410) {
          // Subscription expired — remove it
          stale.push(sub.id);
        }
      }
    }

    // Clean up stale subscriptions
    if (stale.length > 0) {
      await anonClient
        .from("push_subscriptions")
        .delete()
        .in("id", stale);
    }

    return new Response(JSON.stringify({ sent, stale: stale.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
