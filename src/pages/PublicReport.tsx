import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoLightbox } from "@/components/media/PhotoLightbox";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { PublicSignaturePad } from "@/components/reports/PublicSignaturePad";
import { Wrench, User, Phone, MapPin, Calendar, Image, Film, FileText, Play, Check } from "lucide-react";

const tagLabels: Record<string, string> = {
  before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
};

const PublicReport = () => {
  const { token } = useParams();
  const [report, setReport] = useState<any>(null);
  const [serviceCall, setServiceCall] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [playingVideo, setPlayingVideo] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    loadPublicReport();
  }, [token]);

  const loadPublicReport = async () => {
    try {
      // Verify share token
      const { data: share, error: shareError } = await supabase
        .from("report_shares")
        .select("report_id, is_active, revoked_at, expires_at")
        .eq("share_token", token!)
        .single();

      if (shareError || !share) {
        setError("הקישור אינו תקף");
        setLoading(false);
        return;
      }

      if (!share.is_active || share.revoked_at) {
        setError("קישור השיתוף בוטל");
        setLoading(false);
        return;
      }

      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        setError("קישור השיתוף פג תוקף");
        setLoading(false);
        return;
      }

      // Load report data using edge function
      const { data: rep, error: repError } = await supabase
        .from("reports")
        .select("*")
        .eq("id", share.report_id)
        .single();

      // Since this is anonymous, the RLS policies for reports won't allow reading
      // We need to use the share mechanism. Let's fetch via a different approach.
      // For now, let's use a function-based approach or adjust our strategy.

      // Actually, the report_shares policy allows anon SELECT, but reports policy doesn't allow anon.
      // We'll need to use the edge function approach. For now, let's try with the share data.
      
      // Let's use a simpler approach - create a server function that returns report data given a valid token
      // For now, we'll use the supabase client with the service role through an edge function
      
      const response = await supabase.functions.invoke("get-public-report", {
        body: { share_token: token },
      });

      if (response.error) throw response.error;
      const data = response.data;

      setReport(data.report);
      setServiceCall(data.service_call);
      setCustomer(data.customer);
      setPhotos(data.photos || []);
      setVideos(data.videos || []);
    } catch (err: any) {
      console.error("Public report load error:", err);
      setError("לא ניתן לטעון את הדוח");
    } finally {
      setLoading(false);
    }
  };

  // All media URLs come as signed URLs from the edge function - no public URL fallbacks needed

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
    id: p.id,
    url: p.url,
    caption: p.caption,
    tag: p.tag,
  }));

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* noindex meta */}
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <header className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{report?.title}</h1>
              <p className="text-sm opacity-80">דוח עבודה</p>
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
            <p><strong>סוג עבודה:</strong> {serviceCall?.job_type}</p>
            <p><strong>סטטוס:</strong> {serviceCall?.status === "completed" ? "הושלם" : serviceCall?.status}</p>
            {serviceCall?.scheduled_date && (
              <p className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {new Date(serviceCall.scheduled_date).toLocaleDateString("he-IL")}
              </p>
            )}
            {serviceCall?.description && <p className="mt-2 text-muted-foreground">{serviceCall.description}</p>}
          </CardContent>
        </Card>

        {/* Findings */}
        {report?.findings && (
          <Card>
            <CardHeader><CardTitle className="text-base">ממצאים</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{report.findings}</p>
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {report?.recommendations && (
          <Card>
            <CardHeader><CardTitle className="text-base">המלצות</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{report.recommendations}</p>
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
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-muted relative group"
                    onClick={() => setLightboxIndex(i)}
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

        {/* Videos */}
        {videos.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Film className="w-4 h-4" /> סרטונים ({videos.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {videos.map((video: any) => (
                  <button
                    key={video.id}
                    className="w-full flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-right"
                    onClick={() => setPlayingVideo(video)}
                  >
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                      <Play className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{video.title || "סרטון"}</p>
                      {video.tag && (
                        <Badge className="text-xs mt-1">{tagLabels[video.tag]}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signature */}
        {report?.signature_url ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                חתימת לקוח התקבלה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <img
                src={report.signature_url}
                alt="חתימת לקוח"
                className="max-w-xs border rounded-lg"
              />
              {report.signed_by && (
                <p className="text-sm"><strong>שם החותם:</strong> {report.signed_by}</p>
              )}
              {report.signature_date && (
                <p className="text-sm text-muted-foreground">
                  נחתם: {new Date(report.signature_date).toLocaleString("he-IL")}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <PublicSignaturePad
            shareToken={token!}
            onSigned={(signatureDate) => {
              setReport((prev: any) => ({
                ...prev,
                signature_date: signatureDate,
                signature_url: "signed", // Mark as signed to hide the pad
              }));
            }}
          />
        )}

        {/* Quote/Invoice */}
        {(report?.quote_summary || report?.invoice_number) && (
          <Card>
            <CardHeader><CardTitle className="text-base">פרטי תשלום</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {report.quote_summary && <p><strong>סיכום הצעת מחיר:</strong> {report.quote_summary}</p>}
              {report.invoice_number && <p><strong>מספר חשבונית:</strong> {report.invoice_number}</p>}
              {report.invoice_status && <p><strong>סטטוס:</strong> {report.invoice_status}</p>}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>דוח זה הופק באמצעות מערכת CRM</p>
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

export default PublicReport;
