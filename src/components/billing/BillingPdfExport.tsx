import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { buildPdfHeader, buildPdfFooter, renderCanvasToPdf } from "@/lib/pdf-utils";

interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: string;
  amount: number;
  description: string | null;
  receipt_path?: string | null;
}

interface BillingPdfExportProps {
  customerName: string;
  customerPhone?: string | null;
  customerCity?: string | null;
  customerAddress?: string | null;
  entries: LedgerEntry[];
  balance: number;
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  overdueSince: string | null;
  overdueDays: number;
  hasLegalAction: boolean;
  legalActionNote: string;
}

const entryTypeLabels: Record<string, string> = {
  charge: "חיוב",
  payment: "תשלום",
  credit: "זיכוי",
};

export function BillingPdfExport({
  customerName,
  customerPhone,
  customerCity,
  customerAddress,
  entries,
  balance,
  totalCharges,
  totalPayments,
  totalCredits,
  overdueSince,
  overdueDays,
  hasLegalAction,
  legalActionNote,
}: BillingPdfExportProps) {
  const { logoUrl } = useLogo();
  const [generating, setGenerating] = useState(false);

  const generatePdf = async () => {
    setGenerating(true);
    try {
      // Load receipt images
      const entriesWithReceipts = await Promise.all(
        entries.map(async (entry) => {
          if (!entry.receipt_path) return { ...entry, receiptUrl: null };
          const { data } = await supabase.storage
            .from("receipts")
            .createSignedUrl(entry.receipt_path, 600);
          return { ...entry, receiptUrl: data?.signedUrl || null };
        })
      );

      const now = new Date();
      const dateStr = now.toLocaleDateString("he-IL");
      const timeStr = now.toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Create hidden container
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-9999px;top:0;width:794px;background:white;padding:40px;direction:rtl;font-family:'Heebo',sans-serif;color:#1a1a1a;line-height:1.6;";
      document.body.appendChild(container);

      container.innerHTML = buildBillingHtml({
        customerName,
        customerPhone,
        customerCity,
        customerAddress,
        entries: entriesWithReceipts,
        balance,
        totalCharges,
        totalPayments,
        totalCredits,
        overdueSince,
        overdueDays,
        hasLegalAction,
        legalActionNote,
        logoUrl,
        dateStr,
        timeStr,
      });

      // Wait for images
      const images = container.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            })
        )
      );
      await new Promise((r) => setTimeout(r, 300));

      // Capture
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      });

      // Generate PDF
      const pdf = new jsPDF("p", "mm", "a4");
      renderCanvasToPdf(canvas, pdf);

      // Download directly to device
      const fileName = `דוח_גבייה_${customerName}_${dateStr.replace(/\//g, "-")}.pdf`;
      pdf.save(fileName);

      document.body.removeChild(container);
      toast({ title: "PDF הורד", description: "דוח הגבייה הורד בהצלחה" });
    } catch (err: any) {
      console.error("Billing PDF error:", err);
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePdf}
      disabled={generating}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {generating ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> מפיק PDF...
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4" /> הורד דוח גבייה
        </>
      )}
    </Button>
  );
}

