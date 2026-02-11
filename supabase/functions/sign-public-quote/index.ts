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
    const formData = await req.formData();
    const shareToken = formData.get("share_token") as string;
    const quoteId = formData.get("quote_id") as string;
    const signatureFile = formData.get("signature") as File;
    const signedBy = formData.get("signed_by") as string || null;

    if (!shareToken || !quoteId || !signatureFile) {
      return new Response(JSON.stringify({ error: "Missing share_token, quote_id or signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture IP and device info
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "unknown";
    const deviceInfo = req.headers.get("user-agent") || "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify share token
    const { data: share, error: shareErr } = await supabase
      .from("service_call_shares")
      .select("service_call_id, share_type, is_active, revoked_at, expires_at")
      .eq("share_token", shareToken)
      .eq("share_type", "quotes")
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

    // Verify quote belongs to this service call
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, signature_path, service_call_id")
      .eq("id", quoteId)
      .eq("service_call_id", share.service_call_id)
      .single();

    if (!quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quote.signature_path) {
      return new Response(JSON.stringify({ error: "Quote already signed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload signature
    const arrayBuffer = await signatureFile.arrayBuffer();
    const filePath = `public/${quoteId}/customer-signature-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(filePath, arrayBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) throw uploadError;

    // Update quote with signature + metadata
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        signature_path: filePath,
        signed_at: now,
        status: "approved",
        signed_by: signedBy,
        ip_address: ipAddress,
        device_info: deviceInfo,
      })
      .eq("id", quoteId);

    if (updateError) throw updateError;

    console.log(`Quote ${quoteId} signed via public link by ${signedBy || "unknown"} from ${ipAddress}`);

    return new Response(JSON.stringify({ success: true, signed_at: now }), {
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
