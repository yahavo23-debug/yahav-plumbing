// Edge function: extract invoice data from an image using Lovable AI (Gemini vision),
// then upsert customer + yesh_invoice + financial_transaction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  let d = String(p).replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!roleRow || !["admin", "secretary"].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType = "image/jpeg" } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Call Lovable AI Gateway with vision + tool calling for structured output
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You extract Israeli tax invoice/receipt data from images. Return ONLY valid data via the tool. Hebrew text is normal. Numbers may use commas. Date in DD/MM/YYYY → return as YYYY-MM-DD.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "חלץ את פרטי החשבונית מהתמונה." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_invoice",
            description: "Save extracted invoice fields",
            parameters: {
              type: "object",
              properties: {
                doc_number:     { type: "string", description: "מספר מסמך/חשבונית" },
                doc_type_name:  { type: "string", description: "סוג מסמך, למשל: חשבונית מס קבלה, קבלה, חשבונית" },
                customer_name:  { type: "string", description: "שם הלקוח" },
                customer_phone: { type: "string", description: "טלפון הלקוח, ספרות בלבד" },
                customer_email: { type: "string" },
                date_created:   { type: "string", description: "תאריך בפורמט YYYY-MM-DD" },
                total_price:    { type: "number", description: "סכום לפני מע\"מ" },
                total_vat:      { type: "number", description: "מע\"מ" },
                total_with_vat: { type: "number", description: "סך הכל לתשלום" },
                description:    { type: "string", description: "תיאור העבודה/פריט עיקרי" },
              },
              required: ["customer_name", "total_with_vat", "date_created"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_invoice" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI error:", aiRes.status, txt);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit, נסה שוב בעוד רגע" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "נגמרו הקרדיטים של Lovable AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extract failed", details: txt }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return data", raw: aiJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const extracted = JSON.parse(toolCall.function.arguments);

    const customerName  = String(extracted.customer_name || "").trim();
    const customerPhone = normalizePhone(extracted.customer_phone);
    const customerEmail = String(extracted.customer_email || "").trim();
    const totalWithVat  = Number(extracted.total_with_vat || 0);
    const totalPrice    = Number(extracted.total_price || totalWithVat);
    const totalVat      = Number(extracted.total_vat || 0);
    const dateCreated   = String(extracted.date_created || new Date().toISOString().slice(0, 10));
    const docNumber     = String(extracted.doc_number || "");
    const docTypeName   = String(extracted.doc_type_name || "חשבונית מס קבלה");
    const description   = String(extracted.description || "שירות אינסטלציה");

    // --- Find or create customer (match by phone first, then by name)
    let customerId: string | null = null;
    if (customerPhone) {
      const { data: byPhone } = await admin
        .from("customers").select("id").eq("phone", customerPhone).limit(1);
      if (byPhone && byPhone.length > 0) customerId = byPhone[0].id;
    }
    if (!customerId && customerName) {
      const { data: byName } = await admin
        .from("customers").select("id").ilike("name", customerName).limit(1);
      if (byName && byName.length > 0) customerId = byName[0].id;
    }
    let customerCreated = false;
    if (!customerId && customerName) {
      const { data: newCust, error: custErr } = await admin
        .from("customers")
        .insert({
          name:       customerName,
          phone:      customerPhone || null,
          email:      customerEmail || null,
          created_by: user.id,
          notes:      "נוצר אוטומטית מייבוא חשבוניות",
        })
        .select("id").single();
      if (custErr) {
        console.error("customer insert error:", custErr);
      } else {
        customerId = newCust.id;
        customerCreated = true;
      }
    }

    // --- Insert invoice (skip if same doc_number already exists for this customer)
    let invoiceId: string | null = null;
    let invoiceSkipped = false;
    if (docNumber) {
      const { data: existing } = await admin
        .from("yesh_invoices").select("id")
        .eq("doc_number", docNumber)
        .eq("customer_name", customerName)
        .limit(1);
      if (existing && existing.length > 0) {
        invoiceId = existing[0].id;
        invoiceSkipped = true;
      }
    }
    if (!invoiceSkipped) {
      const { data: inv, error: invErr } = await admin.from("yesh_invoices").insert({
        doc_number:     docNumber,
        doc_type:       9,
        doc_type_name:  docTypeName,
        customer_name:  customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        total_price:    totalPrice,
        total_vat:      totalVat,
        total_with_vat: totalWithVat,
        date_created:   dateCreated,
        status:         "imported",
        raw_data:       { source: "image_import", extracted },
      }).select("id").single();
      if (invErr) {
        console.error("invoice insert error:", invErr);
        return new Response(JSON.stringify({ error: invErr.message, extracted }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      invoiceId = inv.id;
    }

    // --- Insert financial transaction (income) — dedupe by notes tag
    const txnTag = `import_inv_${docNumber || invoiceId}`;
    const { data: existingTxn } = await admin
      .from("financial_transactions").select("id").eq("notes", txnTag).maybeSingle();
    let txnCreated = false;
    if (!existingTxn) {
      const { error: txnErr } = await admin.from("financial_transactions").insert({
        direction:         "income",
        amount:            totalWithVat,
        txn_date:          dateCreated,
        category:          "service",
        counterparty_name: customerName,
        customer_id:       customerId,
        notes:             txnTag,
        payment_method:    "cash",
        status:            "completed",
        currency:          "ILS",
        created_by:        user.id,
      });
      if (txnErr) console.error("txn insert error:", txnErr);
      else txnCreated = true;
    }

    return new Response(JSON.stringify({
      success: true,
      extracted,
      customerId,
      customerCreated,
      invoiceId,
      invoiceSkipped,
      txnCreated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Unexpected:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
