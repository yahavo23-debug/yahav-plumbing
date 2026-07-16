// Edge function — get-payment-request
// עמוד תשלום/דוח גבייה ציבורי: מקבל share_token ומחזיר את פרטי הבקשה,
// פירוט החיובים, פרטי הבנק/ביט (מהגדרות העסק) והלוגו.
// הצגת מידע בלבד — אין כאן שום עיבוד תשלומים.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ברירות מחדל אם טבלת ההגדרות עוד לא קיימת/ריקה
const DEFAULTS = {
  bank_name: "בנק מזרחי טפחות",
  bank_number: "20",
  branch_number: "615",
  account_number: "155793",
  beneficiary_name: "יהב אוחנה",
  bit_phone: "054-2121204",
  business_name: "יהב אינסטלציה - פתרונות ביוב ומים",
  business_license: null as string | null,
};

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
      .select("customer_name, amount, note, items, is_active, paid_at, created_at")
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

    // הגדרות תשלום של העסק
    let settings = DEFAULTS;
    try {
      const { data: s } = await supabase
        .from("business_payment_settings").select("*").eq("id", 1).single();
      if (s) settings = { ...DEFAULTS, ...s };
    } catch { /* משתמשים בברירות מחדל */ }

    // לוגו
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
      items: pr.items || null,
      createdAt: pr.created_at,
      paid: !!pr.paid_at,
      businessName: settings.business_name,
      businessLicense: settings.business_license || null,
      bank: {
        bankName: settings.bank_name,
        bankNumber: settings.bank_number,
        branchNumber: settings.branch_number,
        accountNumber: settings.account_number,
        beneficiaryName: settings.beneficiary_name,
      },
      bitPhone: settings.bit_phone,
      logoUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("get-payment-request error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
