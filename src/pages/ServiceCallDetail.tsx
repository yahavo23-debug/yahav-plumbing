import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/hooks/use-toast";
import { PhotoGrid } from "@/components/media/PhotoGrid";
import { VideoList } from "@/components/media/VideoList";
import { MediaUploader } from "@/components/media/MediaUploader";
import { Tables } from "@/integrations/supabase/types";
import {
  ArrowRight, Edit, FileText, Calendar, User, MapPin, Phone,
} from "lucide-react";
import { QuotesList } from "@/components/quotes/QuotesList";
import { DiagnosisTab } from "@/components/diagnosis/DiagnosisTab";
import { ShareButton } from "@/components/sharing/ShareButton";

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
  const { user, role, isAdmin } = useAuth();
  const { logAction } = useAuditLog();
  const isContractor = role === "contractor";
  const canEdit = isAdmin || role === "technician";
  const canUpload = isAdmin || role === "technician";
  const [call, setCall] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  

  // Keep findings/recommendations for report creation
  const [findings, setFindings] = useState("");
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
    setFindings(data.findings || "");
    setRecommendations(data.recommendations || "");
    setPhotos(photosRes.data || []);
    setVideos(videosRes.data || []);
    setLoading(false);

    // Audit log for contractor views
    const customerName = (data.customers as any)?.name || "";
    logAction({
      action: "view_service_call",
      resource_type: "service_call",
      resource_id: id!,
      resource_label: `#${data.call_number} - ${customerName}`,
    });
  };

  const refreshPhotos = useCallback(async () => {
    const { data } = await supabase.from("service_call_photos").select("*").eq("service_call_id", id!).order("created_at");
    setPhotos(data || []);
  }, [id]);

  const refreshVideos = useCallback(async () => {
    const { data } = await supabase.from("service_call_videos").select("*").eq("service_call_id", id!).order("created_at");
    setVideos(data || []);
  }, [id]);


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
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/service-calls/${id}/edit`)} className="gap-2">
              <Edit className="w-4 h-4" /> עריכה
            </Button>
            <Button onClick={handleCreateReport} className="gap-2">
              <FileText className="w-4 h-4" /> דוח עבודה
            </Button>
          </div>
        )}
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
          {!isContractor && (
            <div className="flex justify-end mb-3">
              <ShareButton serviceCallId={id!} shareType="details" />
            </div>
          )}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label className="text-muted-foreground text-xs">תיאור התלונה</Label>
                <Textarea
                  value={call.description || ""}
                  onChange={(e) => !isContractor && setCall({ ...call, description: e.target.value })}
                  placeholder="תאר את התלונה..."
                  rows={4}
                  className="mt-1"
                  readOnly={isContractor}
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                <Textarea
                  value={(call as any).notes || ""}
                  onChange={(e) => !isContractor && setCall({ ...call, notes: e.target.value })}
                  placeholder="הערות נוספות..."
                  rows={3}
                  className="mt-1"
                  readOnly={isContractor}
                />
              </div>
              {canEdit && (
                <Button
                  onClick={async () => {
                    const { error } = await supabase
                      .from("service_calls")
                      .update({
                        description: call.description?.trim() || null,
                        notes: (call as any).notes?.trim() || null,
                      } as any)
                      .eq("id", id!);
                    if (error) {
                      toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
                    } else {
                      toast({ title: "נשמר", description: "פרטי הקריאה עודכנו" });
                    }
                  }}
                  className="h-10"
                >
                  שמור פרטים
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Diagnosis */}
        <TabsContent value="diagnosis">
          {!isContractor && (
            <div className="flex justify-end mb-3">
              <ShareButton serviceCallId={id!} shareType="diagnosis" />
            </div>
          )}
          <DiagnosisTab
            serviceCallId={id!}
            callData={call}
            readOnly={isContractor}
            onDataUpdate={(updated) => {
              setCall(updated);
              setFindings(updated.findings || "");
              setRecommendations(updated.recommendations || "");
            }}
          />
        </TabsContent>

        {/* 3. Media */}
        <TabsContent value="media">
          {!isContractor && (
            <div className="flex justify-end mb-3">
              <ShareButton serviceCallId={id!} shareType="media" />
            </div>
          )}
          {canUpload && (
            <MediaUploader serviceCallId={id!} type="photo" onUploadComplete={refreshPhotos} />
          )}
          <div className="mt-4">
            <PhotoGrid photos={photos} onDelete={canEdit ? (deletedId) => setPhotos(p => p.filter(x => x.id !== deletedId)) : undefined} />
          </div>
          <div className="mt-6">
            {canUpload && (
              <MediaUploader serviceCallId={id!} type="video" onUploadComplete={refreshVideos} />
            )}
            <div className="mt-4">
              <VideoList videos={videos} onDelete={canEdit ? (deletedId) => setVideos(v => v.filter(x => x.id !== deletedId)) : undefined} />
            </div>
          </div>
        </TabsContent>

        {/* 4. Quotes */}
        <TabsContent value="quotes">
          {!isContractor && (
            <div className="flex justify-end mb-3">
              <ShareButton serviceCallId={id!} shareType="quotes" />
            </div>
          )}
          <QuotesList serviceCallId={id!} />
        </TabsContent>

        {/* 5. Reports */}
        <TabsContent value="reports">
          {!isContractor && (
            <div className="flex justify-end mb-3">
              <ShareButton serviceCallId={id!} shareType="report" />
            </div>
          )}
          {canEdit ? (
            <Card>
              <CardContent className="p-6">
                <Button onClick={handleCreateReport} className="gap-2">
                  <FileText className="w-4 h-4" /> צור / פתח דוח עבודה
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground py-4">אין לך הרשאה ליצור דוחות</p>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default ServiceCallDetail;
