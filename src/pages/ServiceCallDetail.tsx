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
  ArrowRight, Edit, FileText, Calendar, User, MapPin, Phone, Trash2, Receipt,
  MoreVertical, Navigation, MessageCircle, Check, X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompleteCallDialog } from "@/components/service-calls/CompleteCallDialog";
import { toWhatsApp } from "@/lib/collection-report";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QuotesList } from "@/components/quotes/QuotesList";
import { DiagnosisTab } from "@/components/diagnosis/DiagnosisTab";
import { ShareButton } from "@/components/sharing/ShareButton";
import { MaterialsTab } from "@/components/inventory/MaterialsTab";
import { PendingPaymentDialog } from "@/components/service-calls/PendingPaymentDialog";
import { Wallet } from "lucide-react";


type Photo = Tables<"service_call_photos">;
type Video = Tables<"service_call_videos">;

const statusLabels: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", completed: "הושלם", cancelled: "בוטל",
  pending_customer: "ממתין לאישור לקוח", awaiting_payment: "ממתין לתשלום",
};
const statusColors: Record<string, string> = {
  open: "bg-warning/15 text-warning border-warning/30",
  in_progress: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  pending_customer: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  awaiting_payment: "bg-rose-500/15 text-rose-600 border-rose-500/30",
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
import { getJobTypeLabel } from "@/lib/constants";

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Invoice dialog state
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDesc, setInvoiceDesc] = useState("");
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // סגירת קריאה — דרך הדיאלוג המשותף (כולל התאמה חכמה לחוב פתוח)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  // Pending-payment dialog
  const [showPendingPaymentDialog, setShowPendingPaymentDialog] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    loadData();
  }, [user, id]);

  const loadData = async () => {
    try {
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
      setPhotos(photosRes.data || []);
      setVideos(videosRes.data || []);

      const customerName = (data.customers as any)?.name || "";
      logAction({
        action: "view_service_call",
        resource_type: "service_call",
        resource_id: id!,
        resource_label: `#${data.call_number} - ${customerName}`,
      });
    } catch (err) {
      console.error("loadData error:", err);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאה", variant: "destructive" });
      navigate("/service-calls");
    } finally {
      setLoading(false);
    }
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

  const handleCreateInvoice = async () => {
    if (!invoiceAmount || isNaN(Number(invoiceAmount))) {
      toast({ title: "שגיאה", description: "יש להזין סכום תקין", variant: "destructive" });
      return;
    }
    setInvoiceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-yesh-invoice", {
        body: {
          serviceCallId: id,
          amount: Number(invoiceAmount),
          description: invoiceDesc || call?.job_type || "שירות אינסטלציה",
          includeVat: false,
        },
      });
      if (error) throw error;
      if (data?.invoiceUrl) {
        window.open(data.invoiceUrl, "_blank");
      }
      toast({
        title: "✅ חשבונית נוצרה!",
        description: data?.invoiceNum ? `חשבונית מס' ${data.invoiceNum}` : "החשבונית נוצרה בהצלחה ביש חשבונית",
      });
      setShowInvoiceDialog(false);
      setInvoiceAmount("");
      setInvoiceDesc("");
    } catch (err: any) {
      console.error("Invoice error:", err);
      toast({ title: "שגיאה ביצירת חשבונית", description: err.message || "אנא נסה שנית", variant: "destructive" });
    } finally {
      setInvoiceLoading(false);
    }
  };



  if (loading) {
    return <AppLayout title="טוען..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  const customer = call?.customers as any;

  return (
    <AppLayout title={`קריאה #${(call as any)?.call_number || ""} — ${customer?.name || ""}`}>
      {/* שורה עליונה: חזרה + תפריט פעולות מתקדמות */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${call.customer_id}`)} className="gap-1.5 text-muted-foreground">
          <ArrowRight className="w-4 h-4" /> חזרה ללקוח
        </Button>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" aria-label="פעולות נוספות">
                <MoreVertical className="w-4 h-4" /> עוד
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/service-calls/${id}/edit`)} className="gap-2">
                <Edit className="w-4 h-4" /> עריכת הקריאה
              </DropdownMenuItem>
              {call.status !== "pending_customer" && call.status !== "cancelled" && call.status !== "completed" && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("service_calls").update({ status: "pending_customer" } as any).eq("id", id!);
                    if (error) toast({ title: "שגיאה", description: error.message, variant: "destructive" });
                    else { toast({ title: "עודכן", description: "הקריאה הועברה לממתין לאישור לקוח" }); setCall({ ...call, status: "pending_customer" }); }
                  }}
                >
                  <User className="w-4 h-4" /> ממתין לאישור לקוח
                </DropdownMenuItem>
              )}
              {call.status !== "completed" && call.status !== "cancelled" && call.status !== "awaiting_payment" && (
                <DropdownMenuItem className="gap-2" onClick={() => setShowPendingPaymentDialog(true)}>
                  <Wallet className="w-4 h-4" /> בוצע — ממתין לתשלום
                </DropdownMenuItem>
              )}
              {call.status === "cancelled" ? (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("service_calls").update({ status: "open" } as any).eq("id", id!);
                    if (error) toast({ title: "שגיאה", description: error.message, variant: "destructive" });
                    else { toast({ title: "שוחזר", description: "הקריאה הוחזרה לסטטוס פתוח" }); setCall({ ...call, status: "open" }); }
                  }}
                >
                  <ArrowRight className="w-4 h-4" /> החזר קריאה לפתוח
                </DropdownMenuItem>
              ) : call.status !== "completed" && (
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("service_calls").update({ status: "cancelled" } as any).eq("id", id!);
                    if (error) toast({ title: "שגיאה", description: error.message, variant: "destructive" });
                    else { toast({ title: "בוטל", description: "הקריאה בוטלה" }); setCall({ ...call, status: "cancelled" }); }
                  }}
                >
                  <X className="w-4 h-4" /> ביטול קריאה
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4" /> מחיקת קריאה
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* כרטיס קריאה יוקרתי: מי, מה, מתי + פעולות מהירות */}
      <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-md mb-5">
        <div className="relative bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 text-white p-5">
          <div className="pointer-events-none absolute -top-10 -left-10 w-44 h-44 rounded-full bg-cyan-400/20 blur-2xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-14 right-1/3 w-40 h-40 rounded-full bg-orange-400/15 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-lg flex flex-col items-center justify-center shrink-0" aria-hidden="true">
              <span className="text-[10px] text-white/80 leading-none">קריאה</span>
              <span className="text-lg font-bold leading-tight">#{(call as any).call_number || "—"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold truncate">{getJobTypeLabel(call.job_type)}</h2>
                <Badge className={statusColors[call.status]}>{statusLabels[call.status]}</Badge>
                {(call as any).priority && (call as any).priority !== "medium" && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[(call as any).priority]}`}>
                    {priorityLabels[(call as any).priority] || (call as any).priority}
                  </span>
                )}
              </div>
              <button
                className="text-white/80 text-sm mt-0.5 flex items-center gap-1.5 hover:underline"
                onClick={() => navigate(`/customers/${call.customer_id}`)}
              >
                <User className="w-3.5 h-3.5 shrink-0" /> {customer?.name}
              </button>
              {(customer?.city || customer?.address) && (
                <p className="text-white/70 text-sm mt-0.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {[customer?.city, customer?.address].filter(Boolean).join(" ")}
                </p>
              )}
              {call.scheduled_date && (
                <p className="text-white/70 text-sm mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> {new Date(call.scheduled_date).toLocaleDateString("he-IL")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* פעולות מהירות */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
          {customer?.phone && !isContractor ? (
            <Button asChild variant="outline" className="h-12 gap-2 text-base font-semibold bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
              <a href={`tel:${customer.phone}`} aria-label={`חייג אל ${customer?.name}`}>
                <Phone className="w-5 h-5" /> חייג
              </a>
            </Button>
          ) : <span className="hidden sm:block" />}
          {customer?.phone && !isContractor ? (
            <Button asChild variant="outline" className="h-12 gap-2 text-base font-semibold bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300">
              <a href={toWhatsApp(customer.phone)} target="_blank" rel="noopener noreferrer" aria-label={`וואטסאפ אל ${customer?.name}`}>
                <MessageCircle className="w-5 h-5" /> וואטסאפ
              </a>
            </Button>
          ) : <span className="hidden sm:block" />}
          {(customer?.address || customer?.city) ? (
            <Button asChild variant="outline" className="h-12 gap-2 text-base font-semibold bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300">
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent([customer?.address, customer?.city].filter(Boolean).join(", "))}&navigate=yes`}
                target="_blank" rel="noopener noreferrer" aria-label="נווט לכתובת הלקוח"
              >
                <Navigation className="w-5 h-5" /> ניווט
              </a>
            </Button>
          ) : <span className="hidden sm:block" />}
          {canEdit && call.status !== "completed" && call.status !== "cancelled" && (
            <Button
              className="h-12 gap-2 text-base font-semibold bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
              onClick={() => setShowCompleteDialog(true)}
            >
              <Check className="w-5 h-5" /> סגור קריאה
            </Button>
          )}
        </div>

        {/* פעולות מסמכים */}
        {canEdit && (
          <div className="flex gap-2 flex-wrap px-3 pb-3">
            <Button variant="outline" size="sm" onClick={handleCreateReport} className="h-9 gap-1.5">
              <FileText className="w-4 h-4" /> דוח עבודה
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-9 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
              onClick={() => {
                setInvoiceDesc(call?.job_type || "שירות אינסטלציה");
                setShowInvoiceDialog(true);
              }}
            >
              <Receipt className="w-4 h-4" /> צור חשבונית
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" dir="rtl">
        <TabsList className="mb-4 h-12 w-full justify-start overflow-x-auto">
          <TabsTrigger value="details" className="text-base px-5 h-10">פרטי קריאה</TabsTrigger>
          <TabsTrigger value="diagnosis" className="text-base px-5 h-10">אבחון</TabsTrigger>
          <TabsTrigger value="media" className="text-base px-5 h-10">
            מדיה ({photos.length + videos.length})
          </TabsTrigger>
          <TabsTrigger value="materials" className="text-base px-5 h-10">חומרים</TabsTrigger>
          <TabsTrigger value="quotes" className="text-base px-5 h-10">הצעות מחיר</TabsTrigger>
          <TabsTrigger value="reports" className="text-base px-5 h-10">דוחות</TabsTrigger>
        </TabsList>

        <TabsContent value="materials">
          <MaterialsTab serviceCallId={id!} readOnly={isContractor} />
        </TabsContent>

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
                {isContractor ? (
                  <p className="mt-1 text-sm whitespace-pre-wrap min-h-[2rem]">{call.description || "—"}</p>
                ) : (
                  <Textarea
                    value={call.description || ""}
                    onChange={(e) => setCall({ ...call, description: e.target.value })}
                    placeholder="תאר את התלונה..."
                    rows={4}
                    className="mt-1"
                  />
                )}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                {isContractor ? (
                  <p className="mt-1 text-sm whitespace-pre-wrap min-h-[2rem]">{(call as any).notes || "—"}</p>
                ) : (
                  <Textarea
                    value={(call as any).notes || ""}
                    onChange={(e) => setCall({ ...call, notes: e.target.value })}
                    placeholder="הערות נוספות..."
                    rows={3}
                    className="mt-1"
                  />
                )}
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
            onDataUpdate={setCall}
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
          <QuotesList serviceCallId={id!} readOnly={isContractor} />
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קריאת שירות</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את קריאה #{call?.call_number} של {customer?.name}?
              פעולה זו תמחק גם את כל התמונות, הסרטונים, הצעות המחיר והדוחות המשויכים. לא ניתן לבטל פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDeleting(true);
                const { error } = await supabase.from("service_calls").delete().eq("id", id!);
                if (error) {
                  toast({ title: "שגיאה", description: "לא ניתן למחוק את הקריאה", variant: "destructive" });
                  setDeleting(false);
                } else {
                  toast({ title: "נמחק", description: `קריאה #${call?.call_number} נמחקה בהצלחה` });
                  navigate(`/customers/${call?.customer_id}`);
                }
              }}
            >
              {deleting ? "מוחק..." : "מחק קריאה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              צור חשבונית מס קבלה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-1">לקוח</p>
              <p className="text-sm text-muted-foreground">{customer?.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">תיאור העבודה</label>
              <Input
                value={invoiceDesc}
                onChange={e => setInvoiceDesc(e.target.value)}
                placeholder="שירות אינסטלציה"
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">סכום (₪) — ללא מע"מ (עוסק פטור)</label>
              <Input
                type="number"
                value={invoiceAmount}
                onChange={e => setInvoiceAmount(e.target.value)}
                placeholder="0"
                dir="ltr"
                className="text-right"
              />
              {invoiceAmount && !isNaN(Number(invoiceAmount)) && (
                <p className="text-xs text-muted-foreground mt-1">
                  סה"כ לתשלום: ₪{Number(invoiceAmount).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={handleCreateInvoice}
              disabled={invoiceLoading || !invoiceAmount}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {invoiceLoading ? "יוצר חשבונית..." : "צור חשבונית ביש חשבונית"}
            </Button>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* סגירת קריאה — דיאלוג משותף עם התאמה חכמה לחוב פתוח */}
      <CompleteCallDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        call={call ? { id: id!, customer_id: call.customer_id, job_type: call.job_type, customers: customer } : null}
        onCompleted={() => {
          setCall({ ...call, status: "completed" });
          refreshPhotos();
        }}
      />
    {showPendingPaymentDialog && (
      <PendingPaymentDialog
        open={showPendingPaymentDialog}
        onClose={() => setShowPendingPaymentDialog(false)}
        serviceCall={call}
        onSuccess={() => setCall({ ...call, status: "awaiting_payment", pending_payment_at: new Date().toISOString() })}
      />
    )}
    </AppLayout>
  );
};

export default ServiceCallDetail;
