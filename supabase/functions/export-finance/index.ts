import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const categoryLabels: Record<string, string> = {
  tools: "כלים וציוד",
  fuel: "דלק",
  marketing: "שיווק ופרסום",
  subcontractor: "קבלן משנה",
  car: "רכב",
  phone: "טלפון",
  insurance: "ביטוח",
  office: "משרד",
  professional: "שירותים מקצועיים",
  materials: "חומרים",
  service_income: "הכנסה משירות",
  contractor_income: "הכנסה מקבלן",
  other: "אחר",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "מזומן",
  credit: "אשראי",
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  bit: "ביט",
  paybox: "פייבוקס",
  standing_order: "הוראת קבע",
};

const directionLabels: Record<string, string> = { income: "הכנסה", expense: "הוצאה" };
const statusLabels: Record<string, string> = { paid: "שולם", debt: "חוב", credit: "זיכוי" };
const docTypeLabels: Record<string, string> = { receipt: "קבלה", supplier_invoice: "חשבונית ספק", other: "אחר" };

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9א-ת\-_.]/g, "_").substring(0, 80);
}

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "";
  return path.substring(dot);
}

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

    // ========== 1. Build XLSX ==========
    const excelRows = txns.map((t: Record<string, unknown>, idx: number) => ({
      "מס׳": idx + 1,
      "תאריך": t.txn_date,
      "סוג": directionLabels[t.direction as string] || t.direction,
      "קטגוריה": categoryLabels[t.category as string] || t.category || "—",
      "סכום": Number(t.amount),
      "אמצעי תשלום": paymentMethodLabels[t.payment_method as string] || t.payment_method || "—",
      "שם צד נגדי": t.counterparty_name || "—",
      "סטטוס": statusLabels[t.status as string] || t.status,
      "סוג מסמך": docTypeLabels[t.doc_type as string] || t.doc_type || "—",
      "הערות": t.notes || "",
      "קובץ מצורף": t.doc_path
        ? `${t.txn_date}_${sanitizeFilename(categoryLabels[t.category as string] || t.category as string || "other")}_${t.amount}ILS${getFileExtension(t.doc_path as string)}`
        : "—",
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Set column widths for readability
    ws["!cols"] = [
      { wch: 5 },   // Row number
      { wch: 12 },  // Date
      { wch: 8 },   // Type
      { wch: 18 },  // Category
      { wch: 12 },  // Amount
      { wch: 16 },  // Payment method
      { wch: 20 },  // Counterparty
      { wch: 8 },   // Status
      { wch: 14 },  // Doc type
      { wch: 30 },  // Notes
      { wch: 40 },  // Attached file
    ];

    // Set RTL for Hebrew
    ws["!sheetViews"] = [{ rightToLeft: true }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `כספים ${month}`);
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;

    // ========== 2. Download all receipt files ==========
    const receiptsFolder = `Receipts_${month}`;
    const zipFiles: Record<string, Uint8Array> = {};

    // Add XLSX to zip
    zipFiles[`Finance_${month}.xlsx`] = new Uint8Array(xlsxBuffer);

    // Download each attached document
    const docPromises = txns
      .filter((t: Record<string, unknown>) => t.doc_path)
      .map(async (t: Record<string, unknown>) => {
        try {
          const docPath = t.doc_path as string;
          const ext = getFileExtension(docPath);
          const catLabel = sanitizeFilename(
            categoryLabels[t.category as string] || (t.category as string) || "other"
          );
          const amount = t.amount;
          const renamedFile = `${t.txn_date}_${catLabel}_${amount}ILS${ext}`;

          const { data, error } = await adminClient.storage
            .from("finance-docs")
            .download(docPath);

          if (error || !data) {
            console.error(`Failed to download ${docPath}:`, error?.message);
            return;
          }

          const arrayBuffer = await data.arrayBuffer();
          zipFiles[`${receiptsFolder}/${renamedFile}`] = new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`Error downloading doc for txn ${t.id}:`, err);
        }
      });

    await Promise.all(docPromises);

    // ========== 3. Create ZIP ==========
    const zipped = zipSync(zipFiles);

    // ========== 4. Upload ZIP to storage ==========
    const zipFileName = `Finance_${month}.zip`;
    const zipPath = `exports/${zipFileName}`;

    await adminClient.storage
      .from("finance-docs")
      .upload(zipPath, zipped, {
        contentType: "application/zip",
        upsert: true,
      });

    // Generate signed URL (valid for 7 days)
    const { data: signedData, error: signError } = await adminClient.storage
      .from("finance-docs")
      .createSignedUrl(zipPath, 7 * 24 * 60 * 60);

    if (signError) throw signError;

    // Calculate totals for response
    const totalIncome = txns
      .filter((t: Record<string, unknown>) => t.direction === "income")
      .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
    const totalExpenses = txns
      .filter((t: Record<string, unknown>) => t.direction === "expense")
      .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

    const docCount = txns.filter((t: Record<string, unknown>) => t.doc_path).length;

    return new Response(
      JSON.stringify({
        url: signedData!.signedUrl,
        filename: zipFileName,
        month,
        transactions_count: txns.length,
        documents_count: docCount,
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
