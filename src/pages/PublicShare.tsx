import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoLightbox } from "@/components/media/PhotoLightbox";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { toast } from "@/hooks/use-toast";
import {
  Wrench, User, Phone, MapPin, Calendar, Image, Film,
  FileText, Play, AlertTriangle, Shield, Eye, CheckCircle, Pen, RotateCcw,
} from "lucide-react";
import { useLogo } from "@/hooks/useLogo";
import { BUSINESS_INFO } from "@/lib/pdf-utils";

const tagLabels: Record<string, string> = {
  before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
};

const shareTypeLabels: Record<string, string> = {
  details: "פרטי קריאה",
  diagnosis: "דוח אבחון",
  media: "תמונות וסרטונים",
  quotes: "הצעות מחיר",
  report: "דוח עבודה",
};

const statusLabels: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", completed: "הושלם", cancelled: "בוטל",
};

const quoteStatusLabels: Record<string, string> = {
  draft: "טיוטה", sent: "נשלחה", approved: "אושרה", rejected: "נדחתה",
};

const confidenceLabels: Record<string, string> = {
  high: "גבוהה", medium: "בינונית", suspicion: "חשד בלבד",
};

const urgencyLabels: Record<string, string> = {
  immediate: "תיקון מיידי", soon: "מומלץ בקרוב", monitor: "ניטור",
};

const urgencyIcons: Record<string, any> = {
  immediate: AlertTriangle, soon: Shield, monitor: Eye,
};

const visibleDamageLabels: Record<string, string> = {
  moisture: "רטיבות", mold: "עובש", peeling_paint: "צבע מתקלף",
  swollen_flooring: "ריצוף פתוח", ceiling_damage: "נזק בתקרה",
};

