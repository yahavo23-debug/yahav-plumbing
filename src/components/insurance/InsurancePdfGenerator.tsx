import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { buildPdfHeader, buildPdfFooter, renderCanvasToPdf, escapeHtml, escapeHtmlWithBreaks, BUSINESS_INFO } from "@/lib/pdf-utils";

const damageTypeLabels: Record<string, string> = {
  leak: "נזילה",
  burst: "פיצוץ",
  clog: "סתימה",
  structural: "נזק מבני",
  other: "אחר",
};

interface CostItem {
  description: string;
  amount: number;
}

interface InsurancePdfGeneratorProps {
  reportData: {
    reportMode: string;
    eventDescription: string;
    damageType: string;
    isEmergency: boolean;
    technicalDetails: string;
    costSummary: CostItem[];
    professionalStatement: string;
  };
  serviceCall: any;
  customer: any;
  photos: any[];
}

export function InsurancePdfGenerator({ reportData, serviceCall, customer, photos }: InsurancePdfGeneratorProps) {
  const { logoUrl } = useLogo();
  const [generating, setGenerating] = useState(false);

  const generatePdf = async () => {
    setGenerating(true);
    try {
      // Get signed URLs for photos
      const photoUrls = await Promise.all(
        photos.slice(0, 20).map(async (p: any) => {
          const { data } = await supabase.storage
            .from("photos")
            .createSignedUrl(p.storage_path, 600);
          return { ...p, url: data?.signedUrl };
        })
      );

      const beforePhotos = photoUrls.filter(p => p.url && (p.tag === "before" || p.tag === "finding"));
      const afterPhotos = photoUrls.filter(p => p.url && p.tag === "after");
      const otherPhotos = photoUrls.filter(p => p.url && p.tag === "other");

      // Create hidden container
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-9999px;top:0;width:794px;background:white;padding:40px;direction:rtl;font-family:'Heebo',sans-serif;color:#1a1a1a;line-height:1.6;";
      document.body.appendChild(container);

      const now = new Date();
      const dateStr = now.toLocaleDateString("he-IL");
      const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

      const isQuote = reportData.reportMode === "quote";
      const title = isQuote
        ? "הצעת מחיר לתיקון ליקויי אינסטלציה"
        : "דו״ח בדיקה ותיקון ליקויי אינסטלציה";

      container.innerHTML = buildInsuranceHtml({
        ...reportData,
        title,
        isQuote,
        customer,
        serviceCall,
        beforePhotos,
        afterPhotos,
        otherPhotos,
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
              if (img.complete) { resolve(); return; }
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            })
        )
      );
      await new Promise((r) => setTimeout(r, 300));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      renderCanvasToPdf(canvas, pdf);

      const dateLabel = now.toLocaleDateString("he-IL").replace(/\//g, "-");
      const prefix = isQuote ? "הצעת_מחיר_ביטוח" : "דוח_ביטוח";
      const fileName = `${prefix}_${customer?.name || "לקוח"}_${dateLabel}.pdf`;
      pdf.save(fileName);

      document.body.removeChild(container);
      toast({ title: "PDF הורד", description: "הדו״ח הורד בהצלחה" });
    } catch (err: any) {
      console.error("Insurance PDF error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={generatePdf} disabled={generating} variant="outline" className="gap-2">
      {generating ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> מפיק PDF...</>
      ) : (
        <><FileDown className="w-4 h-4" /> הפק דו״ח ביטוח</>
      )}
    </Button>
  );
}

