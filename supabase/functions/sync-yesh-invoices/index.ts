// Supabase Edge Function — sync-yesh-invoices
// יש חשבונית API does not support bulk document retrieval.
// Invoices sync automatically via:
//   1. create-yesh-invoice: saves to yesh_invoices on creation
//   2. yesh-webhook: real-time updates from יש חשבונית

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      synced: 0,
      message: "יש חשבונית API אינו תומך במשיכת חשבוניות. חשבוניות מסונכרנות אוטומטית בעת יצירתן.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
