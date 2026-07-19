import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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

    const { month, direction = "all" } = await req.json();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Invalid month format");
    }
    if (!["all", "income", "expense"].includes(direction)) {
      throw new Error("Invalid direction");
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
    // סינון לפי בחירת המשתמש: הכל / רק הכנסות / רק הוצאות
    const txns = (transactions || []).filter(
      (t: Record<string, unknown>) => direction === "all" || t.direction === direction
    );
    const directionTitles: Record<string, string> = {
      all: "הכנסות והוצאות",
      income: "הכנסות בלבד",
      expense: "הוצאות בלבד",
    };

    // Totals — computed early for the summary sheet
    const totalIncome = txns
      .filter((t: Record<string, unknown>) => t.direction === "income")
      .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
    const totalExpenses = txns
      .filter((t: Record<string, unknown>) => t.direction === "expense")
      .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
    const docCount = txns.filter((t: Record<string, unknown>) => t.doc_path).length;

    // ========== 1. Build XLSX ==========
    // גיליון סיכום — הכנסות מול הוצאות + פירוט לפי קטגוריה
    const catSum = (dir: string): [string, number][] => {
      const m = new Map<string, number>();
      txns.filter((t: Record<string, unknown>) => t.direction === dir)
        .forEach((t: Record<string, unknown>) => {
          const label = categoryLabels[t.category as string] || (t.category as string) || "אחר";
          m.set(label, (m.get(label) || 0) + Number(t.amount));
        });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const summaryAoa: (string | number)[][] = [
      [`דוח כספים (${directionTitles[direction]}) — יהב אינסטלציה`, month],
      [],
      ...(direction !== "expense" ? [["סה\"כ הכנסות", totalIncome] as (string | number)[]] : []),
      ...(direction !== "income" ? [["סה\"כ הוצאות", totalExpenses] as (string | number)[]] : []),
      ...(direction === "all" ? [["רווח נקי", totalIncome - totalExpenses] as (string | number)[]] : []),
      ["מס' רשומות", txns.length],
      ["מס' קבלות ומסמכים מצורפים", docCount],
      ...(direction !== "expense" ? [[], ["הכנסות לפי קטגוריה", ""], ...catSum("income")] : []),
      ...(direction !== "income" ? [[], ["הוצאות לפי קטגוריה", ""], ...catSum("expense")] : []),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary["!cols"] = [{ wch: 28 }, { wch: 16 }];
    wsSummary["!sheetViews"] = [{ rightToLeft: true }];

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
      "קבלה/מסמך": t.doc_path ? "כן — בקובץ ה-PDF המאוחד" : "—",
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
    XLSX.utils.book_append_sheet(wb, wsSummary, "סיכום");
    XLSX.utils.book_append_sheet(wb, ws, `כספים ${month}`);
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;

    // ========== 2. Download all receipt files ==========
    const receiptsFolder = `Receipts_${month}`;
    const zipFiles: Record<string, Uint8Array> = {};

    // Add XLSX to zip
    zipFiles[`Finance_${month}.xlsx`] = new Uint8Array(xlsxBuffer);

    // הורדת כל המסמכים המצורפים (לפי סדר תאריכים) לצורך איחוד ל-PDF אחד
    const docTxns = txns.filter((t: Record<string, unknown>) => t.doc_path);
    const downloaded: { t: Record<string, unknown>; bytes: Uint8Array; ext: string }[] = [];

    await Promise.all(docTxns.map(async (t: Record<string, unknown>) => {
      try {
        const docPath = t.doc_path as string;
        // קבלות הכנסה שמורות ב-bucket "receipts", מסמכי הוצאות ב-"finance-docs" — מנסים את שניהם
        let file = await adminClient.storage.from("finance-docs").download(docPath);
        if (file.error || !file.data) {
          file = await adminClient.storage.from("receipts").download(docPath);
        }
        if (file.error || !file.data) {
          console.error(`Failed to download ${docPath} from both buckets:`, file.error?.message);
          return;
        }
        const arrayBuffer = await file.data.arrayBuffer();
        downloaded.push({ t, bytes: new Uint8Array(arrayBuffer), ext: getFileExtension(docPath).toLowerCase() });
      } catch (err) {
        console.error(`Error downloading doc for txn ${t.id}:`, err);
      }
    }));

    // מיון לפי תאריך כדי שה-PDF יהיה כרונולוגי
    downloaded.sort((a, b) => String(a.t.txn_date).localeCompare(String(b.t.txn_date)));

    // ========== 2.5 איחוד כל הקבלות ל-PDF אחד ==========
    const mergedPdf = await PDFDocument.create();
    const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
    let mergedCount = 0;

    for (let i = 0; i < downloaded.length; i++) {
      const { t, bytes, ext } = downloaded[i];
      // כותרת באנגלית/ספרות בלבד (הפונט הסטנדרטי לא תומך בעברית)
      const dirTag = t.direction === "income" ? "INCOME" : "EXPENSE";
      const label = `${i + 1}/${downloaded.length}  |  ${t.txn_date}  |  ${dirTag}  |  ${Number(t.amount).toFixed(2)} ILS`;
      try {
        if (ext === ".pdf") {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await mergedPdf.copyPages(src, src.getPageIndices());
          pages.forEach((p, pi) => {
            mergedPdf.addPage(p);
            if (pi === 0) {
              p.drawText(label, { x: 12, y: p.getHeight() - 16, size: 10, font, color: rgb(0.8, 0.1, 0.1) });
            }
          });
          mergedCount++;
        } else if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
          const img = ext === ".png" ? await mergedPdf.embedPng(bytes) : await mergedPdf.embedJpg(bytes);
          const headerH = 34;
          const page = mergedPdf.addPage([img.width, img.height + headerH]);
          page.drawRectangle({ x: 0, y: img.height, width: img.width, height: headerH, color: rgb(0.95, 0.95, 0.95) });
          page.drawText(label, { x: 14, y: img.height + 11, size: Math.max(12, Math.min(22, img.width / 40)), font, color: rgb(0.1, 0.1, 0.1) });
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          mergedCount++;
        } else {
          throw new Error(`unsupported ext ${ext}`);
        }
      } catch (err) {
        // קובץ שלא ניתן לאחד — נכנס ל-ZIP כקובץ נפרד כדי שלא יאבד
        console.error(`Cannot merge doc for txn ${t.id}:`, err);
        const catLabel = sanitizeFilename(
          categoryLabels[t.category as string] || (t.category as string) || "other"
        );
        zipFiles[`${receiptsFolder}/${t.txn_date}_${catLabel}_${t.amount}ILS${ext}`] = bytes;
      }
    }

    if (mergedCount > 0) {
      const pdfBytes = await mergedPdf.save();
      zipFiles[`Receipts_${month}${direction === "all" ? "" : "_" + direction}.pdf`] = new Uint8Array(pdfBytes);
    }

    // ========== 3. Create ZIP ==========
    const zipped = zipSync(zipFiles);

    // ========== 4. Upload ZIP to storage ==========
    const zipFileName = `Finance_${month}${direction === "all" ? "" : "_" + direction}.zip`;
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

    return new Response(
      JSON.stringify({
        url: signedData!.signedUrl,
        filename: zipFileName,
        direction,
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
