import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface QuotePdfExportProps {
  quoteId: string;
  serviceCallId: string;
}

import { getJobTypeLabel } from "@/lib/constants";

const serviceTypeLabels: Record<string, string> = {
  leak_detection: "איתור נזילה",
  sewer_camera: "צילום קו ביוב",
  pressure_test: "בדיקת לחץ",
  other: "אחר",
};

const VAT_RATE = 18;

export function QuotePdfExport({ quoteId, serviceCallId }: QuotePdfExportProps) {
  const { logoUrl } = useLogo();
  const [generating, setGenerating] = useState(false);

  const generatePdf = async () => {
    setGenerating(true);
    try {
      // Load all needed data in parallel
      const [quoteRes, itemsRes, scRes] = await Promise.all([
        supabase.from("quotes").select("*").eq("id", quoteId).single(),
        supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order"),
        supabase.from("service_calls").select("*, customers(*)").eq("id", serviceCallId).single(),
      ]);

      if (quoteRes.error) throw quoteRes.error;
      if (scRes.error) throw scRes.error;

      const quote = quoteRes.data as any;
      const items = (itemsRes.data || []) as any[];
      const sc = scRes.data as any;
      const customer = sc.customers as any;

      // Calculate totals
      const subtotal = items.reduce(
        (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unit_price),
        0
      );
      const discountPercent = Number(quote.discount_percent) || 0;
      const discountAmount = subtotal * (discountPercent / 100);
      const afterDiscount = subtotal - discountAmount;
      const vatAmount = afterDiscount * (VAT_RATE / 100);
      const total = afterDiscount + vatAmount;

      const now = new Date();
      const dateStr = now.toLocaleDateString("he-IL");

      // Determine valid days
      let validDaysText = "30";
      if (quote.valid_until) {
        const validDate = new Date(quote.valid_until);
        const diffMs = validDate.getTime() - now.getTime();
        const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        validDaysText = String(diffDays);
      }

      // Build HTML
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-9999px;top:0;width:794px;background:white;padding:40px;direction:rtl;font-family:'Heebo',sans-serif;color:#1a1a1a;line-height:1.7;";
      document.body.appendChild(container);

      container.innerHTML = buildQuoteHtml({
        quote,
        items,
        sc,
        customer,
        subtotal,
        discountPercent,
        discountAmount,
        afterDiscount,
        vatAmount,
        total,
        dateStr,
        validDaysText,
        logoUrl,
      });

      // Wait for images
      const images = container.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) { resolve(); return; }
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            })
        )
      );
      await new Promise((r) => setTimeout(r, 300));

      // Capture to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      });

      // Generate PDF with multi-page support
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download
      const fileName = `הצעת_מחיר_${customer?.name || "לקוח"}_${dateStr.replace(/\//g, "-")}.pdf`;
      pdf.save(fileName);

      document.body.removeChild(container);
      toast({ title: "PDF הורד", description: "הצעת המחיר הורדה בהצלחה" });
    } catch (err: any) {
      console.error("Quote PDF error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={generatePdf}
      disabled={generating}
      title="הורד PDF"
    >
      {generating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
    </Button>
  );
}

function buildQuoteHtml(data: {
  quote: any;
  items: any[];
  sc: any;
  customer: any;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  afterDiscount: number;
  vatAmount: number;
  total: number;
  dateStr: string;
  validDaysText: string;
  logoUrl: string | null;
}) {
  const {
    quote, items, sc, customer,
    subtotal, discountPercent, discountAmount, afterDiscount, vatAmount, total,
    dateStr, validDaysText, logoUrl,
  } = data;

  const address = [customer?.city, customer?.address].filter(Boolean).join(" ");
  const jobType = getJobTypeLabel(sc.job_type);
  const findings = sc.findings || "";
  const description = sc.description || "";
  const leakLocation = sc.leak_location || "";

  // Style helpers
  const sectionTitle = (num: string, text: string) =>
    `<h2 style="font-size:15px;font-weight:700;margin:22px 0 10px;color:#1a56db;">${num}) ${text}</h2>`;

  const infoRow = (label: string, value: string) =>
    value ? `<tr><td style="padding:4px 8px;font-size:13px;font-weight:600;color:#555;width:120px;vertical-align:top;">${label}</td><td style="padding:4px 8px;font-size:13px;">${value}</td></tr>` : "";

  // Header
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a56db;padding-bottom:16px;margin-bottom:20px;">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:#1a56db;margin:0;">הצעת מחיר</h1>
        <p style="font-size:14px;font-weight:600;color:#333;margin:4px 0 0;">Yahav.OU – איתור נזילות וצילום קווי ביוב</p>
      </div>
      ${logoUrl ? `<img src="${logoUrl}" style="max-height:55px;max-width:180px;object-fit:contain;" crossorigin="anonymous" />` : ""}
    </div>

    <div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:20px;">
      <span>תאריך: ${dateStr}</span>
      <span>מס׳ הצעה: ${quote.quote_number || "—"}</span>
    </div>
  `;

  // Customer details
  html += `
    <div style="background:#f8f9fa;padding:14px 16px;border-radius:6px;margin-bottom:18px;">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 8px;color:#333;">פרטי לקוח</h3>
      <table style="width:100%;">
        ${infoRow("שם", customer?.name || "—")}
        ${infoRow("טלפון", customer?.phone || "—")}
        ${infoRow("כתובת", address || "—")}
      </table>
    </div>
  `;

  // Service call details
  html += `
    <div style="background:#f0f4ff;padding:14px 16px;border-radius:6px;margin-bottom:18px;">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 8px;color:#333;">פרטי קריאה</h3>
      <table style="width:100%;">
        ${infoRow("סוג עבודה", jobType)}
        ${infoRow("תיאור קצר", description)}
        ${infoRow("מיקום", leakLocation)}
      </table>
    </div>
  `;

  // 1) Findings
  if (findings) {
    html += sectionTitle("1", "אבחון / ממצאים");
    html += `<p style="font-size:13px;margin:0 0 8px;padding:10px 14px;background:#fff8f0;border-right:3px solid #f59e0b;border-radius:4px;">${findings.replace(/\n/g, "<br/>")}</p>`;
  }

  // 2) What the service includes
  html += sectionTitle("2", "מה כולל השירות");
  const serviceIncludes = [
    "ביקור ובדיקת שטח",
    "אבחון מקצועי והצגת ממצאים ללקוח",
    "ביצוע העבודה בהתאם לסעיפים בהצעה",
    "תיעוד תמונות/וידאו לפי הצורך",
    "דוח מסכם בסיום (PDF)",
  ];
  html += `<ul style="font-size:13px;margin:0;padding:0 20px;">`;
  for (const item of serviceIncludes) {
    html += `<li style="margin-bottom:4px;">${item}</li>`;
  }
  html += `</ul>`;

  // 3) Line items table
  html += sectionTitle("3", "הצעת מחיר – סעיפים");
  html += `
    <table style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #ddd;margin-bottom:4px;">
      <thead>
        <tr style="background:#eef2ff;">
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #c7d2fe;font-weight:700;">סעיף</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #c7d2fe;font-weight:700;width:60px;">כמות</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #c7d2fe;font-weight:700;width:70px;">יחידה</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #c7d2fe;font-weight:700;width:90px;">מחיר ליחידה</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #c7d2fe;font-weight:700;width:90px;">סה״כ</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const item of items) {
    const lineTotal = Number(item.quantity) * Number(item.unit_price);
    html += `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;">${item.description || ""}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #eee;">${item.quantity}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #eee;">יח׳</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #eee;">₪${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #eee;">₪${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }
  html += `</tbody></table>`;

  // Totals
  html += `
    <div style="margin-top:8px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;border-bottom:1px solid #eee;">
        <span>סה״כ לפני מע״מ</span>
        <span style="font-weight:600;">₪${subtotal.toFixed(2)}</span>
      </div>
  `;
  if (discountPercent > 0) {
    html += `
      <div style="display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;border-bottom:1px solid #eee;color:#dc2626;">
        <span>הנחה (${discountPercent}%)</span>
        <span style="font-weight:600;">-₪${discountAmount.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;border-bottom:1px solid #eee;">
        <span>לאחר הנחה</span>
        <span style="font-weight:600;">₪${afterDiscount.toFixed(2)}</span>
      </div>
    `;
  }
  html += `
      <div style="display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;border-bottom:1px solid #eee;">
        <span>מע״מ (${VAT_RATE}%)</span>
        <span style="font-weight:600;">₪${vatAmount.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 14px;font-size:15px;font-weight:800;background:#eef2ff;">
        <span>סה״כ לתשלום</span>
        <span>₪${total.toFixed(2)}</span>
      </div>
    </div>
  `;

  // 4) Terms
  html += sectionTitle("4", "תנאים והבהרות");
  const terms = [
    `ההצעה תקפה ל-${validDaysText} ימים.`,
    "המחיר כולל את הסעיפים המפורטים בלבד.",
    "תוספות/חריגים יתומחרו רק לאחר אישור הלקוח.",
    "זמני ביצוע משוערים: בתיאום עם הלקוח.",
    "אחריות: בהתאם לסוג העבודה ולהסכמה.",
  ];
  html += `<ul style="font-size:13px;margin:0;padding:0 20px;">`;
  for (const term of terms) {
    html += `<li style="margin-bottom:4px;">${term}</li>`;
  }
  html += `</ul>`;

  // 5) Customer approval
  html += sectionTitle("5", "אישור לקוח");
  html += `
    <div style="margin-top:8px;font-size:13px;">
      <div style="display:flex;gap:40px;margin-bottom:16px;">
        <div style="flex:1;">
          <span style="color:#666;">שם מאשר:</span>
          <div style="border-bottom:1px solid #333;min-height:24px;margin-top:4px;"></div>
        </div>
        <div style="flex:1;">
          <span style="color:#666;">תאריך:</span>
          <div style="border-bottom:1px solid #333;min-height:24px;margin-top:4px;"></div>
        </div>
      </div>
      <div>
        <span style="color:#666;">חתימה:</span>
        <div style="border-bottom:1px solid #333;min-height:40px;margin-top:4px;"></div>
      </div>
    </div>
  `;

  // Notes
  if (quote.notes) {
    html += `
      <div style="margin-top:18px;padding:10px 14px;background:#fffbeb;border-right:3px solid #f59e0b;border-radius:4px;font-size:13px;">
        <strong>הערות:</strong><br/>${quote.notes.replace(/\n/g, "<br/>")}
      </div>
    `;
  }

  // Footer
  html += `
    <div style="margin-top:30px;padding-top:12px;border-top:2px solid #e0e0e0;text-align:center;font-size:12px;color:#888;">
      <p style="margin:0;font-weight:600;">להמשך תיאום ואישור:</p>
      <p style="margin:4px 0 0;">Yahav.OU – איתור נזילות וצילום קווי ביוב</p>
    </div>
  `;

  return html;
}
