// Supabase Edge Function — sync-yesh-invoices
// Pulls all documents from יש חשבונית and upserts them into yesh_invoices table.
// No duplicates — uses yesh_doc_id as unique key.
// Can be called manually OR triggered by pg_cron every hour.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const YESH_USER_KEY = "JWVyZuY5TF6qkCMHaBpo";
const YESH_SECRET   = "2767c6cf-d633-464c-bb34-000bb173d342";
const YESH_API_BASE = "https://api.yeshinvoice.co.il/api/v1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const YESH_AUTH = JSON.stringify({ secret: YESH_SECRET, userkey: YESH_USER_KEY });

async function fetchYeshDocuments(fromDate?: string): Promise<any[]> {
  // YeshInvoice getAllDocuments endpoint
  const body: Record<string, unknown> = {
    PageSize: 200,
    PageNumber: 1,
  };
  if (fromDate) body.fromDate = fromDate;

  const res = await fetch(`${YESH_API_BASE}/getDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: YESH_AUTH,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YeshInvoice API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // API returns { documents: [...] } or { data: [...] } or array directly
  return data?.documents || data?.data || (Array.isArray(data) ? data : []);
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^972/, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Allow both authenticated calls and cron calls
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient    = createClient(supabaseUrl, serviceRoleKey);

  // Verify caller (either cron or authenticated user)
  if (cronSecret !== "yahav-push-cron-k9x2m" && authHeader) {
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    // Fetch documents from YeshInvoice (last 90 days by default)
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0]; // YYYY-MM-DD

    const docs = await fetchYeshDocuments(fromDate);
    console.log(`Fetched ${docs.length} documents from YeshInvoice`);

    if (docs.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: "No documents found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all customers' phones for auto-matching
    const { data: customers } = await adminClient
      .from("customers")
      .select("id, name, phone");
    const phoneToCustomerId: Record<string, string> = {};
    for (const c of customers || []) {
      if (c.phone) phoneToCustomerId[normalizePhone(c.phone)] = c.id;
    }

    // Fetch all service calls for phone-based matching
    const { data: serviceCalls } = await adminClient
      .from("service_calls")
      .select("id, customer_id, customers(phone)")
      .order("created_at", { ascending: false });

    // Map customer_id → latest service_call_id (for auto-link)
    const customerToLatestCall: Record<string, string> = {};
    for (const sc of serviceCalls || []) {
      const cid = sc.customer_id;
      if (cid && !customerToLatestCall[cid]) {
        customerToLatestCall[cid] = sc.id;
      }
    }

    // Upsert each document — no duplicates via yesh_doc_id conflict
    let synced = 0;
    const upserts: any[] = [];

    for (const doc of docs) {
      const docId    = doc.id || doc.docID || doc.documentId;
      const phone    = normalizePhone(doc.customerPhone || doc.Customer?.Phone || "");
      const custId   = phone ? phoneToCustomerId[phone] : undefined;
      const callId   = custId ? customerToLatestCall[custId] : undefined;

      upserts.push({
        yesh_doc_id:     docId    ? Number(docId) : null,
        doc_number:      String(doc.docNumber || doc.documentNumber || ""),
        doc_type:        doc.documentType || doc.docType || 9,
        doc_type_name:   doc.documentTypeName || "חשבונית מס קבלה",
        customer_name:   doc.customerName  || doc.Customer?.Name  || "",
        customer_phone:  phone,
        customer_email:  doc.customerEmail || doc.Customer?.Email || "",
        total_price:     Number(doc.totalPrice    || doc.price    || 0),
        total_vat:       Number(doc.totalVat      || doc.vat      || 0),
        total_with_vat:  Number(doc.totalWithVat  || doc.total    || 0),
        date_created:    (doc.dateCreated || doc.DateCreated || new Date().toISOString()).slice(0, 10),
        status:          doc.statusName || "open",
        service_call_id: callId || null,
        raw_data:        doc,
        updated_at:      new Date().toISOString(),
      });
    }

    // Batch upsert (no duplicates — yesh_doc_id is UNIQUE)
    const { error: upsertErr } = await adminClient
      .from("yesh_invoices")
      .upsert(upserts, { onConflict: "yesh_doc_id", ignoreDuplicates: false });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr.message);
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    synced = upserts.length;
    console.log(`Synced ${synced} invoices`);

    return new Response(JSON.stringify({ synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-yesh-invoices error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
