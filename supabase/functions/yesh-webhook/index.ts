// Supabase Edge Function — yesh-webhook
// Receives webhooks from יש חשבונית when a document is created/updated.
// Register this URL in יש חשבונית → מפתחים → Webhooks
// URL: https://xglagkbblribtztkkovo.supabase.co/functions/v1/yesh-webhook
//
// Flow:
//  1. יש חשבונית sends a ping (often just a DocID)
//  2. We fetch the full document from the יש חשבונית API
//  3. We save all fields to yesh_invoices

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YESH_API_BASE = "https://api.yeshinvoice.co.il/api/v1.1";
const YESH_USER_KEY = Deno.env.get("YESH_USER_KEY") ?? "";
const YESH_SECRET   = Deno.env.get("YESH_SECRET")   ?? "";

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

/** Call יש חשבונית API to get a full document by ID */
async function fetchDocFromYesh(docId: number): Promise<any | null> {
  if (!YESH_USER_KEY || !YESH_SECRET) {
    console.warn("yesh-webhook: YESH_USER_KEY / YESH_SECRET not configured, skipping API fetch");
    return null;
  }
  try {
    const authHeader = JSON.stringify({ secret: YESH_SECRET, userkey: YESH_USER_KEY });

    // Try getDocumentByID endpoint
    const res = await fetch(`${YESH_API_BASE}/getDocumentByID`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ DocID: docId }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("yesh-webhook: fetched doc from API:", JSON.stringify(data).slice(0, 500));
      // API may return { document: {...} } or the doc directly
      return data?.document || data?.Document || data?.doc || data;
    }
    console.warn("yesh-webhook: getDocumentByID failed", res.status, await res.text());
  } catch (err) {
    console.error("yesh-webhook: fetchDocFromYesh error", err);
  }
  return null;
}

