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
    const signatureFile = formData.get("signature") as File;
    const signedBy = formData.get("signed_by") as string || null;
    const signerIdNumber = formData.get("signer_id_number") as string || null;

    // Validate ID number - must be exactly 9 digits
    if (!signerIdNumber || !/^\d{9}$/.test(signerIdNumber)) {
      return new Response(JSON.stringify({ error: "תעודת זהות חייבת להכיל 9 ספרות בדיוק" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!shareToken || !signatureFile) {
      return new Response(JSON.stringify({ error: "Missing share_token or signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 2MB)
    if (signatureFile.size > 2 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large (max 2MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate MIME type
    if (!signatureFile.type.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "Invalid file type, must be an image" }), {
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

    // Verify token
    const { data: share, error: shareErr } = await supabase
      .from("report_shares")
      .select("report_id, access_mode, is_active, revoked_at, expires_at")
      .eq("share_token", shareToken)
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

    if (share.access_mode === "view") {
      return new Response(JSON.stringify({ error: "This link is view-only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check report isn't already signed
    const { data: report } = await supabase
      .from("reports")
      .select("id, signature_path")
      .eq("id", share.report_id)
      .single();

    if (!report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (report.signature_path) {
      return new Response(JSON.stringify({ error: "Report already signed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload signature - verify PNG magic bytes
    const arrayBuffer = await signatureFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const isPNG = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    if (!isPNG) {
      return new Response(JSON.stringify({ error: "Only PNG format allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const filePath = `public/${share.report_id}/customer-signature-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(filePath, arrayBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) throw uploadError;

    // Update report with signature + metadata — ID stored separately
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("reports")
      .update({
        signature_path: filePath,
        signature_date: now,
        signed_by: signedBy,
        signer_id_number: signerIdNumber,
        ip_address: ipAddress,
        device_info: deviceInfo,
        status: "signed",
      })
      .eq("id", share.report_id);

    if (updateError) throw updateError;

    console.log(`Report ${share.report_id} signed via public link by ${signedBy || "unknown"} (ID: ${signerIdNumber}) from ${ipAddress}`);

    return new Response(JSON.stringify({ success: true, signature_date: now }), {
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
