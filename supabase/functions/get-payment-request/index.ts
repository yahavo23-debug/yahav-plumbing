// Edge function — get-payment-request
// עמוד תשלום ציבורי: מקבל share_token ומחזיר את פרטי בקשת התשלום + פרטי הבנק/ביט + לוגו.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// פרטי תשלום קבועים של העסק (זהים ל-BANK_DETAILS בקוד הלקוח)
const BANK = {
  bankName: "בנק מזרחי טפחות",
  bankNumber: "20",
  branchNumber: "615",
  accountNumber: "155793",
  beneficiaryName: "יהב אוחנה",
};
const BIT_PHONE = "054-2121204";
const BUSINESS_NAME = "יהב אינסטלציה - פתרונות ביוב ומים";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { share_token } = await req.json();
    if (!share_token) {
      return new Response(JSON.stringify({ error: "Missing share_token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pr, error } = await supabase
      .from("payment_requests")
      .select("customer_name, amount, note, is_active, paid_at, created_at")
      .eq("share_token", share_token)
      .single();

    if (error || !pr) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pr.is_active) {
      return new Response(JSON.stringify({ error: "revoked" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // לוגו (אם קיים)
    let logoUrl: string | null = null;
    try {
      const { data: branding } = await supabase
        .from("branding_settings").select("logo_path").limit(1).single();
      if (branding?.logo_path) {
        const { data: signed } = await supabase.storage
          .from("branding").createSignedUrl(branding.logo_path, 7200);
        logoUrl = signed?.signedUrl ?? null;
      }
    } catch { /* אין לוגו — לא קריטי */ }

    return new Response(JSON.stringify({
      customerName: pr.customer_name,
      amount: Number(pr.amount),
      note: pr.note,
      paid: !!pr.paid_at,
      businessName: BUSINESS_NAME,
      bank: BANK,
      bitPhone: BIT_PHONE,
      logoUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("get-payment-request error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
