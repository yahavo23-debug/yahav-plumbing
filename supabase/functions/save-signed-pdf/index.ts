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
    const docType = formData.get("doc_type") as string; // "quote" or "report"
    const pdfFile = formData.get("pdf") as File;

    if (!shareToken || !docType || !pdfFile) {
      return new Response(JSON.stringify({ error: "Missing share_token, doc_type, or pdf" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["quote", "report"].includes(docType)) {
      return new Response(JSON.stringify({ error: "Invalid doc_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Max 10MB for PDF
    if (pdfFile.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large (max 10MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let documentId: string;
    let bucketName: string;

    const isExpired = (exp: string | null | undefined) =>
      !!exp && new Date(exp).getTime() < Date.now();

    if (docType === "quote") {
      // Verify quote share token
      const { data: share, error: shareErr } = await supabase
        .from("quote_shares")
        .select("quote_id, is_active, revoked_at, expires_at")
        .eq("share_token", shareToken)
        .single();

      if (shareErr || !share || !share.is_active || share.revoked_at || isExpired(share.expires_at)) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      documentId = share.quote_id;
      bucketName = "quotes-pdf";
    } else {
      // Verify report share token
      const { data: share, error: shareErr } = await supabase
        .from("report_shares")
        .select("report_id, is_active, revoked_at, expires_at")
        .eq("share_token", shareToken)
        .single();

      if (shareErr || !share || !share.is_active || share.revoked_at || isExpired(share.expires_at)) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      documentId = share.report_id;
      bucketName = "reports-pdf";
    }

    // Read PDF bytes
    const arrayBuffer = await pdfFile.arrayBuffer();

    // Validate PDF magic bytes (%PDF)
    const bytes = new Uint8Array(arrayBuffer);
    const isPDF = bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    if (!isPDF) {
      return new Response(JSON.stringify({ error: "Only PDF files are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute SHA-256 hash
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const pdfHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Upload PDF
    const filePath = `signed/${documentId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) throw uploadError;

    // Update document record
    const tableName = docType === "quote" ? "quotes" : "reports";
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ pdf_path: filePath, pdf_hash: pdfHash })
      .eq("id", documentId);

    if (updateError) throw updateError;

    console.log(`Signed PDF saved for ${docType} ${documentId}, hash: ${pdfHash.substring(0, 16)}...`);

    return new Response(JSON.stringify({ success: true, pdf_path: filePath, pdf_hash: pdfHash }), {
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