const PublicShare = () => {
  const { token } = useParams();
  const { logoUrl } = useLogo();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [playingVideo, setPlayingVideo] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    loadShare();
  }, [token]);

  const loadShare = async () => {
    try {
      const response = await supabase.functions.invoke("get-public-share", {
        body: { share_token: token },
      });

      if (response.error) throw response.error;

      const d = response.data;
      if (d.error) {
        if (d.error === "Token revoked") setError("קישור השיתוף בוטל");
        else if (d.error === "Token expired") setError("קישור השיתוף פג תוקף");
        else setError("הקישור אינו תקף");
        return;
      }
      setData(d);
    } catch (err: any) {
      console.error("Public share load error:", err);
      setError("לא ניתן לטעון את המידע");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-bold mb-2">שגיאה</h2>
            <p className="text-muted-foreground">{error || "לא ניתן לטעון"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const shareType = data.share_type;
  const customer = data.customer;
  const sc = data.service_call;

  const lightboxPhotos = (data.photos || []).map((p: any) => ({
    id: p.id, url: p.url, caption: p.caption, tag: p.tag,
  }));

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <header className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-14 max-w-[160px] rounded-xl object-contain bg-primary-foreground/10 p-1" />
            ) : (
              <div className="w-12 h-12 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{shareTypeLabels[shareType]}</h1>
              <p className="text-sm opacity-80">
                {BUSINESS_INFO.name} — קריאה #{sc?.call_number} — {customer?.name}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 pb-16">
        {/* Customer info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> פרטי לקוח
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>שם:</strong> {customer?.name}</p>
            {customer?.phone && (
              <p className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.phone}</p>
            )}
            {customer?.address && (
              <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {customer.city} {customer.address}</p>
            )}
          </CardContent>
        </Card>

        {/* Section-specific content */}
        {shareType === "details" && <DetailsSection data={data.details} />}
        {shareType === "diagnosis" && <DiagnosisSection data={data.diagnosis} />}
        {shareType === "media" && (
          <MediaSection
            photos={data.photos || []}
            videos={data.videos || []}
            onPhotoClick={setLightboxIndex}
            onVideoClick={setPlayingVideo}
          />
        )}
        {shareType === "quotes" && <QuotesSection quotes={data.quotes || []} shareToken={token || ""} onQuoteSigned={loadShare} />}
        {shareType === "report" && (
          <ReportSection
            reports={data.reports || []}
            photos={data.photos || []}
            videos={data.videos || []}
            onPhotoClick={setLightboxIndex}
            onVideoClick={setPlayingVideo}
          />
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>{BUSINESS_INFO.name} | {BUSINESS_INFO.subtitle}</p>
        <p className="mt-1">טלפון: {BUSINESS_INFO.phone}</p>
      </footer>

      {/* Lightbox */}
      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxIndex >= 0}
        onClose={() => setLightboxIndex(-1)}
      />

      {/* Video player */}
      {playingVideo && (
        <VideoPlayer
          url={playingVideo.url}
          title={playingVideo.title || "סרטון"}
          open={!!playingVideo}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  );
};

// ---- Section Components ----

const DetailsSection = ({ data }: { data: any }) => {
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">פרטי הקריאה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.description && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">תיאור התלונה</p>
            <p className="whitespace-pre-wrap">{data.description}</p>
          </div>
        )}
        {data.notes && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">הערות</p>
            <p className="whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}
        {data.scheduled_date && (
          <p className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            תאריך מתוכנן: {new Date(data.scheduled_date).toLocaleDateString("he-IL")}
          </p>
        )}
        {data.completed_date && (
          <p className="flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            הושלם: {new Date(data.completed_date).toLocaleDateString("he-IL")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const DiagnosisSection = ({ data }: { data: any }) => {
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.detection_method && (
        <Card>
          <CardHeader><CardTitle className="text-base">שיטת איתור</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.detection_method.split(",").map((m: string) => (
                <Badge key={m.trim()} variant="secondary">{m.trim()}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(data.water_pressure_status || data.test_limitations) && (
        <Card>
          <CardHeader><CardTitle className="text-base">תנאי בדיקה</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.water_pressure_status && <p><strong>מצב לחץ מים:</strong> {data.water_pressure_status}</p>}
            {data.property_occupied !== null && (
              <p><strong>נכס מאוכלס:</strong> {data.property_occupied ? "כן" : "לא"}</p>
            )}
            {data.main_valve_closed !== null && (
              <p><strong>ברז ראשי סגור:</strong> {data.main_valve_closed ? "כן" : "לא"}</p>
            )}
            {data.test_limitations && <p><strong>מגבלות בדיקה:</strong> {data.test_limitations}</p>}
          </CardContent>
        </Card>
      )}

      {data.findings && (
        <Card>
          <CardHeader><CardTitle className="text-base">ממצאים</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{data.findings}</p></CardContent>
        </Card>
      )}

      {data.leak_location && (
        <Card>
          <CardHeader><CardTitle className="text-base">מיקום נזילה</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{data.leak_location}</p></CardContent>
        </Card>
      )}

      {data.cause_assessment && (
        <Card>
          <CardHeader><CardTitle className="text-base">הערכת סיבה</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{data.cause_assessment}</p></CardContent>
        </Card>
      )}

      {data.visible_damage && data.visible_damage.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">נזקים נראים לעין</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.visible_damage.map((d: string) => (
                <Badge key={d} variant="secondary">
                  {d.startsWith("other:") ? d.replace("other:", "") : (visibleDamageLabels[d] || d)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.diagnosis_confidence && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm"><strong>רמת ודאות:</strong> {confidenceLabels[data.diagnosis_confidence] || data.diagnosis_confidence}</p>
          </CardContent>
        </Card>
      )}

      {data.urgency_level && (
        <Card>
          <CardContent className="p-4">
            {(() => {
              const Icon = urgencyIcons[data.urgency_level] || AlertTriangle;
              return (
                <p className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <strong>דחיפות:</strong> {urgencyLabels[data.urgency_level] || data.urgency_level}
                </p>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {data.recommendations && (
        <Card>
          <CardHeader><CardTitle className="text-base">המלצות</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{data.recommendations}</p></CardContent>
        </Card>
      )}

      {data.areas_not_inspected && (
        <Card>
          <CardHeader><CardTitle className="text-base">אזורים שלא נבדקו</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{data.areas_not_inspected}</p></CardContent>
        </Card>
      )}

      {data.signature_url && (
        <Card>
          <CardHeader><CardTitle className="text-base">חתימת לקוח</CardTitle></CardHeader>
          <CardContent>
            <img src={data.signature_url} alt="חתימת לקוח" className="max-w-xs border rounded-lg" />
            {data.customer_signature_date && (
              <p className="text-sm text-muted-foreground mt-2">
                {new Date(data.customer_signature_date).toLocaleDateString("he-IL")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const MediaSection = ({
  photos, videos, onPhotoClick, onVideoClick,
}: { photos: any[]; videos: any[]; onPhotoClick: (i: number) => void; onVideoClick: (v: any) => void }) => (
  <div className="space-y-6">
    {photos.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="w-4 h-4" /> תמונות ({photos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo: any, i: number) => (
              <div
                key={photo.id}
                className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-muted relative group"
                onClick={() => onPhotoClick(i)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || ""}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {photo.tag && (
                  <Badge className="absolute top-2 right-2 text-xs bg-black/50 text-white border-0">
                    {tagLabels[photo.tag]}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {videos.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="w-4 h-4" /> סרטונים ({videos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {videos.map((video: any) => (
              <button
                key={video.id}
                className="w-full flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-right"
                onClick={() => onVideoClick(video)}
              >
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Play className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{video.title || "סרטון"}</p>
                  {video.tag && <Badge className="text-xs mt-1">{tagLabels[video.tag]}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {photos.length === 0 && videos.length === 0 && (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">אין מדיה לתצוגה</p>
        </CardContent>
      </Card>
    )}
  </div>
);

const QuotePublicSignaturePad = ({ quoteId, shareToken, onSigned }: { quoteId: string; shareToken: string; onSigned: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signerName, setSignerName] = useState("");

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = getCtx();
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
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate signature");

      const formData = new FormData();
      formData.append("share_token", shareToken);
      formData.append("quote_id", quoteId);
      formData.append("signature", blob, "signature.png");
      if (signerName.trim()) {
        formData.append("signed_by", signerName.trim());
      }

      const response = await supabase.functions.invoke("sign-public-quote", {
        body: formData,
      });

      if (response.error) throw response.error;
      const result = response.data;
      if (result.error) throw new Error(result.error);

      toast({ title: "חתימה נשמרה", description: "הצעת המחיר נחתמה בהצלחה" });
      onSigned();
    } catch (err: any) {
      console.error("Quote public signature error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Pen className="w-4 h-4" /> חתימת לקוח
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          אני מאשר/ת את הצעת המחיר ומסכים/ה לתנאים המפורטים בה.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">שם מלא</label>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="הזן שם מלא..."
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasSignature || saving} className="gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> נקה
          </Button>
          <Button size="sm" onClick={saveSignature} disabled={!hasSignature || saving} className="gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> {saving ? "שומר..." : "חתום ואשר"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const scopeSectionLabels: Record<string, { title: string; titleEn: string }> = {
  project_overview: { title: "סקירת הפרויקט", titleEn: "Project Overview" },
  demolition: { title: "פירוק והכנה", titleEn: "Demolition & Preparation" },
  plumbing: { title: "התקנת אינסטלציה", titleEn: "Plumbing Installation" },
  materials_note: { title: "הערכת חומרים", titleEn: "Materials Estimate" },
  equipment_note: { title: "ציוד", titleEn: "Equipment" },
  warranty_note: { title: "אחריות", titleEn: "Warranty" },
};

const PublicScopeOfWork = ({ scope }: { scope: any }) => {
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
    const method = scope.tiling_pricing_method === "sqm" ? "למ\"ר" : scope.tiling_pricing_method === "daily" ? "ליום" : "";
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

const QuotesSection = ({ quotes, shareToken, onQuoteSigned }: { quotes: any[]; shareToken: string; onQuoteSigned: () => void }) => {
  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">אין הצעות מחיר</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {quotes.map((quote: any) => (
        <Card key={quote.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{quote.title || "הצעת מחיר"} {quote.quote_number ? `#${quote.quote_number}` : ""}</span>
              <Badge variant="secondary">{quoteStatusLabels[quote.status] || quote.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quote.items && quote.items.length > 0 && (
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
                    {quote.items.map((item: any) => (
                      <tr key={item.quote_id + item.sort_order} className="border-t border-border">
                        <td className="p-2">{item.description}</td>
                        <td className="text-center p-2">{item.quantity}</td>
                        <td className="text-center p-2">₪{Number(item.unit_price).toFixed(2)}</td>
                        <td className="text-left p-2">₪{(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-border text-sm">
              <span>סה״כ לתשלום</span>
              <span className="font-bold text-lg">₪{Number(quote.total_with_vat).toFixed(2)}</span>
            </div>

            {quote.discount_percent > 0 && (
              <p className="text-sm text-destructive">הנחה: {quote.discount_percent}%</p>
            )}

            {quote.valid_until && (
              <p className="text-sm text-muted-foreground">
                בתוקף עד: {new Date(quote.valid_until).toLocaleDateString("he-IL")}
              </p>
            )}

            {quote.notes && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
            )}

            {/* Scope of Work */}
            {quote.scope_of_work && <PublicScopeOfWork scope={quote.scope_of_work} />}

            {/* Signature section */}
            {quote.signature_url ? (
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">הצעת מחיר נחתמה ואושרה</span>
                  </div>
                  <img src={quote.signature_url} alt="חתימה" className="max-w-xs border rounded-lg bg-white" />
                  {quote.signed_by && (
                    <p className="text-sm mt-2"><strong>שם החותם:</strong> {quote.signed_by}</p>
                  )}
                  {quote.signed_at && (
                    <p className="text-sm text-muted-foreground mt-1">
                      נחתם: {new Date(quote.signed_at).toLocaleString("he-IL")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <QuotePublicSignaturePad quoteId={quote.id} shareToken={shareToken} onSigned={onQuoteSigned} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const ReportSection = ({
  reports, photos, videos, onPhotoClick, onVideoClick,
}: { reports: any[]; photos: any[]; videos: any[]; onPhotoClick: (i: number) => void; onVideoClick: (v: any) => void }) => {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">אין דוחות</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {reports.map((report: any) => (
        <div key={report.id} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{report.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {report.findings && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">ממצאים</p>
                  <p className="whitespace-pre-wrap">{report.findings}</p>
                </div>
              )}
              {report.recommendations && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">המלצות</p>
                  <p className="whitespace-pre-wrap">{report.recommendations}</p>
                </div>
              )}
              {report.quote_summary && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">סיכום הצעת מחיר</p>
                  <p>{report.quote_summary}</p>
                </div>
              )}
              {report.invoice_number && (
                <p><strong>חשבונית:</strong> {report.invoice_number}</p>
              )}
            </CardContent>
          </Card>

          {report.signature_url && (
            <Card>
              <CardHeader><CardTitle className="text-base">חתימה</CardTitle></CardHeader>
              <CardContent>
                <img src={report.signature_url} alt="חתימה" className="max-w-xs border rounded-lg" />
                {report.signature_date && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {new Date(report.signature_date).toLocaleDateString("he-IL")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ))}

      {/* Photos & Videos associated with the report */}
      {(photos.length > 0 || videos.length > 0) && (
        <MediaSection
          photos={photos}
          videos={videos}
          onPhotoClick={onPhotoClick}
          onVideoClick={onVideoClick}
        />
      )}
    </div>
  );
};

export default PublicShare;
