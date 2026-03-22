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
      return new Response(JSON.stringify({ error: "Missing share_token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify token
    const { data: share, error: shareErr } = await supabase
      .from("report_shares")
      .select("report_id, access_mode, is_active, revoked_at, expires_at")
      .eq("share_token", share_token)
      .single();

    if (shareErr || !share) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!share.is_active || share.revoked_at) {
      return new Response(JSON.stringify({ error: "Token revoked" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token expired" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load report
    const { data: report } = await supabase.from("reports").select("*").eq("id", share.report_id).single();
    if (!report) {
      return new Response(JSON.stringify({ error: "Report not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load related data
    const { data: service_call } = await supabase.from("service_calls").select("*").eq("id", report.service_call_id).single();
    const { data: customer } = service_call ? await supabase.from("customers").select("name, phone, city, address").eq("id", service_call.customer_id).single() : { data: null };
    const { data: photos } = await supabase.from("service_call_photos").select("*").eq("service_call_id", report.service_call_id).order("created_at");
    const { data: videos } = await supabase.from("service_call_videos").select("*").eq("service_call_id", report.service_call_id).order("created_at");

    // Generate signed URLs for photos and videos
    const photosWithUrls = await Promise.all((photos || []).map(async (p: any) => {
      const { data } = await supabase.storage.from("photos").createSignedUrl(p.storage_path, 3600);
      return { ...p, url: data?.signedUrl };
    }));

    const videosWithUrls = await Promise.all((videos || []).map(async (v: any) => {
      const { data } = await supabase.storage.from("videos").createSignedUrl(v.storage_path, 3600);
      return { ...v, url: data?.signedUrl };
    }));

    // Generate signed URL for report signature if exists
    let signatureUrl = null;
    if (report.signature_path) {
      const { data: sigData } = await supabase.storage
        .from("signatures")
        .createSignedUrl(report.signature_path, 3600);
      signatureUrl = sigData?.signedUrl;
    }

    console.log(`Public report accessed: ${share.report_id} via token: ${share_token.substring(0, 8)}...`);

    return new Response(JSON.stringify({
      report: {
        ...report,
        signature_url: signatureUrl,
      },
      service_call, customer,
      photos: photosWithUrls, videos: videosWithUrls,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
