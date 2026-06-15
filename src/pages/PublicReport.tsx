import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoLightbox } from "@/components/media/PhotoLightbox";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { PublicSignaturePad } from "@/components/reports/PublicSignaturePad";
import { Wrench, User, Phone, MapPin, Calendar, Image, Film, FileText, Play, Check } from "lucide-react";
import { useLogo } from "@/hooks/useLogo";
import { BUSINESS_INFO } from "@/lib/pdf-utils";
import { getJobTypeLabel } from "@/lib/constants";

const tagLabels: Record<string, string> = {
  before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
};

const confidenceLabels: Record<string, string> = {
  high: "גבוהה",
  medium: "בינונית",
  suspicion: "חשד בלבד",
};

const urgencyLabels: Record<string, string> = {
  immediate: "תיקון מיידי",
  soon: "מומלץ בקרוב",
  monitor: "ניטור",
};

const visibleDamageLabels: Record<string, string> = {
  moisture: "רטיבות",
  mold: "עובש",
  peeling_paint: "צבע מתקלף",
  swollen_flooring: "ריצוף פתוח",
  ceiling_damage: "נזק בתקרה",
  other: "אחר",
};

const SummaryLine = ({ label, value }: { label: string; value?: string | number | null }) => (
  value ? <p><strong>{label}:</strong> <span className="whitespace-pre-wrap">{value}</span></p> : null
);

