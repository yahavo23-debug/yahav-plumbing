import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { buildPdfHeader, buildPdfFooter, BUSINESS_INFO, renderCanvasToPdf, escapeHtml, escapeHtmlWithBreaks } from "@/lib/pdf-utils";

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
      const includeVat = quote.include_vat !== false;
      const vatAmount = includeVat ? afterDiscount * (VAT_RATE / 100) : 0;
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

      // Get signature URL if exists
      let signatureUrl: string | null = null;
      if (quote.signature_path) {
        const { data: sigData } = await supabase.storage
          .from("signatures")
          .createSignedUrl(quote.signature_path, 300);
        if (sigData?.signedUrl) signatureUrl = sigData.signedUrl;
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
        includeVat,
        dateStr,
        validDaysText,
        logoUrl,
        signatureUrl,
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
      renderCanvasToPdf(canvas, pdf);

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
  includeVat: boolean;
  dateStr: string;
  validDaysText: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}) {
  const {
    quote, items, sc, customer,
    subtotal, discountPercent, discountAmount, afterDiscount, vatAmount, total,
    includeVat, dateStr, validDaysText, logoUrl, signatureUrl,
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
    value ? `<tr><td style="padding:4px 8px;font-size:13px;font-weight:600;color:#555;width:120px;vertical-align:top;">${label}</td><td style="padding:4px 8px;font-size:13px;">${escapeHtml(value)}</td></tr>` : "";

  let html = buildPdfHeader({
    title: "הצעת מחיר",
    subtitle: `${BUSINESS_INFO.name} – ${BUSINESS_INFO.subtitle}`,
    logoUrl,
  });

  html += `
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

  // Scope of Work section
  if (quote.scope_of_work) {
    html += buildScopeOfWorkHtml(quote.scope_of_work, sectionTitle);
  }

  // 1) Findings
  const findingsSectionNum = quote.scope_of_work ? "2" : "1";
  const serviceSectionNum = quote.scope_of_work ? "3" : "2";
  const itemsSectionNum = quote.scope_of_work ? "4" : "3";
  const termsSectionNum = quote.scope_of_work ? "5" : "4";
  const approvalSectionNum = quote.scope_of_work ? "6" : "5";

  if (findings) {
    html += sectionTitle(findingsSectionNum, "אבחון / ממצאים");
    html += `<p style="font-size:13px;margin:0 0 8px;padding:10px 14px;background:#fff8f0;border-right:3px solid #f59e0b;border-radius:4px;">${escapeHtmlWithBreaks(findings)}</p>`;
  }
  html += sectionTitle(serviceSectionNum, "מה כולל השירות");
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

  // Line items table
  html += sectionTitle(itemsSectionNum, "הצעת מחיר – סעיפים");
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
        <td style="padding:7px 10px;border-bottom:1px solid #eee;">${escapeHtml(item.description)}</td>
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
        <span>סה״כ${includeVat ? ' לפני מע״מ' : ''}</span>
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
  if (includeVat) {
    html += `
      <div style="display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;border-bottom:1px solid #eee;">
        <span>מע״מ (${VAT_RATE}%)</span>
        <span style="font-weight:600;">₪${vatAmount.toFixed(2)}</span>
      </div>
    `;
  }
  html += `
      <div style="display:flex;justify-content:space-between;padding:10px 14px;font-size:15px;font-weight:800;background:#eef2ff;">
        <span>${includeVat ? 'סה״כ כולל מע״מ' : 'סה״כ לתשלום'}</span>
        <span>₪${total.toFixed(2)}</span>
      </div>
    </div>
  `;

  // Terms
  html += sectionTitle(termsSectionNum, "תנאים והבהרות");
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

  // Customer approval
  html += sectionTitle(approvalSectionNum, "אישור לקוח");

  if (signatureUrl && quote.signed_at) {
    // Signed — show embedded signature with legal info
    const signedDate = new Date(quote.signed_at).toLocaleString("he-IL");
    html += `
      <div style="margin-top:8px;border:1px solid #e0e0e0;border-radius:8px;padding:16px;background:#fafafa;">
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap;">
          <div>
            <p style="font-size:11px;color:#888;margin:0 0 4px;">חתימה:</p>
            <img src="${signatureUrl}" style="max-height:80px;max-width:280px;border-bottom:2px solid #333;" crossorigin="anonymous" />
          </div>
          <div style="font-size:12px;line-height:1.8;">
            ${quote.signed_by ? `<p style="margin:0;"><strong>שם החותם:</strong> ${escapeHtml(quote.signed_by)}</p>` : ""}
            <p style="margin:0;"><strong>תאריך ושעה:</strong> ${signedDate}</p>
            ${quote.ip_address ? `<p style="margin:0;"><strong>כתובת IP:</strong> ${quote.ip_address}</p>` : ""}
          </div>
        </div>
      </div>
    `;
  } else {
    // Not signed — show blank fields
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
  }

  // Notes
  if (quote.notes) {
    html += `
      <div style="margin-top:18px;padding:10px 14px;background:#fffbeb;border-right:3px solid #f59e0b;border-radius:4px;font-size:13px;">
        <strong>הערות:</strong><br/>${escapeHtmlWithBreaks(quote.notes)}
      </div>
    `;
  }

  html += buildPdfFooter(dateStr, new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));

  return html;
}

function buildScopeOfWorkHtml(scope: any, sectionTitle: (num: string, text: string) => string): string {
  let html = sectionTitle("1", "תכולת עבודה (Scope of Work)");

  const scopeRow = (label: string, value: string) =>
    `<div style="margin-bottom:8px;">
      <p style="font-size:11px;font-weight:700;color:#666;margin:0 0 2px;">${label}</p>
      <p style="font-size:13px;margin:0;white-space:pre-wrap;">${escapeHtmlWithBreaks(value)}</p>
    </div>`;

  if (scope.project_overview) html += scopeRow("סקירת הפרויקט", scope.project_overview);
  if (scope.demolition) html += scopeRow("פירוק והכנה", scope.demolition);
  if (scope.plumbing) html += scopeRow("התקנת אינסטלציה", scope.plumbing);
  if (scope.drying_included) {
    html += scopeRow("ייבוש תת-רצפתי", `כלול${scope.drying_duration_days ? ` — ${scope.drying_duration_days} ימים` : ""}`);
  }
  if (scope.restoration_included && scope.restoration_details) {
    html += scopeRow("שיקום מבנה", scope.restoration_details);
  }
  if (scope.tiling_included) {
    const method = scope.tiling_pricing_method === "sqm" ? 'למ"ר' : scope.tiling_pricing_method === "daily" ? "ליום" : "";
    const price = scope.tiling_price ? `₪${scope.tiling_price} ${method}` : "כלול";
    html += scopeRow("ריצוף", price);
  }
  if (scope.materials_note) html += scopeRow("חומרים", scope.materials_note);
  if (scope.workforce_crew_size || scope.workforce_duration_days) {
    const parts = [];
    if (scope.workforce_crew_size) parts.push(`${scope.workforce_crew_size} עובדים`);
    if (scope.workforce_duration_days) parts.push(`${scope.workforce_duration_days} ימים`);
    html += scopeRow("כוח אדם", parts.join(" | "));
  }
  if (scope.equipment_note) html += scopeRow("ציוד", scope.equipment_note);
  if (scope.warranty_note) html += scopeRow("אחריות", scope.warranty_note);

  return html;
}
