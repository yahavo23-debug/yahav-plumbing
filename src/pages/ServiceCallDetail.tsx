import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { PhotoGrid } from "@/components/media/PhotoGrid";
import { VideoList } from "@/components/media/VideoList";
import { MediaUploader } from "@/components/media/MediaUploader";
import { Tables } from "@/integrations/supabase/types";
import {
  ArrowRight, Edit, FileText, Calendar, User, MapPin, Phone,
} from "lucide-react";
import { QuotesList } from "@/components/quotes/QuotesList";

type Photo = Tables<"service_call_photos">;
type Video = Tables<"service_call_videos">;

const statusLabels: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", completed: "הושלם", cancelled: "בוטל",
};
const statusColors: Record<string, string> = {
  open: "bg-warning/15 text-warning border-warning/30",
  in_progress: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};
const priorityLabels: Record<string, string> = {
  low: "נמוכה", medium: "בינונית", high: "גבוהה", urgent: "דחופה",
};
const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-destructive/10 text-destructive",
};
const serviceTypeLabels: Record<string, string> = {
  leak_detection: "איתור נזילה",
  sewer_camera: "צילום קו ביוב",
  pressure_test: "בדיקת לחץ",
  other: "אחר",
  "תיקון": "תיקון", "התקנה": "התקנה", "תחזוקה": "תחזוקה",
  "בדיקה": "בדיקה", "ייעוץ": "ייעוץ", "אחר": "אחר",
};

const ServiceCallDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [call, setCall] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Diagnosis fields
  const [detectionMethod, setDetectionMethod] = useState("");
  const [findings, setFindings] = useState("");
  const [causeAssessment, setCauseAssessment] = useState("");
  const [recommendations, setRecommendations] = useState("");

  useEffect(() => {
    if (!user || !id) return;
    loadData();
  }, [user, id]);

  const loadData = async () => {
    const [callRes, photosRes, videosRes] = await Promise.all([
      supabase.from("service_calls").select("*, customers(*)").eq("id", id!).single(),
      supabase.from("service_call_photos").select("*").eq("service_call_id", id!).order("created_at"),
      supabase.from("service_call_videos").select("*").eq("service_call_id", id!).order("created_at"),
    ]);

    if (callRes.error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאה", variant: "destructive" });
      navigate("/service-calls");
      return;
    }

    const data = callRes.data;
    setCall(data);
    setDetectionMethod((data as any).detection_method || "");
    setFindings(data.findings || "");
    setCauseAssessment((data as any).cause_assessment || "");
    setRecommendations(data.recommendations || "");
    setPhotos(photosRes.data || []);
    setVideos(videosRes.data || []);
    setLoading(false);
  };

  const refreshPhotos = useCallback(async () => {
    const { data } = await supabase.from("service_call_photos").select("*").eq("service_call_id", id!).order("created_at");
    setPhotos(data || []);
  }, [id]);

  const refreshVideos = useCallback(async () => {
    const { data } = await supabase.from("service_call_videos").select("*").eq("service_call_id", id!).order("created_at");
    setVideos(data || []);
  }, [id]);

  const saveDiagnosis = async () => {
    setSaving(true);
    const { error } = await supabase.from("service_calls")
      .update({
        detection_method: detectionMethod.trim() || null,
        findings: findings.trim() || null,
        cause_assessment: causeAssessment.trim() || null,
        recommendations: recommendations.trim() || null,
      } as any)
      .eq("id", id!);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "האבחון עודכן בהצלחה" });
    }
    setSaving(false);
  };

  const handleCreateReport = async () => {
    if (!user || !id) return;
    try {
      const { data: existing } = await supabase.from("reports")
        .select("id").eq("service_call_id", id).limit(1);

      if (existing && existing.length > 0) {
        navigate(`/reports/${existing[0].id}`);
        return;
      }

      const { data, error } = await supabase.from("reports")
        .insert({
          service_call_id: id,
          title: `דוח עבודה - ${(call?.customers as any)?.name || ""}`,
          findings: findings || null,
          recommendations: recommendations || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const { data: verified } = await supabase.from("reports").select("id").eq("id", data.id).single();
      if (!verified) throw new Error("הדוח נוצר אך לא ניתן לקרוא אותו");

      toast({ title: "דוח נוצר", description: "הדוח נוצר בהצלחה" });
      navigate(`/reports/${data.id}`);
    } catch (err: any) {
      console.error("Create report error:", err);
      toast({ title: "שגיאה ביצירת דוח", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <AppLayout title="טוען..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  const customer = call?.customers as any;

  return (
    <AppLayout title={`קריאה #${(call as any)?.call_number || ""} — ${customer?.name || ""}`}>
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(`/customers/${call.customer_id}`)} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה ללקוח
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/service-calls/${id}/edit`)} className="gap-2">
            <Edit className="w-4 h-4" /> עריכה
          </Button>
          <Button onClick={handleCreateReport} className="gap-2">
            <FileText className="w-4 h-4" /> דוח עבודה
          </Button>
        </div>
      </div>

      {/* Info summary */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span
                  className="font-medium cursor-pointer hover:underline"
                  onClick={() => navigate(`/customers/${call.customer_id}`)}
                >
                  {customer?.name}
                </span>
              </div>
              {customer?.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" /> {customer.phone}
                </div>
              )}
              {customer?.address && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" /> {customer.city} {customer.address}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={`${statusColors[call.status]}`}>{statusLabels[call.status]}</Badge>
                {(call as any).priority && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[(call as any).priority]}`}>
                    {priorityLabels[(call as any).priority] || (call as any).priority}
                  </span>
                )}
              </div>
              <p className="text-sm"><strong>סוג:</strong> {serviceTypeLabels[call.job_type] || call.job_type}</p>
              {call.scheduled_date && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" /> {new Date(call.scheduled_date).toLocaleDateString("he-IL")}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details" dir="rtl">
        <TabsList className="mb-4 h-12 w-full justify-start overflow-x-auto">
          <TabsTrigger value="details" className="text-base px-5 h-10">פרטי קריאה</TabsTrigger>
          <TabsTrigger value="diagnosis" className="text-base px-5 h-10">אבחון</TabsTrigger>
          <TabsTrigger value="media" className="text-base px-5 h-10">
            מדיה ({photos.length + videos.length})
          </TabsTrigger>
          <TabsTrigger value="quotes" className="text-base px-5 h-10">הצעות מחיר</TabsTrigger>
          <TabsTrigger value="reports" className="text-base px-5 h-10">דוחות</TabsTrigger>
        </TabsList>

        {/* 1. Call Details */}
        <TabsContent value="details">
          <Card>
            <CardContent className="p-6 space-y-4">
              {call.description && (
                <div>
                  <Label className="text-muted-foreground text-xs">תיאור התלונה</Label>
                  <p className="mt-1 whitespace-pre-wrap">{call.description}</p>
                </div>
              )}
              {(call as any).notes && (
                <div>
                  <Label className="text-muted-foreground text-xs">הערות</Label>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{(call as any).notes}</p>
                </div>
              )}
              {!call.description && !(call as any).notes && (
                <p className="text-muted-foreground text-center py-4">אין פרטים נוספים</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Diagnosis */}
        <TabsContent value="diagnosis">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">שיטת איתור</CardTitle></CardHeader>
              <CardContent>
                <Input
                  value={detectionMethod}
                  onChange={(e) => setDetectionMethod(e.target.value)}
                  placeholder="למשל: מצלמה תרמית, גז עקיבה..."
                  maxLength={200}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">הערכת סיבה</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={causeAssessment}
                  onChange={(e) => setCauseAssessment(e.target.value)}
                  placeholder="הסיבה המשוערת לתקלה..."
                  rows={3}
                  maxLength={2000}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">ממצאים</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="תאר את הממצאים..."
                  rows={4}
                  maxLength={2000}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">המלצות</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="תאר את ההמלצות..."
                  rows={4}
                  maxLength={2000}
                />
              </CardContent>
            </Card>
          </div>
          <Button onClick={saveDiagnosis} disabled={saving} className="mt-4 h-12">
            {saving ? "שומר..." : "שמור אבחון"}
          </Button>
        </TabsContent>

        {/* 3. Media */}
        <TabsContent value="media">
          <MediaUploader serviceCallId={id!} type="photo" onUploadComplete={refreshPhotos} />
          <div className="mt-4">
            <PhotoGrid photos={photos} onDelete={(deletedId) => setPhotos(p => p.filter(x => x.id !== deletedId))} />
          </div>
          <div className="mt-6">
            <MediaUploader serviceCallId={id!} type="video" onUploadComplete={refreshVideos} />
            <div className="mt-4">
              <VideoList videos={videos} onDelete={(deletedId) => setVideos(v => v.filter(x => x.id !== deletedId))} />
            </div>
          </div>
        </TabsContent>

        {/* 4. Quotes */}
        <TabsContent value="quotes">
          <QuotesList serviceCallId={id!} />
        </TabsContent>

        {/* 5. Reports */}
        <TabsContent value="reports">
          <Card>
            <CardContent className="p-6">
              <Button onClick={handleCreateReport} className="gap-2">
                <FileText className="w-4 h-4" /> צור / פתח דוח עבודה
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default ServiceCallDetail;