const PublicReport = () => {
  const { token } = useParams();
  const { logoUrl } = useLogo();
  const [report, setReport] = useState<any>(null);
  const [serviceCall, setServiceCall] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [playingVideo, setPlayingVideo] = useState<any>(null);
  const [accessMode, setAccessMode] = useState<string>("sign");

  useEffect(() => {
    if (!token) return;
    loadPublicReport();
  }, [token]);

  const loadPublicReport = async () => {
    try {
      // Use edge function directly - it validates the token server-side with service role key
      // No direct DB queries here since anonymous users are blocked by RLS
      const response = await supabase.functions.invoke("get-public-report", {
        body: { share_token: token },
      });

      if (response.error) throw response.error;
      const data = response.data;

      // Handle error responses from the edge function
      if (data.error) {
        if (data.error === "Token revoked") setError("קישור השיתוף בוטל");
        else if (data.error === "Token expired") setError("קישור השיתוף פג תוקף");
        else if (data.error === "Invalid token") setError("הקישור אינו תקף");
        else setError("לא ניתן לטעון את הדוח");
        return;
      }

      setReport(data.report);
      setServiceCall(data.service_call);
      setCustomer(data.customer);
      setPhotos(data.photos || []);
      setVideos(data.videos || []);
      setMaterials(data.materials || []);
      setAccessMode(data.access_mode || "sign");
    } catch (err: any) {
      console.error("Public report load error:", err);
      setError("לא ניתן לטעון את הדוח");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <p className="text-muted-foreground">טוען דוח...</p>
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

  const lightboxPhotos = photos.map((p: any) => ({
    id: p.id, url: p.url, caption: p.caption, tag: p.tag,
  }));
  const visibleDamageSummary = Array.isArray(serviceCall?.visible_damage)
    ? serviceCall.visible_damage
        .map((item: string) => item.startsWith("other:") ? `אחר: ${item.replace("other:", "")}` : visibleDamageLabels[item] || item)
        .join(", ")
    : "";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <header className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            {logoUrl ? (
              <img src={logoUrl} alt="לוגו יהב אוחנה אינסטלציה" className="h-14 max-w-[160px] rounded-xl object-contain bg-primary-foreground/10 p-1" />
            ) : (
              <div className="w-12 h-12 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{report?.title}</h1>
              <p className="text-sm opacity-80">{BUSINESS_INFO.name} — דוח עבודה</p>
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

        {/* Service call details */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> פרטי קריאת שירות</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>סוג עבודה:</strong> {getJobTypeLabel(serviceCall?.job_type)}</p>
            <p><strong>סטטוס:</strong> {serviceCall?.status === "completed" ? "הושלם" : serviceCall?.status}</p>
            {serviceCall?.scheduled_date && (
              <p className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {new Date(serviceCall.scheduled_date).toLocaleDateString("he-IL")}
              </p>
            )}
            {serviceCall?.description && <p className="mt-2 text-muted-foreground">{serviceCall.description}</p>}
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader><CardTitle className="text-base">אבחון מקצועי</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <SummaryLine label="מצב מים" value={serviceCall?.water_pressure_status} />
            <SummaryLine label="נכס מאוכלס" value={serviceCall?.property_occupied === true ? "כן" : serviceCall?.property_occupied === false ? "לא" : ""} />
            <SummaryLine label="ברז ראשי סגור" value={serviceCall?.main_valve_closed === true ? "כן" : serviceCall?.main_valve_closed === false ? "לא" : ""} />
            <SummaryLine label="מגבלות בבדיקה" value={serviceCall?.test_limitations} />
            <SummaryLine label="שיטת איתור" value={serviceCall?.detection_method} />
            <SummaryLine label="ממצאים" value={serviceCall?.findings} />
            <SummaryLine label="הערכת סיבה" value={serviceCall?.cause_assessment} />
            <SummaryLine label="נזקים נראים לעין" value={visibleDamageSummary} />
            <SummaryLine label="מיקום הנזילה" value={serviceCall?.leak_location} />
            <SummaryLine label="רמת ודאות" value={confidenceLabels[serviceCall?.diagnosis_confidence] || serviceCall?.diagnosis_confidence} />
            <SummaryLine label="רמת דחיפות" value={urgencyLabels[serviceCall?.urgency_level] || serviceCall?.urgency_level} />
            <SummaryLine label="המלצה" value={serviceCall?.recommendations} />
            <SummaryLine label="אזורים שלא נבדקו" value={serviceCall?.areas_not_inspected} />
          </CardContent>
        </Card>

        {/* Materials */}
        {materials.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">חומרים ({materials.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {materials.map((material: any) => (
                <div key={material.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{material.name}</p>
                    <p className="text-xs text-muted-foreground">כמות: {material.quantity}</p>
                  </div>
                  <Badge variant="secondary">{material.is_one_off ? "חד-פעמי" : "מלאי"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Image className="w-4 h-4" /> תמונות ({photos.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo: any, i: number) => (
                  <div key={photo.id} className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-muted relative group" onClick={() => setLightboxIndex(i)}>
                    <img src={photo.url} alt={photo.caption || ""} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    {photo.tag && <Badge className="absolute top-2 right-2 text-xs bg-black/50 text-white border-0">{tagLabels[photo.tag]}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Film className="w-4 h-4" /> סרטונים ({videos.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {videos.map((video: any) => (
                  <button key={video.id} className="w-full flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-right" onClick={() => setPlayingVideo(video)}>
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0"><Play className="w-6 h-6 text-primary" /></div>
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

        {/* Signature — always last */}
        {report?.signature_url ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" /> חתימת לקוח התקבלה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <img src={report.signature_url} alt="חתימת לקוח" className="max-w-xs border rounded-lg" />
              {report.signed_by && <p className="text-sm"><strong>שם החותם:</strong> {report.signed_by}</p>}
              {report.signature_date && (
                <p className="text-sm text-muted-foreground">נחתם: {new Date(report.signature_date).toLocaleString("he-IL")}</p>
              )}
            </CardContent>
          </Card>
        ) : accessMode === "sign" ? (
          <PublicSignaturePad
            shareToken={token!}
            onSigned={(signatureDate) => {
              setReport((prev: any) => ({ ...prev, signature_date: signatureDate, signature_url: "signed" }));
            }}
          />
        ) : (
          <Card>
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              דוח לצפייה בלבד
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>{BUSINESS_INFO.name} | {BUSINESS_INFO.subtitle}</p>
        <p className="mt-1">טלפון: {BUSINESS_INFO.phone}</p>
      </footer>

      <PhotoLightbox photos={lightboxPhotos} initialIndex={lightboxIndex} open={lightboxIndex >= 0} onClose={() => setLightboxIndex(-1)} />
      {playingVideo && <VideoPlayer url={playingVideo.url} title={playingVideo.title || "סרטון"} open={!!playingVideo} onClose={() => setPlayingVideo(null)} />}
    </div>
  );
};

export default PublicReport;
