import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { PhotoGrid } from "@/components/media/PhotoGrid";
import { VideoList } from "@/components/media/VideoList";
import {
  ArrowRight, Share2, ExternalLink, Copy, Ban, FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const ReportEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [serviceCall, setServiceCall] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const [form, setForm] = useState({
    title: "", findings: "", recommendations: "",
    quote_summary: "", invoice_number: "", invoice_status: "",
  });

  useEffect(() => {
    if (!user || !id) return;
    loadReport();
  }, [user, id]);

  const loadReport = async () => {
    try {
      const { data: rep, error } = await supabase.from("reports")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;

      setReport(rep);
      setForm({
        title: rep.title, findings: rep.findings || "",
        recommendations: rep.recommendations || "",
        quote_summary: rep.quote_summary || "",
        invoice_number: rep.invoice_number || "",
        invoice_status: rep.invoice_status || "",
      });

      // Load related data
      const [scRes, photosRes, videosRes, shareRes] = await Promise.all([
        supabase.from("service_calls").select("*, customers(*)").eq("id", rep.service_call_id).single(),
        supabase.from("service_call_photos").select("*").eq("service_call_id", rep.service_call_id).order("created_at"),
        supabase.from("service_call_videos").select("*").eq("service_call_id", rep.service_call_id).order("created_at"),
        supabase.from("report_shares").select("share_token, is_active, revoked_at").eq("report_id", id!).eq("is_active", true).is("revoked_at", null).limit(1),
      ]);

      setServiceCall(scRes.data);
      setPhotos(photosRes.data || []);
      setVideos(videosRes.data || []);
      if (shareRes.data && shareRes.data.length > 0) {
        setShareToken(shareRes.data[0].share_token);
      }
    } catch (err: any) {
      console.error("Load report error:", err);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הדוח", variant: "destructive" });
      navigate("/reports");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("reports").update(form).eq("id", id!);
      if (error) throw error;
      toast({ title: "נשמר", description: "הדוח עודכן" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("reports").update({ ...form, status: "final" }).eq("id", id!);
      if (error) throw error;
      setReport((r: any) => ({ ...r, status: "final" }));
      toast({ title: "הדוח סוים", description: "הדוח סומן כסופי" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!user) return;
    try {
      if (shareToken) {
        setShareDialogOpen(true);
        return;
      }

      const { data, error } = await supabase.from("report_shares").insert({
        report_id: id!,
        created_by: user.id,
      }).select("share_token").single();

      if (error) throw error;
      setShareToken(data.share_token);
      setShareDialogOpen(true);
      toast({ title: "קישור שיתוף נוצר" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const handleRevoke = async () => {
    try {
      const { error } = await supabase.from("report_shares")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("report_id", id!)
        .eq("is_active", true);

      if (error) throw error;
      setShareToken(null);
      setShareDialogOpen(false);
      toast({ title: "בוטל", description: "קישור השיתוף בוטל" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const shareUrl = shareToken ? `${window.location.origin}/r/${shareToken}` : "";

  if (loading) {
    return <AppLayout title="טוען דוח..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  const customer = serviceCall?.customers as any;

  return (
    <AppLayout title={form.title || "דוח עבודה"}>
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(`/service-calls/${report.service_call_id}`)} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה לקריאה
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleShare} className="gap-2">
            <Share2 className="w-4 h-4" /> שתף
          </Button>
          {report.status === "draft" && (
            <Button onClick={handleFinalize} disabled={saving} className="gap-2">
              <FileText className="w-4 h-4" /> סיים דוח
            </Button>
          )}
        </div>
      </div>

      <Badge className={report.status === "final" ? "bg-success/15 text-success mb-4" : "bg-warning/15 text-warning mb-4"}>
        {report.status === "final" ? "סופי" : "טיוטה"}
      </Badge>

      <Tabs defaultValue="details" dir="rtl">
        <TabsList className="mb-4 h-12">
          <TabsTrigger value="details" className="text-base px-6 h-10">פרטים</TabsTrigger>
          <TabsTrigger value="photos" className="text-base px-6 h-10">תמונות ({photos.length})</TabsTrigger>
          <TabsTrigger value="videos" className="text-base px-6 h-10">סרטונים ({videos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="space-y-6">
            {/* Customer info */}
            <Card>
              <CardHeader><CardTitle className="text-base">פרטי לקוח</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>שם:</strong> {customer?.name}</p>
                {customer?.phone && <p><strong>טלפון:</strong> {customer.phone}</p>}
                {customer?.address && <p><strong>כתובת:</strong> {customer.city} {customer.address}</p>}
              </CardContent>
            </Card>

            {/* Report fields */}
            <Card>
              <CardHeader><CardTitle className="text-base">תוכן הדוח</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>כותרת</Label>
                  <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>ממצאים</Label>
                  <Textarea value={form.findings} onChange={(e) => setForm(f => ({ ...f, findings: e.target.value }))} rows={5} />
                </div>
                <div className="space-y-2">
                  <Label>המלצות</Label>
                  <Textarea value={form.recommendations} onChange={(e) => setForm(f => ({ ...f, recommendations: e.target.value }))} rows={5} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>סיכום הצעת מחיר</Label>
                    <Input value={form.quote_summary} onChange={(e) => setForm(f => ({ ...f, quote_summary: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>מספר חשבונית</Label>
                    <Input value={form.invoice_number} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))} dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label>סטטוס חשבונית</Label>
                    <Input value={form.invoice_status} onChange={(e) => setForm(f => ({ ...f, invoice_status: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="h-12">
                  {saving ? "שומר..." : "שמור שינויים"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="photos">
          <PhotoGrid photos={photos} />
        </TabsContent>

        <TabsContent value="videos">
          <VideoList videos={videos} />
        </TabsContent>
      </Tabs>

      {/* Share dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שיתוף דוח</DialogTitle>
            <DialogDescription>קישור זה מאפשר צפייה בלבד בדוח ללא צורך בהתחברות</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly dir="ltr" className="text-sm" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "הקישור הועתק" }); }}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" asChild>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={handleRevoke} className="gap-2">
              <Ban className="w-4 h-4" /> בטל קישור שיתוף
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ReportEditor;
