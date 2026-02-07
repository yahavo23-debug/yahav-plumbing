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

    const { data: branding, error: brandingError } = await supabase
      .from("branding_settings")
      .select("logo_path")
      .limit(1)
      .single();

    if (brandingError || !branding?.logo_path) {
      console.log("No logo configured:", brandingError?.message);
      return new Response(JSON.stringify({ url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("branding")
      .createSignedUrl(branding.logo_path, 7200);

    if (signedError) {
      console.error("Failed to create signed URL:", signedError);
      return new Response(JSON.stringify({ url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Logo URL generated successfully");

    return new Response(JSON.stringify({ url: signedData.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-logo-url error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