function buildBillingHtml(data: {
  customerName: string;
  customerPhone?: string | null;
  customerCity?: string | null;
  customerAddress?: string | null;
  entries: any[];
  balance: number;
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  overdueSince: string | null;
  overdueDays: number;
  hasLegalAction: boolean;
  legalActionNote: string;
  logoUrl: string | null;
  dateStr: string;
  timeStr: string;
}) {
  const {
    customerName,
    customerPhone,
    customerCity,
    customerAddress,
    entries,
    balance,
    totalCharges,
    totalPayments,
    totalCredits,
    overdueSince,
    overdueDays,
    hasLegalAction,
    legalActionNote,
    logoUrl,
    dateStr,
    timeStr,
  } = data;

  const balanceColor = balance > 0 ? "#dc2626" : balance < 0 ? "#16a34a" : "#1a1a1a";
  const balanceText = balance > 0 ? "חוב" : balance < 0 ? "זכות" : "מאוזן";

  let html = buildPdfHeader({
    title: "דוח גבייה",
    subtitle: `${customerName} | ${dateStr} ${timeStr}`,
    logoUrl,
  });

  html += `
      <h2 style="font-size:14px;font-weight:700;margin:0 0 8px;">פרטי לקוח</h2>
      <p style="font-size:13px;margin:4px 0;"><strong>שם:</strong> ${customerName}</p>
      ${customerPhone ? `<p style="font-size:13px;margin:4px 0;"><strong>טלפון:</strong> ${customerPhone}</p>` : ""}
      ${customerCity || customerAddress ? `<p style="font-size:13px;margin:4px 0;"><strong>כתובת:</strong> ${[customerCity, customerAddress].filter(Boolean).join(" ")}</p>` : ""}
    </div>

    <!-- Summary cards -->
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;background:#fef2f2;padding:12px;border-radius:6px;text-align:center;">
        <p style="font-size:11px;color:#666;margin:0;">סה"כ חיובים</p>
        <p style="font-size:18px;font-weight:700;color:#dc2626;margin:4px 0 0;">₪${totalCharges.toFixed(2)}</p>
      </div>
      <div style="flex:1;background:#f0fdf4;padding:12px;border-radius:6px;text-align:center;">
        <p style="font-size:11px;color:#666;margin:0;">סה"כ תשלומים</p>
        <p style="font-size:18px;font-weight:700;color:#16a34a;margin:4px 0 0;">₪${totalPayments.toFixed(2)}</p>
      </div>
      <div style="flex:1;background:#eff6ff;padding:12px;border-radius:6px;text-align:center;">
        <p style="font-size:11px;color:#666;margin:0;">סה"כ זיכויים</p>
        <p style="font-size:18px;font-weight:700;color:#2563eb;margin:4px 0 0;">₪${totalCredits.toFixed(2)}</p>
      </div>
      <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px;text-align:center;border:2px solid ${balanceColor};">
        <p style="font-size:11px;color:#666;margin:0;">יתרה</p>
        <p style="font-size:18px;font-weight:700;color:${balanceColor};margin:4px 0 0;">₪${Math.abs(balance).toFixed(2)} ${balanceText}</p>
      </div>
    </div>
  `;

  // Overdue info
  if (overdueSince) {
    html += `
      <div style="background:#fef3c7;padding:10px 14px;border-radius:6px;margin-bottom:16px;border:1px solid #f59e0b;">
        <p style="font-size:13px;margin:0;color:#92400e;"><strong>⚠ פיגור:</strong> מאז ${new Date(overdueSince).toLocaleDateString("he-IL")} (${overdueDays} ימים)</p>
      </div>
    `;
  }

  // Legal action
  if (hasLegalAction) {
    html += `
      <div style="background:#fef2f2;padding:10px 14px;border-radius:6px;margin-bottom:16px;border:1px solid #ef4444;">
        <p style="font-size:13px;margin:0;color:#991b1b;"><strong>⚖ טיפול משפטי פעיל</strong></p>
        ${legalActionNote ? `<p style="font-size:12px;margin:4px 0 0;color:#991b1b;">${legalActionNote}</p>` : ""}
      </div>
    `;
  }

  // Entries table
  html += `
    <h2 style="font-size:15px;font-weight:700;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #e0e0e0;">פירוט תנועות (${entries.length})</h2>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead>
        <tr style="background:#f8f9fa;">
          <th style="padding:8px;text-align:right;border-bottom:2px solid #e0e0e0;">תאריך</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #e0e0e0;">סוג</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #e0e0e0;">סכום</th>
          <th style="padding:8px;text-align:right;border-bottom:2px solid #e0e0e0;">תיאור</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #e0e0e0;">קבלה</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const entry of entries) {
    const typeLabel = entryTypeLabels[entry.entry_type] || entry.entry_type;
    const typeColor =
      entry.entry_type === "charge"
        ? "#dc2626"
        : entry.entry_type === "payment"
        ? "#16a34a"
        : "#2563eb";

    html += `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;">${new Date(entry.entry_date).toLocaleDateString("he-IL")}</td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;color:${typeColor};font-weight:600;">${typeLabel}</td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;font-weight:600;">₪${Number(entry.amount).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;">${entry.description || "—"}</td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;">
          ${entry.receiptUrl ? `<img src="${entry.receiptUrl}" style="width:60px;height:45px;object-fit:cover;border-radius:3px;border:1px solid #ddd;" crossorigin="anonymous" />` : "—"}
        </td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  html += buildPdfFooter(dateStr, timeStr);

  return html;
}
