// Shared PDF utilities — business info, header/footer builders, page rendering

/**
 * Escapes HTML special characters to prevent XSS/injection in PDF templates.
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Escapes HTML and converts newlines to <br/> tags for multi-line fields.
 */
export function escapeHtmlWithBreaks(text: string | null | undefined): string {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

export const BUSINESS_INFO = {
  name: "יהב אינסטלציה",
  subtitle: "איתור נזילות וצילום קווי ביוב",
  phone: "054-212-1204",
  companyNumber: "209001866", // ח.פ
};

/**
 * Builds the standard PDF header with logo on the right, document title + business info on the left.
 */
export function buildPdfHeader(opts: {
  title: string;
  subtitle?: string;
  logoUrl: string | null;
}) {
  const { title, subtitle, logoUrl } = opts;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a56db;padding-bottom:16px;margin-bottom:20px;">
      <div style="flex:1;">
        <h1 style="font-size:22px;font-weight:800;color:#1a56db;margin:0;">${title}</h1>
        ${subtitle ? `<p style="font-size:13px;color:#666;margin:4px 0 0;">${subtitle}</p>` : ""}
        <p style="font-size:14px;font-weight:700;color:#333;margin:6px 0 0;">${BUSINESS_INFO.name}</p>
        <p style="font-size:12px;color:#555;margin:2px 0 0;">${BUSINESS_INFO.subtitle}</p>
        <p style="font-size:12px;color:#555;margin:2px 0 0;">טלפון: ${BUSINESS_INFO.phone}</p>
        <p style="font-size:12px;color:#555;margin:2px 0 0;">ח.פ: ${BUSINESS_INFO.companyNumber}</p>
      </div>
      ${logoUrl ? `<img src="${logoUrl}" style="max-height:75px;max-width:200px;object-fit:contain;margin-right:12px;" crossorigin="anonymous" />` : ""}
    </div>
  `;
}

/**
 * Builds the standard PDF footer.
 */
export function buildPdfFooter(dateStr: string, timeStr: string) {
  return `
    <div style="margin-top:30px;padding-top:12px;border-top:2px solid #e0e0e0;text-align:center;font-size:11px;color:#999;">
      <p style="margin:0;">${BUSINESS_INFO.name} | ${BUSINESS_INFO.subtitle}</p>
      <p style="margin:2px 0 0;">טלפון: ${BUSINESS_INFO.phone} | ח.פ: ${BUSINESS_INFO.companyNumber}</p>
      <p style="margin:4px 0 0;">דוח זה הופק אוטומטית | ${dateStr} ${timeStr}</p>
    </div>
  `;
}

/**
 * Renders a canvas to multi-page PDF without cutting content mid-line.
 * Uses a slice-per-page approach with overlap margin.
 */
export function renderCanvasToPdf(
  canvas: HTMLCanvasElement,
  pdf: any, // jsPDF instance
  pageWidth = 210,
  pageHeight = 297,
  marginBottom = 10
) {
  const usableHeight = pageHeight - marginBottom;
  const imgWidth = pageWidth;
  const ratio = imgWidth / canvas.width;
  const fullImgHeight = canvas.height * ratio;

  if (fullImgHeight <= pageHeight) {
    // Fits on one page
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      imgWidth,
      fullImgHeight
    );
    return;
  }

  // Multi-page: slice the canvas into page-sized chunks
  const scaledPageHeight = usableHeight / ratio; // height in canvas pixels per page
  let yOffset = 0;
  let pageIndex = 0;

  while (yOffset < canvas.height) {
    const sliceHeight = Math.min(scaledPageHeight, canvas.height - yOffset);

    // Create a temporary canvas for this page slice
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const ctx = pageCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        yOffset,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );
    }

    const sliceImgHeight = sliceHeight * ratio;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      imgWidth,
      sliceImgHeight
    );

    yOffset += sliceHeight;
    pageIndex++;
  }
}
