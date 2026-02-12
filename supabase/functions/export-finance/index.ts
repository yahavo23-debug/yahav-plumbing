import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Check role - only admin/secretary
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleData || !["admin", "secretary"].includes(roleData.role)) {
      throw new Error("אין הרשאה לייצוא");
    }

    const { month } = await req.json();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Invalid month format");
    }

    const [year, mon] = month.split("-").map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

    // Fetch transactions
    const { data: transactions, error: txnError } = await adminClient
      .from("financial_transactions")
      .select("*")
      .gte("txn_date", startDate)
      .lte("txn_date", endDate)
      .order("txn_date", { ascending: true });

    if (txnError) throw txnError;
    const txns = transactions || [];

    // Build CSV with BOM for Hebrew Excel support
    const BOM = "\uFEFF";
    const headers = [
      "txn_date", "direction", "amount", "currency", "category",
      "payment_method", "counterparty_name", "status", "doc_type", "notes",
    ];
    const headerLabels = [
      "תאריך", "כיוון", "סכום", "מטבע", "קטגוריה",
      "אמצעי תשלום", "שם", "סטטוס", "סוג מסמך", "הערות",
    ];

    const directionLabels: Record<string, string> = { income: "הכנסה", expense: "הוצאה" };
    const statusLabels: Record<string, string> = { paid: "שולם", debt: "חוב", credit: "זיכוי" };

    const csvRows = [
      headerLabels.join(","),
      ...txns.map((t: Record<string, unknown>) =>
        headers.map(h => {
          let val = t[h] ?? "";
          if (h === "direction") val = directionLabels[val as string] || val;
          if (h === "status") val = statusLabels[val as string] || val;
          // Escape CSV
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        }).join(",")
      ),
    ].join("\n");

    const csvContent = BOM + csvRows;
    const csvFileName = `finance-${month}.csv`;

    // Upload CSV to finance-docs
    const csvBytes = new TextEncoder().encode(csvContent);
    const csvPath = `exports/${csvFileName}`;
    await adminClient.storage
      .from("finance-docs")
      .upload(csvPath, csvBytes, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
      });

    // Generate signed URL (valid for 7 days)
    const { data: signedData, error: signError } = await adminClient.storage
      .from("finance-docs")
      .createSignedUrl(csvPath, 7 * 24 * 60 * 60);

    if (signError) throw signError;

    // Calculate totals for response
    const totalIncome = txns.filter((t: Record<string, unknown>) => t.direction === "income").reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
    const totalExpenses = txns.filter((t: Record<string, unknown>) => t.direction === "expense").reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

    return new Response(
      JSON.stringify({
        url: signedData!.signedUrl,
        month,
        transactions_count: txns.length,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net: totalIncome - totalExpenses,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
