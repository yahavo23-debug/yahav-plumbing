// Supabase Edge Function — create-yesh-invoice
// Creates a חשבונית מס קבלה (Tax Invoice + Receipt) in YeshInvoice
// for a given service call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// YeshInvoice API credentials (יש חשבונית)
const YESH_USER_KEY  = "JWVyZuY5TF6qkCMHaBpo";
const YESH_SECRET    = "2767c6cf-d633-464c-bb34-000bb173d342";
const YESH_API_URL   = "https://api.yeshinvoice.co.il/api/v1.1/createDocument";

// DocumentType 9 = חשבונית מס קבלה (Tax Invoice + Receipt)
const DOCUMENT_TYPE  = 9;
const VAT_PERCENTAGE = 18; // מע"מ נוכחי

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const authHeader   = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is authenticated
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const {
      serviceCallId,
      amount,          // סכום לפני מע"מ
      description,     // תיאור העבודה
      includeVat = true,
      documentType = DOCUMENT_TYPE,
    } = await req.json();

    if (!serviceCallId || !amount) {
      return new Response(JSON.stringify({ error: "serviceCallId and amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch service call + customer details
    const { data: callData, error: callErr } = await anonClient
      .from("service_calls")
      .select("*, customers(*)")
      .eq("id", serviceCallId)
      .single();

    if (callErr || !callData) {
      return new Response(JSON.stringify({ error: "Service call not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = callData.customers as any;
    const today    = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Build the YeshInvoice request body
    const yeshBody = {
      Title:          "",
      Notes:          callData.notes || "",
      NotesBottom:    "",
      HideNotes:      "",
      CurrencyID:     1,           // שקל
      LangID:         359,         // עברית
      SendSMS:        false,
      SendEmail:      false,
      DocumentType:   documentType,
      ExchangeRate:   1,
      vatPercentage:  includeVat ? VAT_PERCENTAGE : 0,
      roundPrice:     0,
      RoundPriceAuto: false,
      OrderNumber:    callData.call_number?.toString() || "",
      DateCreated:    today,
      MaxDate:        today,
      hideMaxDate:    false,
      refdocNumber:   0,
      refurl:         "",
      statusID:       1,
      isDraft:        false,
      sendSign:       false,
      DontCreateIsraelTaxNumber: false,
      fromDocID:      -1,
      incomeID:       -1,
      payCreditPluginID: -1,
      DocumentUniqueKey: serviceCallId.slice(0, 20),

      Customer: {
        Name:  customer?.name  || "לקוח",
        Phone: customer?.phone || "",
        Email: customer?.email || "",
      },

      items: [
        {
          description: description || callData.job_type || "שירות אינסטלציה",
          quantity:    1,
          price:       Number(amount),
          discount:    0,
          vatType:     includeVat ? 1 : 0,
        },
      ],

      payments: [
        {
          PaymentType: 1, // מזומן/העברה — ניתן לשנות
          Total:       includeVat
            ? Number((amount * (1 + VAT_PERCENTAGE / 100)).toFixed(2))
            : Number(amount),
          Date:        today,
        },
      ],

      discount: { amount: 1, typeid: 1 },
    };

    // Call YeshInvoice API
    const yeshRes = await fetch(YESH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: JSON.stringify({
          secret:  YESH_SECRET,
          userkey: YESH_USER_KEY,
        }),
      },
      body: JSON.stringify(yeshBody),
    });

    const yeshData = await yeshRes.json();

    if (!yeshRes.ok || yeshData?.error) {
      console.error("YeshInvoice error:", yeshData);
      return new Response(
        JSON.stringify({ error: yeshData?.message || "YeshInvoice error", details: yeshData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save invoice reference in service_calls notes (optional)
    const invoiceNum = yeshData?.docNumber || yeshData?.documentNumber || "";
    const invoiceUrl = yeshData?.fileUrl   || yeshData?.url            || "";

    console.log(`Invoice created: #${invoiceNum} for call ${serviceCallId}`);

    // Save invoice to yesh_invoices table for local tracking
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const vatAmount = includeVat ? Number((amount * VAT_PERCENTAGE / 100).toFixed(2)) : 0;
    const totalWithVat = includeVat ? Number((amount * (1 + VAT_PERCENTAGE / 100)).toFixed(2)) : Number(amount);

    await adminClient.from("yesh_invoices").upsert({
      yesh_doc_id:    yeshData?.docID || yeshData?.id || null,
      doc_number:     String(invoiceNum || ""),
      doc_type:       documentType,
      doc_type_name:  "חשבונית מס קבלה",
      customer_name:  customer?.name  || "",
      customer_phone: customer?.phone || "",
      customer_email: customer?.email || "",
      total_price:    Number(amount),
      total_vat:      vatAmount,
      total_with_vat: totalWithVat,
      date_created:   today,
      status:         "open",
      service_call_id: serviceCallId,
      raw_data:       yeshData,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "yesh_doc_id", ignoreDuplicates: false });

    // Auto-create financial transaction for income tracking
    await adminClient.from("financial_transactions").insert({
      direction:        "income",
      amount:           totalWithVat,
      txn_date:         today,
      category:         "service",
      counterparty_name: customer?.name || "",
      customer_id:      callData.customer_id || null,
      service_call_id:  serviceCallId,
      notes:            description || callData.job_type || "שירות אינסטלציה",
      payment_method:   "cash",
      status:           "completed",
      currency:         "ILS",
      created_by:       user.id,
    });

    return new Response(
      JSON.stringify({
        success:     true,
        invoiceNum,
        invoiceUrl,
        raw:         yeshData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
