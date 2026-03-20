import { useState, useEffect } from "react";
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

interface PdfReportGeneratorProps {
  report: any;
  serviceCall: any;
  customer: any;
  photos: any[];
}

import { getJobTypeLabel } from "@/lib/constants";

const statusLabels: Record<string, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  completed: "הושלם",
  cancelled: "בוטל",
};

const LEGAL_SECTIONS_PDF = [
  { title: "1. הגדרת העבודה", text: "העבודה בוצעה בהתאם למפורט בדוח העבודה בלבד. כל עבודה, רכיב או תיקון שלא צוינו במפורש – אינם כלולים באחריות." },
  { title: "2. היקף האחריות", text: "האחריות מוגבלת אך ורק למקטע שטופל/הוחלף בפועל ומתועד בדוח זה. המערכת נבדקה במעמד סיום העבודה, בנוכחות הלקוח, ונמצאה תקינה. לא תחול אחריות על כלל מערכת האינסטלציה בנכס או על תקלות עתידיות במקטעים סמוכים." },
  { title: "3. תשתית ישנה (צנרת פריכה)", text: "לא תחול אחריות לנזקים הנובעים ממצב תשתית קיימת ומתבלה, לרבות צנרת ישנה/פריכה, עקב בלאי טבעי או זעזוע סביר והכרחי של המערכת במהלך העבודה." },
  {
    title: "4. שירותי איתור נזילות וייעוץ",
    text: "ככל שבוצע איתור נזילות במסגרת העבודה:",
    bullets: [
      "הערכה בלבד: השירות (לרבות ציוד טרמי/אקוסטי/גז) מהווה הערכה מקצועית בלבד בהתאם לממצאים ולמגבלות הציוד בשטח, ואינו מהווה התחייבות לזיהוי ודאי של מקור הנזילה.",
      "אישור ועלויות חשיפה: כל פתיחה/חציבה תבוצע רק לאחר אישור הלקוח למיקום. לא תחול אחריות לעלויות חשיפה שבוצעו בהתאם להערכת האיתור ובאמצעים סבירים, גם אם התברר בדיעבד כי המקור שונה.",
      "ריבוי מוקדים: ייתכן קיומם של מספר מוקדי נזילה במקביל, ואיתור מוקד אחד אינו מבטיח היעדר מוקדים נוספים.",
      "שכר טרחה: התשלום הינו עבור עצם ביצוע הבדיקה, הניתוח והפקת הדוח, ואינו מותנה בזיהוי ודאי של המקור או בביצוע התיקון בפועל.",
    ],
  },
  { title: "5. פתיחת סתימות", text: "פתיחת סתימה אינה מקנה אחריות לחזרתה כאשר נגרמה משימוש לא תקין או מכשל מבני בצנרת (לרבות: מגבונים, שומנים, חדירת שורשים, שקיעת קו או שבר)." },
  { title: "6. תיקון נקודתי", text: "ככל שהלקוח בחר בתיקון נקודתי חלף טיפול מקיף שהומלץ – לא תחול אחריות להמשך תקינות המערכת מעבר למקטע שתוקן בפועל." },
  { title: "7. חובת דיווח והקטנת נזק", text: "הלקוח מתחייב לדווח מיידית עם גילוי של כל חשד לתקלה או רטיבות. כל נזק תוצאתי או עקיף (לריהוט, ריצוף, עובש וכו׳) שנגרם עקב השהיית הדיווח ואי-הקטנת הנזק – יחול על הלקוח בלבד." },
  { title: "8. נזקים עקיפים", text: "לא תחול אחריות לנזקים עקיפים (כגון רטיבות, עובש, נזק לריהוט או ירידת ערך) הנובעים ממצב התשתית המקורית או מאי-דיווח מיידי כאמור." },
  { title: "9. עבודות גמר", text: "עבודות סגירה (ריצוף, בטון, טיח) מהוות תיקון פונקציונלי וראשוני בלבד, ואינן כוללות עבודות גמר מקצועיות, רובה או התאמות גוון." },
  { title: "10. אחריות (ככל שניתנה)", text: "האחריות, ככל שניתנה, חלה רק על העבודה שבוצעה בפועל ולתקופה שסוכמה בכתב. בהיעדר ציון מפורש – לא תחול אחריות." },
  { title: "11. תיעוד והתערבות חיצונית", text: "תמונות וסרטונים שצולמו בשטח מהווים חלק בלתי נפרד מהדוח וישמשו כראיה למצב התשתית ולביצוע העבודה. כל התערבות של גורם אחר במקטע שטופל – מבטלת את האחריות לאלתר." },
];

export function PdfReportGenerator({
  report,
  serviceCall,
  customer,
  photos,
}: PdfReportGeneratorProps) {
  const { logoUrl } = useLogo();
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

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
      if (pdfSigned) setPdfUrl(pdfSigned.signedUrl);

      document.body.removeChild(container);
      toast({ title: "PDF הורד", description: "הדוח הורד ונשמר בהצלחה" });
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
    <div className="flex items-center gap-2">
      <Button
        onClick={generatePdf}
        disabled={generating}
        variant="outline"
        className="gap-2"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> מפיק PDF...
          </>
        ) : (
          <>
            <FileDown className="w-4 h-4" /> הפק PDF
          </>
        )}
      </Button>

      {pdfUrl && (
        <>
          <Button variant="outline" size="icon" asChild>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="פתח PDF"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShareDialogOpen(true)}
            title="שתף PDF"
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </>
      )}

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שיתוף PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              קישור זה תקף לשעה אחת. לאחר מכן ניתן להפיק קישור חדש.
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
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

  html += `<div style="page-break-before:always;break-before:page;padding-top:20px;">`;
  html += `<h2 style="font-size:15px;font-weight:700;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #e0e0e0;">נספח תנאים, הגבלת אחריות והצהרת ביצוע</h2>`;
  html += `<div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;background:#fafafa;margin-bottom:16px;">`;
  for (const section of LEGAL_SECTIONS_PDF) {
    html += `<p style="font-size:12px;font-weight:700;color:#2c3e50;margin:10px 0 2px;">${escapeHtml(section.title)}</p>`;
    html += `<p style="font-size:11px;line-height:1.7;margin:0 0 4px;color:#444;">${escapeHtml(section.text)}</p>`;
    if (section.bullets) {
      html += `<ul style="font-size:11px;line-height:1.7;margin:2px 0 8px;padding-right:18px;color:#444;">`;
      for (const b of section.bullets) {
        html += `<li style="margin-bottom:3px;">${escapeHtml(b)}</li>`;
      }
      html += `</ul>`;
    }
  }
  html += `</div>`;

  // Signature block
  if (signatureUrl) {
    html += sectionTitle("חתימת לקוח");
    html += `<div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;background:#fafafa;">`;
    html += `<div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap;">`;
    html += `<div>`;
    html += `<p style="font-size:11px;color:#888;margin:0 0 4px;">חתימה:</p>`;
    html += `<img src="${signatureUrl}" style="max-width:280px;max-height:100px;border-bottom:2px solid #333;" crossorigin="anonymous" />`;
    html += `</div>`;
    html += `<div style="font-size:12px;line-height:1.8;">`;
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

  return html;
}
