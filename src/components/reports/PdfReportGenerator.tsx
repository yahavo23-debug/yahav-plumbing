import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import {
  FileDown,
  Loader2,
  Share2,
  Copy,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  buildPdfHeader,
  buildPdfFooter,
  renderCanvasToPdf,
  escapeHtml,
  BUSINESS_INFO,
} from "@/lib/pdf-utils";
import { LEGAL_SECTIONS, buildLegalAnnexHtml } from "@/lib/legal-constants";

export interface PdfReportGeneratorHandle {
  generate: () => Promise<void>;
}

interface PdfReportGeneratorProps {
  report: any;
  serviceCall: any;
  customer: any;
  photos: any[];
  onPdfReady?: (url: string) => void;
}

import { getJobTypeLabel } from "@/lib/constants";

const statusLabels: Record<string, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  completed: "הושלם",
  cancelled: "בוטל",
};

// LEGAL_SECTIONS imported from @/lib/legal-constants

export const PdfReportGenerator = forwardRef<PdfReportGeneratorHandle, PdfReportGeneratorProps>(
function PdfReportGenerator({
  report,
  serviceCall,
  customer,
  photos,
  onPdfReady,
}: PdfReportGeneratorProps, ref) {
  const { logoUrl } = useLogo();
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  useImperativeHandle(ref, () => ({ generate: generatePdf }));

  useEffect(() => {
    if (report?.pdf_path) loadExistingPdf();
  }, [report?.pdf_path]);

  const loadExistingPdf = async () => {
    if (!report?.pdf_path) return;
    const { data } = await supabase.storage
      .from("reports-pdf")
      .createSignedUrl(report.pdf_path, 3600);
    if (data) setPdfUrl(data.signedUrl);
  };

  const generatePdf = async () => {
    setGenerating(true);
    try {
      // Get signed URLs for photos (max 12)
      const photoUrls = await Promise.all(
        photos.slice(0, 12).map(async (p: any) => {
          const { data } = await supabase.storage
            .from("photos")
            .createSignedUrl(p.storage_path, 600);
          return { ...p, url: data?.signedUrl };
        })
      );

      // Load quotes
      const { data: quotes } = await supabase
        .from("quotes")
        .select("*")
        .eq("service_call_id", serviceCall.id)
        .order("created_at", { ascending: false });

      // Load quote items for each quote
      const quotesWithItems = await Promise.all(
        (quotes || []).map(async (q: any) => {
          const { data: items } = await supabase
            .from("quote_items")
            .select("*")
            .eq("quote_id", q.id)
            .order("sort_order");
          return { ...q, items: items || [] };
        })
      );

      // Get signature URL - prefer report signature, fallback to service call signature
      let signatureUrl: string | null = null;
      const sigPath = report.signature_path || serviceCall.customer_signature_path;
      if (sigPath) {
        const { data } = await supabase.storage
          .from("signatures")
          .createSignedUrl(sigPath, 600);
        signatureUrl = data?.signedUrl || null;
      }

      // Get signature date
      const signatureDateValue = report.signature_date || serviceCall.customer_signature_date;

      // Create hidden container
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-9999px;top:0;width:794px;background:white;padding:40px;direction:rtl;font-family:'Heebo',sans-serif;color:#1a1a1a;line-height:1.6;";
      document.body.appendChild(container);

      const now = new Date();
      container.innerHTML = buildReportHtml({
        report,
        serviceCall,
        customer,
        photoUrls,
        quotes: quotesWithItems,
        logoUrl,
        signatureUrl,
        signatureDate: signatureDateValue,
        dateStr: now.toLocaleDateString("he-IL"),
        timeStr: now.toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });

      // Wait for images
      const images = container.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            })
        )
      );
      await new Promise((r) => setTimeout(r, 300));

      const canvasOptions = {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      };

      const annexElement = container.querySelector(
        "[data-pdf-annex='true']"
      ) as HTMLElement | null;

      if (annexElement) {
        annexElement.style.display = "none";
      }

      const mainCanvas = await html2canvas(container, canvasOptions);

      if (annexElement) {
        annexElement.style.display = "";
      }

      // Generate PDF
      const pdf = new jsPDF("p", "mm", "a4");
      renderCanvasToPdf(mainCanvas, pdf);

      if (annexElement) {
        const annexCanvas = await html2canvas(annexElement, canvasOptions);
        pdf.addPage();
        renderSinglePageCanvasToPdf(annexCanvas, pdf);
      }

      // Download directly to device
      const now2 = new Date();
      const dateLabel = now2.toLocaleDateString("he-IL").replace(/\//g, "-");
      const fileName = `דוח_עבודה_${customer?.name || "לקוח"}_${dateLabel}.pdf`;
      pdf.save(fileName);

      // Also upload to storage for sharing
      const pdfBlob = pdf.output("blob");
      const path = `${serviceCall.id}/${report.id}.pdf`;

      await supabase.storage.from("reports-pdf").remove([path]);
      const { error: uploadError } = await supabase.storage
        .from("reports-pdf")
        .upload(path, pdfBlob, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      await supabase
        .from("reports")
        .update({ pdf_path: path } as any)
        .eq("id", report.id);

      const { data: pdfSigned } = await supabase.storage
        .from("reports-pdf")
        .createSignedUrl(path, 3600);
      if (pdfSigned) {
        setPdfUrl(pdfSigned.signedUrl);
        onPdfReady?.(pdfSigned.signedUrl);
      }

      document.body.removeChild(container);
      toast({ title: "✅ PDF נשמר", description: "הדוח נשמר ומוכן לשליחה" });
    } catch (err: any) {
      console.error("PDF generation error:", err);
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!pdfUrl) return;
    await navigator.clipboard.writeText(pdfUrl);
    toast({ title: "הועתק!", description: "קישור ה-PDF הועתק ללוח" });
  };

  return (
    <div className="space-y-3">
      {/* PDF status card */}
      {pdfUrl ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
          <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center shrink-0">
            <FileDown className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">PDF מוכן</p>
            <p className="text-xs text-green-600 dark:text-green-400">ניתן לצפות ולשלוח</p>
          </div>
          <div className="flex gap-1.5">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> צפה
            </a>
            <Button variant="outline" size="sm" onClick={() => setShareDialogOpen(true)} className="h-8 gap-1.5 text-xs">
              <Share2 className="w-3.5 h-3.5" /> שתף
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border bg-muted/30">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center shrink-0">
            <FileDown className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">PDF לא נוצר עדיין</p>
            <p className="text-xs text-muted-foreground">לחץ על "שמור ויצור PDF" כדי לשמור</p>
          </div>
          <Button
            onClick={generatePdf}
            disabled={generating}
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {generating ? "יוצר..." : "צור PDF"}
          </Button>
        </div>
      )}

      {/* Regenerate button when PDF exists */}
      {pdfUrl && (
        <Button
          onClick={generatePdf}
          disabled={generating}
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground gap-1.5 w-full"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
          {generating ? "יוצר מחדש..." : "עדכן PDF"}
        </Button>
      )}

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שיתוף PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              קישור זה תקף לשעה אחת. לאחר מכן ניתן לעדכן PDF כדי לקבל קישור חדש.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={pdfUrl || ""}
                className="flex-1 text-sm bg-muted rounded-md px-3 py-2 border border-input"
                dir="ltr"
              />
              <Button variant="outline" onClick={handleCopyUrl}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href={pdfUrl || ""} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" /> פתח PDF בטאב חדש
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