function buildInsuranceHtml(data: {
  title: string;
  isQuote: boolean;
  reportMode: string;
  eventDescription: string;
  damageType: string;
  isEmergency: boolean;
  technicalDetails: string;
  costSummary: CostItem[];
  professionalStatement: string;
  customer: any;
  serviceCall: any;
  beforePhotos: any[];
  afterPhotos: any[];
  otherPhotos: any[];
  logoUrl: string | null;
  dateStr: string;
  timeStr: string;
}) {
  const {
    title, isQuote, eventDescription, damageType, isEmergency,
    technicalDetails, costSummary, professionalStatement,
    customer, serviceCall, beforePhotos, afterPhotos, otherPhotos,
    logoUrl, dateStr, timeStr,
  } = data;

  const section = (text: string) =>
    `<h2 style="font-size:15px;font-weight:700;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #1a56db;color:#1a56db;">${text}</h2>`;

  const field = (label: string, value: string | null | undefined) =>
    value ? `<p style="font-size:13px;margin:4px 0;"><strong>${label}:</strong> ${escapeHtml(value)}</p>` : "";

  let html = buildPdfHeader({ title, subtitle: `${dateStr} ${timeStr}`, logoUrl });

  // Part 1: Insured & property details
  html += section("חלק א׳ — פרטי המבוטח והנכס");
  html += `<div style="background:#f8f9fa;padding:14px;border-radius:6px;margin-bottom:12px;">`;
  html += field("שם המבוטח", customer?.name);
  html += field("טלפון", customer?.phone);
  html += field("כתובת הנכס", [customer?.city, customer?.address].filter(Boolean).join(", "));
  html += field("תאריך ביקור", serviceCall?.scheduled_date
    ? new Date(serviceCall.scheduled_date).toLocaleDateString("he-IL")
    : dateStr);
  html += `</div>`;

  // Part 2: Findings
  html += section("חלק ב׳ — תיאור הממצאים והגורם לנזק");
  html += field("מהות הנזק", damageTypeLabels[damageType] || damageType);
  if (isEmergency) {
    html += `<p style="font-size:13px;margin:4px 0;color:#dc2626;font-weight:600;">⚠️ עבודת חירום למניעת נזק תוצאתי</p>`;
  }
  if (eventDescription) {
    html += `<div style="margin:8px 0;font-size:13px;white-space:pre-wrap;">${escapeHtmlWithBreaks(eventDescription)}</div>`;
  }

  // Part 3: Work performed
  html += section(isQuote ? "חלק ג׳ — פירוט העבודות המוצעות" : "חלק ג׳ — פירוט העבודות שבוצעו בפועל");
  if (technicalDetails) {
    html += `<div style="margin:8px 0;font-size:13px;white-space:pre-wrap;">${escapeHtmlWithBreaks(technicalDetails)}</div>`;
  }

  // Cost table
  if (costSummary.length > 0) {
    const total = costSummary.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalVat = total * 1.18;
    html += `<table style="width:100%;font-size:12px;border-collapse:collapse;margin:12px 0;">`;
    html += `<thead><tr style="background:#f0f4ff;"><th style="padding:8px;text-align:right;border:1px solid #e0e0e0;">תיאור</th><th style="padding:8px;text-align:center;border:1px solid #e0e0e0;width:120px;">סכום (₪)</th></tr></thead>`;
    html += `<tbody>`;
    for (const item of costSummary) {
      html += `<tr><td style="padding:6px 8px;border:1px solid #e0e0e0;">${escapeHtml(item.description)}</td><td style="padding:6px 8px;text-align:center;border:1px solid #e0e0e0;">₪${Number(item.amount).toLocaleString()}</td></tr>`;
    }
    html += `<tr style="background:#f8f9fa;font-weight:600;"><td style="padding:8px;border:1px solid #e0e0e0;">סה״כ לפני מע״מ</td><td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">₪${total.toLocaleString()}</td></tr>`;
    html += `<tr style="background:#e8f0fe;font-weight:700;"><td style="padding:8px;border:1px solid #e0e0e0;">סה״כ כולל מע״מ (18%)</td><td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">₪${totalVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td></tr>`;
    html += `</tbody></table>`;
  }

  // Part 4: Photos
  const allPhotos = [...beforePhotos, ...afterPhotos, ...otherPhotos];
  if (allPhotos.length > 0) {
    html += section("חלק ד׳ — נספח צילומים");

    if (beforePhotos.length > 0) {
      html += `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;">תמונות לפני/בזמן הנזק:</p>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">`;
      for (const p of beforePhotos) {
        html += `<img src="${p.url}" style="width:180px;height:135px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" crossorigin="anonymous" />`;
      }
      html += `</div>`;
    }

    if (afterPhotos.length > 0) {
      html += `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;">תמונות לאחר התיקון:</p>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">`;
      for (const p of afterPhotos) {
        html += `<img src="${p.url}" style="width:180px;height:135px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" crossorigin="anonymous" />`;
      }
      html += `</div>`;
    }

    if (otherPhotos.length > 0) {
      html += `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;">תמונות נוספות:</p>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">`;
      for (const p of otherPhotos) {
        html += `<img src="${p.url}" style="width:180px;height:135px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" crossorigin="anonymous" />`;
      }
      html += `</div>`;
    }
  }

  // Part 5: Professional statement & signature
  html += section("חלק ה׳ — הצהרת איש מקצוע וחתימה");
  if (professionalStatement) {
    html += `<div style="margin:8px 0;font-size:13px;white-space:pre-wrap;">${escapeHtmlWithBreaks(professionalStatement)}</div>`;
  } else {
    html += `<p style="font-size:13px;color:#666;">אני, הח״מ, מצהיר/ה כי ביצעתי בדיקה מקצועית וממצאי מפורטים לעיל.</p>`;
  }

  html += `<div style="margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;">`;
  html += `<div>`;
  html += `<p style="font-size:13px;font-weight:600;margin:0;">${BUSINESS_INFO.name}</p>`;
  html += `<p style="font-size:12px;color:#555;margin:2px 0;">${BUSINESS_INFO.subtitle}</p>`;
  html += `<p style="font-size:12px;color:#555;margin:2px 0;">טלפון: ${BUSINESS_INFO.phone}</p>`;
  html += `<p style="font-size:12px;color:#555;margin:2px 0;">ח.פ: ${BUSINESS_INFO.companyNumber}</p>`;
  html += `</div>`;
  html += `<div style="text-align:center;">`;
  html += `<div style="border-bottom:2px solid #333;width:200px;margin-bottom:4px;">&nbsp;</div>`;
  html += `<p style="font-size:11px;color:#888;margin:0;">חתימה</p>`;
  html += `</div>`;
  html += `</div>`;

  html += buildPdfFooter(dateStr, timeStr);

  return html;
}
