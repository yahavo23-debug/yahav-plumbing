import { useEffect, useState, useRef } from "react";
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
import { DownloadAllPhotos } from "@/components/media/DownloadAllPhotos";
import { VideoList } from "@/components/media/VideoList";
import {
  ArrowRight, Share2, ExternalLink, Copy, Ban, FileText, Send, Lock, MessageCircle, AlertTriangle, RefreshCw, CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PdfReportGenerator, PdfReportGeneratorHandle } from "@/components/reports/PdfReportGenerator";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-warning/15 text-warning" },
  sent: { label: "נשלח לחתימה", color: "bg-primary/15 text-primary" },
  signed: { label: "נחתם", color: "bg-success/15 text-success" },
  final: { label: "סופי", color: "bg-muted text-muted-foreground" },
};

const ReportEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [serviceCall, setServiceCall] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [customWaNumber, setCustomWaNumber] = useState("");
  const pdfRef = useRef<PdfReportGeneratorHandle>(null);

  const [form, setForm] = useState({
    title: "", findings: "", recommendations: "",
    quote_summary: "", invoice_number: "", invoice_status: "",
  });

  // Is the report locked (signed or final)? — permanently locked, no one can edit
  const isLocked = report?.status === "signed" || report?.status === "final";
  const canEdit = !isLocked;

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
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("reports").update(form).eq("id", id!);
      if (error) throw error;
      toast({ title: "נשמר", description: "הדוח עודכן, יוצר PDF..." });
      // Auto-generate PDF after saving
      await pdfRef.current?.generate();
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

  // Unlock removed — signed/final reports are permanently locked

  const handleSendLink = async (mode: "view" | "sign") => {
    if (!user) return;
    setSaving(true);
    try {
      if (mode === "sign") {
        await supabase.from("reports").update({ ...form, status: "sent" } as any).eq("id", id!);
        setReport((r: any) => ({ ...r, status: "sent" }));
      }

      // Create share link with access_mode
      let token = shareToken;
      if (!token) {
        const { data, error } = await supabase.from("report_shares").insert({
          report_id: id!,
          created_by: user.id,
          access_mode: mode,
        } as any).select("share_token").single();

        if (error) throw error;
        token = data.share_token;
        setShareToken(token);
      }

      setShareDialogOpen(true);
      if (mode === "sign") {
        toast({ title: "הדוח נשלח לחתימה", description: "סטטוס עודכן ל'נשלח'" });
      } else {
        toast({ title: "קישור צפייה נוצר" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
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

  const handleRegenerateLink = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Revoke existing
      if (shareToken) {
        await supabase.from("report_shares")
          .update({ is_active: false, revoked_at: new Date().toISOString() })
          .eq("report_id", id!)
          .eq("is_active", true);
      }
      // Create new
      const { data, error } = await supabase.from("report_shares").insert({
        report_id: id!,
        created_by: user.id,
      }).select("share_token").single();

      if (error) throw error;
      setShareToken(data.share_token);
      toast({ title: "קישור חדש נוצר", description: "הקישור הישן בוטל וקישור חדש נוצר" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Use published URL for production links, not window.location.origin (which may be preview)
  const baseUrl = "https://yahav-plumbing.lovable.app";
  const shareUrl = shareToken ? `${baseUrl}/r/${shareToken}` : "";
  const waMessage = shareUrl ? encodeURIComponent(`שלום, מצורף דוח עבודה לעיון וחתימה:\n${shareUrl}`) : "";
  const customerPhone = (serviceCall?.customers as any)?.phone;
  const customerWaNumber = customerPhone ? `972${customerPhone.replace(/^0/, "")}` : "";
  const whatsappUrl = shareUrl && customerWaNumber
    ? `https://wa.me/${customerWaNumber}?text=${waMessage}`
    : shareUrl ? `https://wa.me/?text=${waMessage}` : "";
  const customWaUrl = shareUrl && customWaNumber.trim()
    ? `https://wa.me/972${customWaNumber.trim().replace(/^0/, "")}?text=${waMessage}`
    : "";

  if (loading) {
    return <AppLayout title="טוען דוח..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  const customer = serviceCall?.customers as any;
  const status = statusConfig[report?.status] || statusConfig.draft;

  return (
    <AppLayout title={form.title || "דוח עבודה"}>
      {/* Locked banner */}
      {isLocked && (
        <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-warning/10 border border-warning/30">
          <Lock className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm font-medium text-warning">
            דוח חתום – נעול לצמיתות, לא ניתן לעריכה
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(`/service-calls/${report.service_call_id}`)} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה לקריאה
        </Button>
        <div className="flex gap-2 flex-wrap">
          <PdfReportGenerator
            ref={pdfRef}
            report={report}
            serviceCall={serviceCall}
            customer={customer}
            photos={photos}
            onPdfReady={(url) => console.log("PDF ready:", url)}
          />
          {/* Show share button if link exists */}
          {shareToken && (
            <Button variant="outline" onClick={() => setShareDialogOpen(true)} className="gap-2">
              <Share2 className="w-4 h-4" /> קישור שיתוף
            </Button>
          )}
          {/* Send to sign — for draft or sent status */}
          {(report.status === "draft" || report.status === "sent") && (
            <>
              <Button onClick={() => handleSendLink("view")} disabled={saving} className="gap-2" variant="outline">
                <Send className="w-4 h-4" /> שלח ללקוח
              </Button>
              <Button onClick={() => handleSendLink("sign")} disabled={saving} className="gap-2" variant="default">
                <Send className="w-4 h-4" /> שלח לחתימה
              </Button>
            </>
          )}
          {/* Finalize — for signed reports */}
          {report.status === "signed" && (
            <Button onClick={handleFinalize} disabled={saving} className="gap-2">
              <FileText className="w-4 h-4" /> סיים דוח
            </Button>
          )}
        </div>
      </div>

      <Badge className={`${status.color} mb-4`}>
        {status.label}
      </Badge>

      {/* Signature info display */}
      {report.signature_path && (
        <Card className="mb-4 border-success/30">
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-medium text-success flex items-center gap-2">
              <Lock className="w-4 h-4" /> חתימת לקוח התקבלה
            </p>
            {report.signed_by && <p><strong>שם החותם:</strong> {report.signed_by}</p>}
            {report.signature_date && <p><strong>תאריך:</strong> {new Date(report.signature_date).toLocaleString("he-IL")}</p>}
            {report.ip_address && <p><strong>כתובת IP:</strong> {report.ip_address}</p>}
            {report.device_info && <p className="truncate"><strong>מכשיר:</strong> {report.device_info}</p>}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details" dir="rtl">
        <TabsList className="mb-4 h-12">
          <TabsTrigger value="details" className="text-base px-6 h-10">פרטים</TabsTrigger>
          <TabsTrigger value="photos" className="text-base px-6 h-10">תמונות ({photos.length})</TabsTrigger>
          <TabsTrigger value="videos" className="text-base px-6 h-10">סרטונים ({videos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">פרטי לקוח</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>שם:</strong> {customer?.name}</p>
                {customer?.phone && <p><strong>טלפון:</strong> {customer.phone}</p>}
                {customer?.address && <p><strong>כתובת:</strong> {customer.city} {customer.address}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">תוכן הדוח</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>כותרת</Label>
                  <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                  <Label>ממצאים</Label>
                  <Textarea value={form.findings} onChange={(e) => setForm(f => ({ ...f, findings: e.target.value }))} rows={5} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                  <Label>המלצות</Label>
                  <Textarea value={form.recommendations} onChange={(e) => setForm(f => ({ ...f, recommendations: e.target.value }))} rows={5} disabled={!canEdit} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>סיכום הצעת מחיר</Label>
                    <Input value={form.quote_summary} onChange={(e) => setForm(f => ({ ...f, quote_summary: e.target.value }))} disabled={!canEdit} />
                  </div>
                  <div className="space-y-2">
                    <Label>מספר חשבונית</Label>
                    <Input value={form.invoice_number} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))} dir="ltr" disabled={!canEdit} />
                  </div>
                  <div className="space-y-2">
                    <Label>סטטוס חשבונית</Label>
                    <Input value={form.invoice_status} onChange={(e) => setForm(f => ({ ...f, invoice_status: e.target.value }))} disabled={!canEdit} />
                  </div>
                </div>
                {canEdit && (
                  <Button onClick={handleSave} disabled={saving} className="h-12 gap-2">
                    {saving ? "שומר ויוצר PDF..." : "שמור ויצור PDF"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="photos">
          <div className="space-y-4">
            <div className="flex justify-end">
              <DownloadAllPhotos photos={photos} />
            </div>
            <PhotoGrid photos={photos} />
          </div>
        </TabsContent>

        <TabsContent value="videos">
          <VideoList videos={videos} />
        </TabsContent>
      </Tabs>

      {/* Share dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שליחת דוח לחתימה</DialogTitle>
            <DialogDescription>קישור זה מאפשר צפייה בדוח וחתימה דיגיטלית ללא צורך בהתחברות</DialogDescription>
          </DialogHeader>
          {/* Link status indicator */}
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-green-700 dark:text-green-400 font-medium">קישור פעיל</span>
          </div>
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly dir="ltr" className="text-sm" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "הקישור הועתק" }); }}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" asChild>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
          </div>
          {/* WhatsApp — direct to customer */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium text-sm transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            {customerPhone ? `📲 שלח לחתימה ל-${customerPhone}` : "שלח בוואטסאפ"}
          </a>

          {/* WhatsApp — custom number */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">שלח למספר אחר (בן משפחה, מנהל...):</p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="05X-XXXXXXX"
                value={customWaNumber}
                onChange={e => setCustomWaNumber(e.target.value.replace(/\D/g, ""))}
                className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm"
                dir="ltr"
              />
              <a
                href={customWaUrl || undefined}
                target={customWaUrl ? "_blank" : undefined}
                rel="noopener noreferrer"
                onClick={e => !customWaUrl && e.preventDefault()}
                className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                  customWaUrl
                    ? "bg-green-100 hover:bg-green-200 text-green-700"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" /> שלח
              </a>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRegenerateLink} disabled={saving} className="gap-2 flex-1">
              <RefreshCw className="w-4 h-4" /> צור קישור חדש
            </Button>
            <Button variant="destructive" onClick={handleRevoke} className="gap-2 flex-1">
              <Ban className="w-4 h-4" /> בטל קישור
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ReportEditor;
