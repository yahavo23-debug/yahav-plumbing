import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

type ServiceCall = Tables<"service_calls">;
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

const ServiceCallDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [call, setCall] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [findings, setFindings] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

    setCall(callRes.data);
    setFindings(callRes.data.findings || "");
    setRecommendations(callRes.data.recommendations || "");
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

  const saveFindings = async () => {
    setSaving(true);
    const { error } = await supabase.from("service_calls")
      .update({ findings, recommendations })
      .eq("id", id!);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "הממצאים עודכנו" });
    }
    setSaving(false);
  };

  const handleCreateReport = async () => {
    if (!user || !id) return;
    try {
      // Check if report already exists
      const { data: existing } = await supabase.from("reports")
        .select("id")
        .eq("service_call_id", id)
        .limit(1);

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

      // Verify readable
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
    <AppLayout title={`קריאת שירות - ${customer?.name || ""}`}>
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate("/service-calls")} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה
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

      {/* Info card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{customer?.name}</span>
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
              <Badge className={`${statusColors[call.status]}`}>{statusLabels[call.status]}</Badge>
              <p className="text-sm"><strong>סוג:</strong> {call.job_type}</p>
              {call.scheduled_date && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" /> {new Date(call.scheduled_date).toLocaleDateString("he-IL")}
                </div>
              )}
            </div>
            {call.description && (
              <div className="basis-full">
                <p className="text-sm text-muted-foreground">{call.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="mb-4 h-12 w-full justify-start">
          <TabsTrigger value="overview" className="text-base px-6 h-10">סקירה</TabsTrigger>
          <TabsTrigger value="photos" className="text-base px-6 h-10">
            תמונות ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="videos" className="text-base px-6 h-10">
            סרטונים ({videos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ממצאים</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="תאר את הממצאים..."
                  rows={6}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">המלצות</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="תאר את ההמלצות..."
                  rows={6}
                />
              </CardContent>
            </Card>
          </div>
          <Button onClick={saveFindings} disabled={saving} className="mt-4 h-12">
            {saving ? "שומר..." : "שמור ממצאים והמלצות"}
          </Button>
        </TabsContent>

        <TabsContent value="photos">
          <MediaUploader serviceCallId={id!} type="photo" onUploadComplete={refreshPhotos} />
          <div className="mt-4">
            <PhotoGrid photos={photos} onDelete={(deletedId) => setPhotos(p => p.filter(x => x.id !== deletedId))} />
          </div>
        </TabsContent>

        <TabsContent value="videos">
          <MediaUploader serviceCallId={id!} type="video" onUploadComplete={refreshVideos} />
          <div className="mt-4">
            <VideoList videos={videos} onDelete={(deletedId) => setVideos(v => v.filter(x => x.id !== deletedId))} />
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default ServiceCallDetail;
