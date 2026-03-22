import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wrench, User, Phone, MapPin, FileText, Check, Pen, RotateCcw, AlertCircle,
} from "lucide-react";
import { useLogo } from "@/hooks/useLogo";
import { BUSINESS_INFO } from "@/lib/pdf-utils";
import { LEGAL_SECTIONS } from "@/lib/legal-constants";

const quoteStatusLabels: Record<string, string> = {
  draft: "טיוטה", sent: "נשלחה", approved: "אושרה", rejected: "נדחתה",
};

const PublicQuote = () => {
  const { token } = useParams();
  const { logoUrl } = useLogo();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [serviceCall, setServiceCall] = useState<any>(null);
  const [accessMode, setAccessMode] = useState<string>("sign");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signature state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerId, setSignerId] = useState("");
  const [idTouched, setIdTouched] = useState(false);

  const isIdValid = /^\d{9}$/.test(signerId);
  const showIdError = idTouched && !isIdValid;
  const canSign = hasSignature && signerName.trim().length > 0 && isIdValid;

  useEffect(() => {
    if (!token) return;
    loadQuote();
  }, [token]);

  const loadQuote = async () => {
    try {
      const response = await supabase.functions.invoke("get-public-quote", {
        body: { share_token: token },
      });

      if (response.error) throw response.error;
      const data = response.data;

      if (data.error) {
        if (data.error === "Token revoked") setError("קישור השיתוף בוטל");
        else if (data.error === "Token expired") setError("קישור השיתוף פג תוקף");
        else if (data.error === "Invalid token") setError("הקישור אינו תקף");
        else setError("לא ניתן לטעון את ההצעה");
        return;
      }

      setQuote(data.quote);
      setItems(data.items || []);
      setCustomer(data.customer);
      setServiceCall(data.service_call);
      setAccessMode(data.access_mode || "sign");
    } catch (err: any) {
      console.error("Public quote load error:", err);
      setError("לא ניתן לטעון את ההצעה");
    } finally {
      setLoading(false);
    }
  };

  // Signature canvas methods
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || initialized) return;
    canvasRef.current = canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    setInitialized(true);
  }, [initialized]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
  };

  const saveSignature = async () => {
    if (!canvasRef.current || !canSign || !token) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate signature image");

      const formData = new FormData();
      formData.append("share_token", token);
      formData.append("quote_id", quote.id);
      formData.append("signature", blob, "signature.png");
      formData.append("signed_by", signerName.trim());
      formData.append("signer_id_number", signerId.trim());

      const { data, error: invokeErr } = await supabase.functions.invoke("sign-public-quote", {
        body: formData,
      });

      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);

      // Signature successful — update local state
      setQuote((prev: any) => ({
        ...prev,
        signed_at: data.signed_at,
        signed_by: signerName.trim(),
        signer_id_number: signerId.trim(),
        signature_path: "signed",
        status: "approved",
      }));

      // TODO: In a future iteration, generate PDF client-side and upload via save-signed-pdf
    } catch (err: any) {
      console.error("Signature save error:", err);
      alert("שגיאה בשמירת החתימה: " + (err.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <p className="text-muted-foreground">טוען הצעת מחיר...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-bold mb-2">שגיאה</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate totals
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unit_price), 0
  );
  const discountPercent = Number(quote?.discount_percent) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  const isSigned = !!quote?.signature_path;
  const showSignature = accessMode === "sign" && !isSigned;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <header className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-14 max-w-[160px] rounded-xl object-contain bg-primary-foreground/10 p-1" />
            ) : (
              <div className="w-12 h-12 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">הצעת מחיר #{quote?.quote_number}</h1>
              <p className="text-sm opacity-80">{BUSINESS_INFO.name} — {BUSINESS_INFO.subtitle}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 pb-16">
        {/* Customer details */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> פרטי לקוח</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>שם:</strong> {customer?.name}</p>
            {customer?.phone && <p className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.phone}</p>}
            {customer?.address && <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {customer.city} {customer.address}</p>}
          </CardContent>
        </Card>

        {/* Quote title */}
        {quote?.title && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{quote.title}</span>
                <Badge variant="secondary">{quoteStatusLabels[quote.status] || quote.status}</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        {/* Scope of Work */}
        {quote?.scope_of_work && <ScopeOfWorkCard scope={quote.scope_of_work} />}

        {/* Line items */}
        {items.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">פירוט סעיפים</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-right p-2">פריט</th>
                      <th className="text-center p-2">כמות</th>
                      <th className="text-center p-2">מחיר יח׳</th>
                      <th className="text-left p-2">סה״כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, i: number) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{item.description}</td>
                        <td className="text-center p-2">{item.quantity}</td>
                        <td className="text-center p-2">₪{Number(item.unit_price).toFixed(2)}</td>
                        <td className="text-left p-2">₪{(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>סה״כ ביניים</span><span>₪{subtotal.toFixed(2)}</span></div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>הנחה ({discountPercent}%)</span><span>-₪{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>סה״כ לתשלום</span><span>₪{total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Valid until & notes */}
        {(quote?.valid_until || quote?.notes) && (
          <Card>
            <CardContent className="p-4 text-sm space-y-1">
              {quote.valid_until && <p><strong>בתוקף עד:</strong> {new Date(quote.valid_until).toLocaleDateString("he-IL")}</p>}
              {quote.notes && <p className="whitespace-pre-wrap"><strong>הערות:</strong> {quote.notes}</p>}
            </CardContent>
          </Card>
        )}

        {/* Already signed */}
        {isSigned && (
          <Card className="border-success/30">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-success font-medium">
                <Check className="w-5 h-5" /> הצעת המחיר נחתמה ואושרה
              </div>
              {quote.signature_url && <img src={quote.signature_url} alt="חתימה" className="max-w-xs border rounded-lg bg-white" />}
              {quote.signed_by && <p className="text-sm"><strong>שם:</strong> {quote.signed_by}</p>}
              {quote.signer_id_number && <p className="text-sm"><strong>ת.ז.:</strong> {quote.signer_id_number}</p>}
              {quote.signed_at && <p className="text-sm text-muted-foreground">נחתם: {new Date(quote.signed_at).toLocaleString("he-IL")}</p>}
            </CardContent>
          </Card>
        )}

        {/* Legal annex + Signature (only for sign mode and unsigned) */}
        {showSignature && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Pen className="w-4 h-4" />
                אישור והחתימה על הצעת מחיר
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Legal annex */}
              <div className="bg-muted/60 border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground text-center border-b border-border pb-2">
                  נספח תנאים, הגבלת אחריות והצהרת ביצוע — {BUSINESS_INFO.name}
                </h3>
                {LEGAL_SECTIONS.map((section, i) => (
                  <div key={i}>
                    <p className="text-xs font-bold text-foreground mb-0.5">{section.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{section.text}</p>
                    {section.bullets && (
                      <ul className="text-xs leading-relaxed text-muted-foreground list-disc pr-4 mt-1 space-y-0.5">
                        {section.bullets.map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Signer name */}
              <div className="space-y-2">
                <Label className="text-sm">
                  שם מלא <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="הזן שם מלא..."
                  className="max-w-xs"
                  required
                />
              </div>

              {/* Signer ID */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  תעודת זהות (9 ספרות) <span className="text-destructive">*</span>
                  {showIdError && <AlertCircle className="w-4 h-4 text-destructive animate-pulse" />}
                </Label>
                <Input
                  value={signerId}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setSignerId(v);
                    if (!idTouched) setIdTouched(true);
                  }}
                  onBlur={() => setIdTouched(true)}
                  placeholder="000000000"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={9}
                  className={`max-w-xs ${showIdError ? "border-destructive ring-2 ring-destructive/30 animate-pulse" : ""}`}
                  required
                />
                {showIdError && (
                  <div className="flex items-center gap-1.5 text-destructive text-xs font-medium animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>יש להזין תעודת זהות בעלת 9 ספרות בדיוק</span>
                  </div>
                )}
              </div>

              {/* Signature canvas */}
              <div>
                <Label className="text-sm mb-2 block">חתימה <span className="text-destructive">*</span></Label>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={initCanvas}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: 150 }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasSignature || saving} className="gap-1">
                  <RotateCcw className="w-3.5 h-3.5" /> נקה
                </Button>
                <Button size="sm" onClick={saveSignature} disabled={!canSign || saving} className="gap-1">
                  <Check className="w-3.5 h-3.5" /> {saving ? "שומר..." : "חתום ואשר"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* View-only mode message */}
        {accessMode === "view" && !isSigned && (
          <Card>
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              הצעת מחיר לצפייה בלבד
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>{BUSINESS_INFO.name} | {BUSINESS_INFO.subtitle}</p>
        <p className="mt-1">טלפון: {BUSINESS_INFO.phone}</p>
      </footer>
    </div>
  );
};

// Scope of Work display card
const ScopeOfWorkCard = ({ scope }: { scope: any }) => {
  const sections: { label: string; value: string }[] = [];
  if (scope.project_overview) sections.push({ label: "סקירת הפרויקט", value: scope.project_overview });
  if (scope.demolition) sections.push({ label: "פירוק והכנה", value: scope.demolition });
  if (scope.plumbing) sections.push({ label: "התקנת אינסטלציה", value: scope.plumbing });
  if (scope.drying_included) {
    sections.push({ label: "ייבוש תת-רצפתי", value: `כלול${scope.drying_duration_days ? ` — ${scope.drying_duration_days} ימים` : ""}` });
  }
  if (scope.restoration_included && scope.restoration_details) {
    sections.push({ label: "שיקום מבנה", value: scope.restoration_details });
  }
  if (scope.tiling_included) {
    const method = scope.tiling_pricing_method === "sqm" ? 'למ"ר' : scope.tiling_pricing_method === "daily" ? "ליום" : "";
    const price = scope.tiling_price ? `₪${scope.tiling_price} ${method}` : "כלול";
    sections.push({ label: "ריצוף", value: price });
  }
  if (scope.materials_note) sections.push({ label: "חומרים", value: scope.materials_note });
  if (scope.workforce_crew_size || scope.workforce_duration_days) {
    const parts = [];
    if (scope.workforce_crew_size) parts.push(`${scope.workforce_crew_size} עובדים`);
    if (scope.workforce_duration_days) parts.push(`${scope.workforce_duration_days} ימים`);
    sections.push({ label: "כוח אדם", value: parts.join(" | ") });
  }
  if (scope.equipment_note) sections.push({ label: "ציוד", value: scope.equipment_note });
  if (scope.warranty_note) sections.push({ label: "אחריות", value: scope.warranty_note });

  if (sections.length === 0) return null;

  return (
    <Card className="bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" /> תכולת עבודה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.map((s, i) => (
          <div key={i}>
            <p className="text-xs font-semibold text-muted-foreground mb-0.5">{s.label}</p>
            <p className="text-sm whitespace-pre-wrap">{s.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PublicQuote;
