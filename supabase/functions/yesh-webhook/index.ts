// Supabase Edge Function — yesh-webhook
// Receives webhooks from יש חשבונית when a document is created/updated.
// Register this URL in יש חשבונית → מפתחים → Webhooks
// URL: https://xglagkbblribtztkkovo.supabase.co/functions/v1/yesh-webhook
//
// NOTE: יש חשבונית does NOT send a custom auth header, so this endpoint
// is public. Optionally pass ?secret=... in the URL for added security.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^972/, "0");
}

function pickFirst(...vals: any[]): any {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Optional secret check via URL param (?secret=...) — only enforced if a secret is configured AND was provided
  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("YESH_WEBHOOK_SECRET");
  const providedSecret = url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (expectedSecret && providedSecret && providedSecret !== expectedSecret) {
    console.warn("yesh-webhook: bad secret provided, rejecting");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawText = await req.text();
    console.log("yesh-webhook RAW:", rawText.slice(0, 4000));

    let payload: any = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      // Some webhooks send form-urlencoded
      const params = new URLSearchParams(rawText);
      payload = Object.fromEntries(params.entries());
      // try to parse a "data" or "document" field if it's JSON string
      for (const k of ["data", "document", "payload"]) {
        if (typeof payload[k] === "string") {
          try { payload[k] = JSON.parse(payload[k]); } catch { /* ignore */ }
        }
      }
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient    = createClient(supabaseUrl, serviceRoleKey);

    const doc = payload?.document || payload?.data || payload;

    const docId = pickFirst(doc.id, doc.docID, doc.documentId, doc.documentID, doc.DocID);
    const docNumber = String(pickFirst(doc.docNumber, doc.documentNumber, doc.DocNumber, "") || "");
    const docType = Number(pickFirst(doc.documentType, doc.docType, doc.DocumentType, 9));
    const docTypeName = String(pickFirst(doc.documentTypeName, doc.DocumentTypeName, "חשבונית מס קבלה"));
    const customerName = String(pickFirst(doc.customerName, doc.Customer?.Name, doc.customer?.name, "") || "");
    const phoneRaw = pickFirst(doc.customerPhone, doc.Customer?.Phone, doc.customer?.phone);
    const phone = normalizePhone(phoneRaw);
    const customerEmail = String(pickFirst(doc.customerEmail, doc.Customer?.Email, doc.customer?.email, "") || "");
    const totalPrice = Number(pickFirst(doc.totalPrice, doc.price, doc.TotalPrice, 0)) || 0;
    const totalVat = Number(pickFirst(doc.totalVat, doc.vat, doc.TotalVat, 0)) || 0;
    const totalWithVat = Number(pickFirst(doc.totalWithVat, doc.total, doc.TotalWithVat, doc.Total, 0)) || 0;
    const dateCreated = String(pickFirst(doc.dateCreated, doc.DateCreated, new Date().toISOString())).slice(0, 10);

    // Try to match a customer by phone
    let serviceCallId: string | null = null;
    let customerId: string | null = null;
    if (phone) {
      const { data: customers } = await adminClient
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .limit(1);
      if (customers && customers.length > 0) {
        customerId = customers[0].id;
        const { data: calls } = await adminClient
          .from("service_calls")
          .select("id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (calls && calls.length > 0) serviceCallId = calls[0].id;
      }
    }

    if (!docId) {
      console.warn("yesh-webhook: no docId found in payload, storing without unique key");
    }

    // Upsert invoice record
    const { error: upsertErr } = await adminClient.from("yesh_invoices").upsert(
      {
        yesh_doc_id:    docId ? Number(docId) : null,
        doc_number:     docNumber,
        doc_type:       docType,
        doc_type_name:  docTypeName,
        customer_name:  customerName,
        customer_phone: phone,
        customer_email: customerEmail,
        total_price:    totalPrice,
        total_vat:      totalVat,
        total_with_vat: totalWithVat,
        date_created:   dateCreated,
        status:         String(pickFirst(doc.statusName, doc.status, "open")),
        service_call_id: serviceCallId,
        raw_data:       doc,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "yesh_doc_id", ignoreDuplicates: false }
    );

    if (upsertErr) {
      console.error("yesh-webhook upsert error:", upsertErr.message);
    }

    // Auto-create financial transaction (income) — once per doc
    if (totalWithVat > 0 && docId) {
      const noteKey = `yesh_doc_${docId}`;
      const { data: existing } = await adminClient
        .from("financial_transactions")
        .select("id")
        .eq("notes", noteKey)
        .maybeSingle();

      if (!existing) {
        const { error: txnErr } = await adminClient.from("financial_transactions").insert({
          direction:        "income",
          amount:           totalWithVat,
          txn_date:         dateCreated,
          category:         "service",
          counterparty_name: customerName,
          customer_id:      customerId,
          service_call_id:  serviceCallId,
          notes:            noteKey,
          payment_method:   "cash",
          status:           "paid",
          currency:         "ILS",
          created_by:       "00000000-0000-0000-0000-000000000000",
        });
        if (txnErr) console.error("yesh-webhook txn insert error:", txnErr.message);
      }
    }

    console.log(`yesh-webhook OK: doc#${docNumber} id=${docId} customer=${customerName} matched=${!!customerId}`);

    return new Response(JSON.stringify({ ok: true, docId, matchedCustomer: !!customerId, matchedCall: !!serviceCallId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("yesh-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
