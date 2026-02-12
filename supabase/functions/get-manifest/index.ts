import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get logo from branding settings
    const { data: branding } = await supabase
      .from("branding_settings")
      .select("logo_path")
      .limit(1)
      .single();

    let iconUrl: string | null = null;

    if (branding?.logo_path) {
      const { data: signedData } = await supabase.storage
        .from("branding")
        .createSignedUrl(branding.logo_path, 86400); // 24 hours
      iconUrl = signedData?.signedUrl || null;
    }

    // Detect type from path
    const isJpg = branding?.logo_path?.endsWith('.jpg') || branding?.logo_path?.endsWith('.jpeg');
    const mimeType = isJpg ? "image/jpeg" : "image/png";

    const icons = iconUrl
      ? [
          { src: iconUrl, sizes: "192x192", type: mimeType, purpose: "any maskable" },
          { src: iconUrl, sizes: "512x512", type: mimeType, purpose: "any maskable" },
        ]
      : [];

    const manifest = {
      name: "יהב אינסטלציה - מערכת ניהול",
      short_name: "יהב אינסטלציה",
      description: "מערכת ניהול שירות - יהב אינסטלציה",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#1e3a5f",
      dir: "rtl",
      lang: "he",
      icons,
    };

    return new Response(JSON.stringify(manifest), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("get-manifest error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