/** Extract all relevant fields from a document object (handles many field name variants) */
function extractFields(doc: any) {
  const customerName = String(pickFirst(
    doc.CustomerName, doc.customerName,
    doc.Customer?.Name, doc.Customer?.name, doc.customer?.name,
    ""
  ) || "");

  const phoneRaw = pickFirst(
    doc.CustomerPhone, doc.customerPhone,
    doc.Customer?.Phone, doc.Customer?.phone, doc.customer?.phone,
  );
  const phone = normalizePhone(phoneRaw);

  const customerEmail = String(pickFirst(
    doc.CustomerEmail, doc.customerEmail,
    doc.Customer?.Email, doc.Customer?.email, doc.customer?.email,
    ""
  ) || "");

  const docNumber = String(pickFirst(
    doc.DocNumber, doc.docNumber, doc.DocumentNumber, doc.documentNumber, ""
  ) || "");

  const docType = Number(pickFirst(doc.DocumentType, doc.documentType, doc.DocType, doc.docType, 9));
  const docTypeName = String(pickFirst(doc.DocumentTypeName, doc.documentTypeName, "חשבונית מס קבלה"));

  const totalPrice = Number(pickFirst(
    doc.TotalPrice, doc.totalPrice, doc.Price, doc.price, 0
  )) || 0;

  const totalVat = Number(pickFirst(
    doc.TotalVAT, doc.TotalVat, doc.totalVat, doc.VAT, doc.vat, 0
  )) || 0;

  const totalWithVat = Number(pickFirst(
    doc.TotalWithVAT, doc.totalWithVAT, doc.TotalWithVat, doc.totalWithVat,
    doc.GrandTotal, doc.grandTotal, doc.Total, doc.total, 0
  )) || 0;

  const dateCreated = String(pickFirst(
    doc.DateCreated, doc.dateCreated, doc.Date, doc.date,
    doc.InvoiceDate, doc.invoiceDate, new Date().toISOString()
  )).slice(0, 10);

  const status = String(pickFirst(doc.StatusName, doc.statusName, doc.status, "open"));

  return { customerName, phone, customerEmail, docNumber, docType, docTypeName, totalPrice, totalVat, totalWithVat, dateCreated, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("YESH_WEBHOOK_SECRET");
  const providedSecret = url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (expectedSecret && providedSecret && providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawText = await req.text();
    console.log("yesh-webhook RAW:", rawText.slice(0, 2000));

    let payload: any = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      const params = new URLSearchParams(rawText);
      payload = Object.fromEntries(params.entries());
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient    = createClient(supabaseUrl, serviceRoleKey);

    // Extract raw doc from payload (may be wrapped or flat)
    let doc = payload?.document || payload?.Document || payload?.doc || payload?.invoice || payload?.data || payload;
    console.log("yesh-webhook DOC keys:", Object.keys(doc || {}).join(", "));

    // Get docId from the ping
    let docId: number | null = null;
    const rawDocId = pickFirst(doc.DocID, doc.docID, doc.DocumentID, doc.documentID, doc.id);
    if (rawDocId) docId = Number(rawDocId);

    console.log(`yesh-webhook: docId from ping = ${docId}`);

    // ── Step 1: If we got a docId, fetch the full document from יש חשבונית API ──
    if (docId) {
      const fullDoc = await fetchDocFromYesh(docId);
      if (fullDoc && Object.keys(fullDoc).length > 2) {
        doc = fullDoc;
        console.log("yesh-webhook: using full doc from API, keys:", Object.keys(doc).join(", "));
      }
    }

    // ── Step 2: Extract all fields ──
    const fields = extractFields(doc);
    const { customerName, phone, customerEmail, docNumber, docType, docTypeName,
            totalPrice, totalVat, totalWithVat, dateCreated, status } = fields;

    console.log(`yesh-webhook parsed: docId=${docId} customer="${customerName}" total=${totalWithVat}`);

    // ── Step 3: Match customer / service call ──
    let serviceCallId: string | null = null;
    let customerId: string | null = null;
    if (phone) {
      const { data: customers } = await adminClient
        .from("customers").select("id").eq("phone", phone).limit(1);
      if (customers?.length) {
        customerId = customers[0].id;
        const { data: calls } = await adminClient
          .from("service_calls").select("id")
          .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(1);
        if (calls?.length) serviceCallId = calls[0].id;
      }
    }

    // ── Step 4: Upsert invoice — never overwrite good data with empty data ──
    // Check if a valid record already exists (saved by create-yesh-invoice in the app)
    let skipUpsert = false;
    if (docId) {
      const { data: existing } = await adminClient
        .from("yesh_invoices")
        .select("id, customer_name, total_with_vat")
        .eq("yesh_doc_id", docId)
        .maybeSingle();

      if (existing && existing.customer_name && Number(existing.total_with_vat) > 0) {
        // Record already has valid data — only update status if it changed, don't wipe fields
        console.log(`yesh-webhook: record ${docId} already has valid data, skipping overwrite`);
        skipUpsert = true;
        if (status && status !== "open") {
          await adminClient.from("yesh_invoices")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("yesh_doc_id", docId);
        }
      }
    }

    if (!skipUpsert) {
      const { error: upsertErr } = await adminClient.from("yesh_invoices").upsert(
        {
          yesh_doc_id:    docId,
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
          status,
          service_call_id: serviceCallId,
          raw_data:       doc,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: "yesh_doc_id", ignoreDuplicates: false }
      );
      if (upsertErr) console.error("yesh-webhook upsert error:", upsertErr.message);
    }

    // ── Step 5: Auto-create financial transaction ──
    if (totalWithVat > 0 && docId) {
      const noteKey = `yesh_doc_${docId}`;
      const { data: existing } = await adminClient
        .from("financial_transactions").select("id").eq("notes", noteKey).maybeSingle();
      if (!existing) {
        await adminClient.from("financial_transactions").insert({
          direction: "income", amount: totalWithVat, txn_date: dateCreated,
          category: "service", counterparty_name: customerName,
          customer_id: customerId, service_call_id: serviceCallId,
          notes: noteKey, payment_method: "cash", status: "paid", currency: "ILS",
          created_by: "00000000-0000-0000-0000-000000000000",
        });
      }
    }

    console.log(`yesh-webhook OK: doc#${docNumber} id=${docId} customer="${customerName}"`);

    return new Response(JSON.stringify({ ok: true, docId, customerName, totalWithVat }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("yesh-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
