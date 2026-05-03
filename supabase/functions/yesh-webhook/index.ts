// Supabase Edge Function — yesh-webhook
// Receives real-time webhooks from יש חשבונית when a document is created/updated.
// Register this URL in יש חשבונית → מפתחים → Webhooks
// URL: https://xglagkbblribtztkkovo.supabase.co/functions/v1/yesh-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^972/, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Yesh webhook received:", JSON.stringify(payload));

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient    = createClient(supabaseUrl, serviceRoleKey);

    const doc = payload?.document || payload?.data || payload;

    const docId = doc.id || doc.docID || doc.documentId;
    const phone = normalizePhone(doc.customerPhone || doc.Customer?.Phone || "");

    // Try to match to a customer by phone
    let serviceCallId: string | null = null;
    if (phone) {
      const { data: customers } = await adminClient
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .limit(1);
      if (customers && customers.length > 0) {
        const { data: calls } = await adminClient
          .from("service_calls")
          .select("id")
          .eq("customer_id", customers[0].id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (calls && calls.length > 0) serviceCallId = calls[0].id;
      }
    }

    // Upsert — prevents duplicates via yesh_doc_id unique constraint
    const { error } = await adminClient.from("yesh_invoices").upsert(
      {
        yesh_doc_id:    docId ? Number(docId) : null,
        doc_number:     String(doc.docNumber || doc.documentNumber || ""),
        doc_type:       doc.documentType || doc.docType || 9,
        doc_type_name:  doc.documentTypeName || "חשבונית מס קבלה",
        customer_name:  doc.customerName  || doc.Customer?.Name  || "",
        customer_phone: phone,
        customer_email: doc.customerEmail || doc.Customer?.Email || "",
        total_price:    Number(doc.totalPrice   || doc.price   || 0),
        total_vat:      Number(doc.totalVat     || doc.vat     || 0),
        total_with_vat: Number(doc.totalWithVat || doc.total   || 0),
        date_created:   (doc.dateCreated || doc.DateCreated || new Date().toISOString()).slice(0, 10),
        status:         doc.statusName || "open",
        service_call_id: serviceCallId,
        raw_data:       doc,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "yesh_doc_id", ignoreDuplicates: false }
    );

    if (error) {
      console.error("Webhook upsert error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("yesh-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
