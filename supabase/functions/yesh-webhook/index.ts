// Supabase Edge Function — yesh-webhook
// Receives webhooks from יש חשבונית when a document is created/updated.
// Handles both POST (JSON/form) and GET (URL params) — יש חשבונית may use either.

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

/** Try to fetch a full document from the יש חשבונית API */
async function fetchDocFromYesh(docId: number): Promise<any | null> {
  if (!YESH_USER_KEY || !YESH_SECRET) return null;
  const authHeader = JSON.stringify({ secret: YESH_SECRET, userkey: YESH_USER_KEY });

  // Try several endpoint name variants used by different versions of the API
  const endpoints = [
    { url: `${YESH_API_BASE}/getDocumentById`, body: { DocID: docId } },
    { url: `${YESH_API_BASE}/getDocumentByID`, body: { DocID: docId } },
    { url: `${YESH_API_BASE}/getDocument`,     body: { DocID: docId } },
    { url: `${YESH_API_BASE}/GetDocument`,     body: { DocID: docId } },
    { url: `${YESH_API_BASE}/getDocuments`,    body: { DocID: docId } },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(ep.body),
      });
      if (res.ok) {
        const data = await res.json();
        // Check we got actual document data (not just an error response)
        const doc = data?.document || data?.Document || data?.doc || data?.data || data;
        const hasData = doc && (doc.CustomerName || doc.customerName || doc.Customer?.Name || doc.TotalWithVAT || doc.totalWithVat);
        if (hasData) {
          console.log(`yesh-webhook: got full doc from ${ep.url}`);
          return doc;
        }
      }
    } catch { /* try next */ }
  }

  // Also try GET request
  try {
    const res = await fetch(`${YESH_API_BASE}/getDocumentById?DocID=${docId}`, {
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      const data = await res.json();
      const doc = data?.document || data?.Document || data;
      if (doc?.CustomerName || doc?.customerName) return doc;
    }
  } catch { /* ignore */ }

  console.warn(`yesh-webhook: could not fetch doc ${docId} from API`);
  return null;
}

function extractFields(doc: any) {
  const customerName = String(pickFirst(
    doc.CustomerName, doc.customerName,
    doc.Customer?.Name, doc.Customer?.name, doc.customer?.name, ""
  ) || "");
  const phoneRaw = pickFirst(
    doc.CustomerPhone, doc.customerPhone,
    doc.Customer?.Phone, doc.Customer?.phone, doc.customer?.phone,
  );
  const phone = normalizePhone(phoneRaw);
  const customerEmail = String(pickFirst(
    doc.CustomerEmail, doc.customerEmail,
    doc.Customer?.Email, doc.Customer?.email, doc.customer?.email, ""
  ) || "");
  const docNumber = String(pickFirst(
    doc.DocNumber, doc.docNumber, doc.DocumentNumber, doc.documentNumber, ""
  ) || "");
  const docType = Number(pickFirst(doc.DocumentType, doc.documentType, doc.DocType, doc.docType, 9));
  const docTypeName = String(pickFirst(doc.DocumentTypeName, doc.documentTypeName, "חשבונית מס קבלה"));
  const totalPrice = Number(pickFirst(doc.TotalPrice, doc.totalPrice, doc.Price, doc.price, 0)) || 0;
  const totalVat = Number(pickFirst(doc.TotalVAT, doc.TotalVat, doc.totalVat, doc.VAT, doc.vat, 0)) || 0;
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

  try {
    const url = new URL(req.url);

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient    = createClient(supabaseUrl, serviceRoleKey);

    // ── Parse payload from body (POST) or URL params (GET) ──
    let payload: any = {};
    const rawText = req.method !== "GET" ? await req.text() : "";
    console.log("yesh-webhook method:", req.method, "url:", url.search, "body:", rawText.slice(0, 500));

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        // Try form-urlencoded
        const params = new URLSearchParams(rawText);
        payload = Object.fromEntries(params.entries());
        // Try to parse nested JSON strings
        for (const k of ["data", "document", "payload", "doc"]) {
          if (typeof payload[k] === "string") {
            try { payload[k] = JSON.parse(payload[k]); } catch { /* ignore */ }
          }
        }
      }
    }

    // Merge URL query params into payload (יש חשבונית may send as GET params)
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== "secret" && !(k in payload)) payload[k] = v;
    }

    console.log("yesh-webhook payload keys:", Object.keys(payload).join(", "));

    // ── Extract doc wrapper ──
    let doc = payload?.document || payload?.Document || payload?.doc || payload?.invoice || payload?.data || payload;

    // ── Get DocID ──
    let docId: number | null = null;
    const rawDocId = pickFirst(
      doc.DocID, doc.docID, doc.DocumentID, doc.documentID, doc.id,
      payload.DocID, payload.docID, payload.DocumentID,
      url.searchParams.get("DocID"), url.searchParams.get("docID"), url.searchParams.get("id"),
    );
    if (rawDocId) docId = Number(rawDocId);
    console.log("yesh-webhook docId:", docId);

    // ── If we have a docId, try to fetch the full document from the API ──
    if (docId) {
      const fullDoc = await fetchDocFromYesh(docId);
      if (fullDoc) {
        doc = fullDoc;
        console.log("yesh-webhook: using API doc, keys:", Object.keys(doc).join(", "));
      }
    }

    const fields = extractFields(doc);
    const { customerName, phone, customerEmail, docNumber, docType, docTypeName,
            totalPrice, totalVat, totalWithVat, dateCreated, status } = fields;

    console.log(`yesh-webhook parsed: docId=${docId} customer="${customerName}" total=${totalWithVat}`);

    // ── Match customer / service call by phone ──
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

    // ── Upsert — DB trigger already protects valid data from being overwritten ──
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

    // ── Auto financial transaction ──
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