function renderSinglePageCanvasToPdf(canvas: HTMLCanvasElement, pdf: jsPDF) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  let renderWidth = maxWidth;
  let renderHeight = (canvas.height * renderWidth) / canvas.width;

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = (canvas.width * renderHeight) / canvas.height;
  }

  const x = (pageWidth - renderWidth) / 2;
  const imgData = canvas.toDataURL("image/png");

  pdf.addImage(imgData, "PNG", x, margin, renderWidth, renderHeight, undefined, "FAST");
}

function buildReportHtml(data: {
  report: any;
  serviceCall: any;
  customer: any;
  photoUrls: any[];
  quotes: any[];
  logoUrl: string | null;
  signatureUrl: string | null;
  signatureDate: string | null;
  dateStr: string;
  timeStr: string;
}) {
  const {
    report,
    serviceCall: sc,
    customer,
    photoUrls,
    quotes,
    logoUrl,
    signatureUrl,
    signatureDate,
    dateStr,
    timeStr,
  } = data;

  const sectionTitle = (text: string) =>
    `<h2 style="font-size:15px;font-weight:700;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #e0e0e0;">${text}</h2>`;
  const field = (label: string, value: string | null | undefined) =>
    value
      ? `<p style="font-size:13px;margin:4px 0;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`
      : "";

  let html = buildPdfHeader({
    title: "דוח עבודה",
    subtitle: `קריאה #${sc.call_number} | ${dateStr} ${timeStr}`,
    logoUrl,
  });

  html += `
    <div style="background:#f8f9fa;padding:14px;border-radius:6px;margin-bottom:16px;">
      <h2 style="font-size:14px;font-weight:700;margin:0 0 8px;">פרטי לקוח</h2>
      ${field("שם", customer?.name)}
      ${field("טלפון", customer?.phone)}
      ${field("כתובת", [customer?.city, customer?.address].filter(Boolean).join(" "))}
    </div>

    ${sectionTitle("פרטי שירות")}
    ${field("סוג", getJobTypeLabel(sc.job_type))}
    ${field("סטטוס", statusLabels[sc.status] || sc.status)}
    ${field("תיאור", sc.description)}
    ${field("הערות", sc.notes)}
  `;

  // Diagnosis
  if (
    sc.detection_method ||
    sc.findings ||
    sc.cause_assessment ||
    sc.recommendations ||
    sc.leak_location
  ) {
    html += sectionTitle("אבחון מקצועי");
    html += field("שיטת איתור", sc.detection_method);
    html += field("מצב לחץ מים", sc.water_pressure_status);
    html += field("מיקום הנזילה", sc.leak_location);
    html += field("ממצאים", sc.findings);
    html += field("הערכת סיבה", sc.cause_assessment);
    html += field("המלצה", sc.recommendations);
    html += field("מגבלות בדיקה", sc.test_limitations);
    html += field("אזורים שלא נבדקו", sc.areas_not_inspected);

    if (sc.diagnosis_confidence) {
      const confLabels: Record<string, string> = {
        high: "גבוהה",
        medium: "בינונית",
        suspicion: "חשד בלבד",
      };
      html += field(
        "רמת ודאות",
        confLabels[sc.diagnosis_confidence] || sc.diagnosis_confidence
      );
    }
    if (sc.urgency_level) {
      const urgLabels: Record<string, string> = {
        immediate: "תיקון מיידי",
        soon: "מומלץ בקרוב",
        monitor: "ניטור",
      };
      html += field(
        "רמת דחיפות",
        urgLabels[sc.urgency_level] || sc.urgency_level
      );
    }
  }

  // Report findings/recommendations
  if (report.findings || report.recommendations) {
    html += sectionTitle("ממצאי הדוח");
    html += field("ממצאים", report.findings);
    html += field("המלצות", report.recommendations);
  }

  // Photos
  const validPhotos = photoUrls.filter((p) => p.url);
  if (validPhotos.length > 0) {
    html += sectionTitle(`תמונות (${validPhotos.length})`);
    html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`;
    for (const photo of validPhotos) {
      html += `<img src="${photo.url}" style="width:160px;height:120px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" crossorigin="anonymous" />`;
    }
    html += `</div>`;
  }

  // Quotes
  if (quotes.length > 0) {
    html += sectionTitle("הצעות מחיר");
    for (const quote of quotes) {
      const items = (quote.items || []) as any[];
      const subtotal = items.reduce(
        (s: number, i: any) =>
          s + Number(i.quantity) * Number(i.unit_price),
        0
      );
      const discount = Number(quote.discount_percent) || 0;
      const afterDiscount = subtotal * (1 - discount / 100);
      const total = afterDiscount;

      html += `<div style="margin-bottom:12px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">`;
      html += `<div style="background:#f0f4ff;padding:8px 12px;font-weight:600;font-size:13px;">${escapeHtml(quote.title) || "הצעת מחיר"}</div>`;
      html += `<table style="width:100%;font-size:12px;border-collapse:collapse;">`;
      html += `<thead><tr style="background:#f8f9fa;"><th style="padding:6px;text-align:right;border-bottom:1px solid #e0e0e0;">תיאור</th><th style="padding:6px;text-align:center;border-bottom:1px solid #e0e0e0;">כמות</th><th style="padding:6px;text-align:center;border-bottom:1px solid #e0e0e0;">מחיר</th><th style="padding:6px;text-align:center;border-bottom:1px solid #e0e0e0;">סה"כ</th></tr></thead>`;
      html += `<tbody>`;
      for (const item of items) {
        html += `<tr><td style="padding:6px;border-bottom:1px solid #f0f0f0;">${escapeHtml(item.description)}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #f0f0f0;">${item.quantity}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #f0f0f0;">₪${Number(item.unit_price).toFixed(2)}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #f0f0f0;">₪${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td></tr>`;
      }
      html += `</tbody></table>`;
      html += `<div style="padding:8px 12px;text-align:left;font-weight:700;font-size:14px;border-top:1px solid #e0e0e0;">סה"כ: ₪${total.toFixed(2)}</div>`;
      html += `</div>`;
    }
  }

  html += `<div data-pdf-annex="true" style="padding-top:8px;">`;
  html += `<h2 style="font-size:13px;font-weight:700;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e0e0e0;">נספח תנאים, הגבלת אחריות והצהרת ביצוע</h2>`;
  html += `<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:10px;">`;
  for (const section of LEGAL_SECTIONS) {
    html += `<p style="font-size:10px;font-weight:700;color:#2c3e50;margin:5px 0 2px;">${escapeHtml(section.title)}</p>`;
    html += `<p style="font-size:9px;line-height:1.25;margin:0 0 3px;color:#444;">${escapeHtml(section.text)}</p>`;
    if (section.bullets) {
      html += `<ul style="font-size:9px;line-height:1.25;margin:2px 0 5px;padding-right:16px;color:#444;">`;
      for (const b of section.bullets) {
        html += `<li style="margin-bottom:2px;">${escapeHtml(b)}</li>`;
      }
      html += `</ul>`;
    }
  }
  html += `</div>`;

  if (signatureUrl) {
    html += `<h2 style="font-size:13px;font-weight:700;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e0e0e0;">חתימת לקוח</h2>`;
    html += `<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;background:#fafafa;">`;
    html += `<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">`;
    html += `<div>`;
    html += `<p style="font-size:10px;color:#888;margin:0 0 4px;">חתימה:</p>`;
    html += `<img src="${signatureUrl}" style="max-width:220px;max-height:72px;border-bottom:2px solid #333;" crossorigin="anonymous" />`;
    html += `</div>`;
    html += `<div style="font-size:11px;line-height:1.55;">`;
    if (report.signed_by) {
      html += `<p style="margin:0;"><strong>שם החותם:</strong> ${escapeHtml(report.signed_by)}</p>`;
    }
    if (signatureDate) {
      html += `<p style="margin:0;"><strong>תאריך ושעה:</strong> ${new Date(signatureDate).toLocaleString("he-IL")}</p>`;
    }
    if (report.ip_address) {
      html += `<p style="margin:0;"><strong>כתובת IP:</strong> ${escapeHtml(report.ip_address)}</p>`;
    }
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
  }

  html += buildPdfFooter(dateStr, timeStr);
  html += `</div>`;

  return html;
}
