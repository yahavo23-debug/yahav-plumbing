import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { share_token } = await req.json();
    if (!share_token) {
      return new Response(JSON.stringify({ error: "Missing share_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify token from quote_shares
    const { data: share, error: shareErr } = await supabase
      .from("quote_shares")
      .select("quote_id, access_mode, is_active, revoked_at, expires_at")
      .eq("share_token", share_token)
      .single();

    if (shareErr || !share) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!share.is_active || share.revoked_at) {
      return new Response(JSON.stringify({ error: "Token revoked" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load quote
    const { data: quote } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", share.quote_id)
      .single();

    if (!quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load quote items
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote.id)
      .order("sort_order");

    // Load service call & customer
    const { data: sc } = await supabase
      .from("service_calls")
      .select("id, call_number, job_type, description, status")
      .eq("id", quote.service_call_id)
      .single();

    let customer = null;
    if (sc) {
      const { data: cust } = await supabase
        .from("customers")
        .select("name, phone, city, address")
        .eq("id", (await supabase.from("service_calls").select("customer_id").eq("id", sc.id).single()).data?.customer_id)
        .single();
      customer = cust;
    }

    // Get signature URL if exists
    let signatureUrl = null;
    if (quote.signature_path) {
      const { data: sigData } = await supabase.storage
        .from("signatures")
        .createSignedUrl(quote.signature_path, 3600);
      signatureUrl = sigData?.signedUrl;
    }

    console.log(`Public quote accessed: ${share.quote_id} via token: ${share_token.substring(0, 8)}...`);

    return new Response(JSON.stringify({
      quote: {
        id: quote.id,
        quote_number: quote.quote_number,
        title: quote.title,
        status: quote.status,
        notes: quote.notes,
        valid_until: quote.valid_until,
        discount_percent: quote.discount_percent,
        include_vat: quote.include_vat,
        scope_of_work: quote.scope_of_work,
        signature_path: quote.signature_path,
        signature_url: signatureUrl,
        signed_at: quote.signed_at,
        signed_by: quote.signed_by,
        signer_id_number: quote.signer_id_number,
        ip_address: quote.ip_address,
        created_at: quote.created_at,
      },
      items: items || [],
      customer,
      service_call: sc,
      access_mode: share.access_mode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
