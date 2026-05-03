import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import {
  ArrowRight, Edit, Phone, Mail, MapPin, Plus, Calendar, Trash2, DollarSign, Check, X,
  FileText, MessageCircle, ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { BillingTab } from "@/components/billing/BillingTab";
import { CustomerBillingBadge } from "@/components/billing/CustomerBillingBadge";
import { CustomerExpensesTab } from "@/components/expenses/CustomerExpensesTab";
import { useCustomerBilling } from "@/hooks/useCustomerBilling";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Customer = Tables<"customers">;

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
import { getJobTypeLabel } from "@/lib/constants";
import { leadSourceLabels, leadSourceColors } from "@/lib/constants";

const serviceTypeLabels: Record<string, string> = {
  leak_detection: "איתור נזילה",
  sewer_camera: "צילום קו ביוב",
  pressure_test: "בדיקת לחץ",
  other: "אחר",
  // legacy types
  "תיקון": "תיקון", "התקנה": "התקנה", "תחזוקה": "תחזוקה",
  "בדיקה": "בדיקה", "ייעוץ": "ייעוץ", "אחר": "אחר",
};

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const { logAction } = useAuditLog();
  const isContractor = role === "contractor";
  const canEdit = isAdmin;
  const canCreateCall = isAdmin || role === "technician";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingLeadCost, setEditingLeadCost] = useState(false);
  const [leadCostInput, setLeadCostInput] = useState("");
  const [savingLeadCost, setSavingLeadCost] = useState(false);
  const billing = useCustomerBilling(id);

  useEffect(() => {
    if (!user || !id) return;
    loadData();
  }, [user, id]);

  const loadData = async () => {
    const [custRes, callsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id!).single(),
      supabase.from("service_calls").select("*").eq("customer_id", id!).order("created_at", { ascending: false }),
    ]);

    // Load reports for this customer (via service_calls)
    if (callsRes.data && callsRes.data.length > 0) {
      const callIds = callsRes.data.map((c: any) => c.id);
      const { data: reportsData } = await supabase
        .from("reports")
        .select("*, report_shares(share_token, is_active, revoked_at)")
        .in("service_call_id", callIds)
        .order("created_at", { ascending: false });
      setReports(reportsData || []);
    }

    if (custRes.error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הלקוח", variant: "destructive" });
      navigate("/customers");
      return;
    }

    setCustomer(custRes.data);
    setCalls(callsRes.data || []);
    setLeadCostInput((custRes.data as any).lead_cost != null ? String((custRes.data as any).lead_cost) : "");
    setLoading(false);

    logAction({
      action: "view_customer",
      resource_type: "customer",
      resource_id: id!,
      resource_label: custRes.data.name,
    });
  };

  const saveLeadCost = async () => {
    if (!customer) return;
    setSavingLeadCost(true);
    const val = leadCostInput !== "" ? parseFloat(leadCostInput) : null;
    const { error } = await supabase.from("customers").update({ lead_cost: val } as any).eq("id", id!);
    if (!error) {
      setCustomer({ ...customer, ...({ lead_cost: val } as any) });
      toast({ title: "נשמר", description: "עלות הליד עודכנה בהצלחה" });
    }
    setEditingLeadCost(false);
    setSavingLeadCost(false);
  };

  if (loading) {
    return <AppLayout title="טוען..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  if (!customer) return null;

  return (
    <AppLayout title={customer.name}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/customers")} className="gap-2">
            <ArrowRight className="w-4 h-4" /> חזרה ללקוחות
          </Button>
          <CustomerBillingBadge summary={billing} size="md" />
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/customers/${id}/edit`)} className="gap-2">
              <Edit className="w-4 h-4" /> עריכה
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4" /> מחיקה
            </Button>
          </div>
        )}
        {!isAdmin && canEdit && (
          <Button variant="outline" onClick={() => navigate(`/customers/${id}/edit`)} className="gap-2">
            <Edit className="w-4 h-4" /> עריכה
          </Button>
        )}
      </div>

      <Tabs defaultValue="calls" dir="rtl">
        <TabsList className="mb-4 h-12 w-full justify-start">
          <TabsTrigger value="calls" className="text-base px-4 h-10">
            קריאות ({calls.length})
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-base px-4 h-10">
            דוחות {reports.length > 0 && `(${reports.length})`}
          </TabsTrigger>
          <TabsTrigger value="details" className="text-base px-4 h-10">
            פרטים
          </TabsTrigger>
          <TabsTrigger value="billing" className="text-base px-4 h-10">
            חשבון
          </TabsTrigger>
        </TabsList>

        {/* Service Calls Tab (DEFAULT) */}
        <TabsContent value="calls">
          {canCreateCall && (
            <div className="flex justify-end mb-4">
              <Button onClick={() => navigate(`/service-calls/new/${id}`)} className="gap-2">
                <Plus className="w-4 h-4" /> קריאה חדשה
              </Button>
            </div>
          )}

          {calls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין קריאות שירות ללקוח זה</p>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => (
                <Card
                  key={call.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/service-calls/${call.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-muted-foreground">
                            #{(call as any).call_number || "—"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {getJobTypeLabel(call.job_type)}
                            </span>
                            <Badge variant="outline" className={`text-xs ${statusColors[call.status]}`}>
                              {statusLabels[call.status]}
                            </Badge>
                            {(call as any).priority && (call as any).priority !== "medium" && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[(call as any).priority]}`}>
                                {priorityLabels[(call as any).priority]}
                              </span>
                            )}
                          </div>
                          {call.description && (
                            <p className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                              {call.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(call.created_at).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין דוחות עבור לקוח זה עדיין</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => {
                const activeShare = (report.report_shares || []).find(
                  (s: any) => s.is_active && !s.revoked_at
                );
                const shareUrl = activeShare
                  ? `${window.location.origin}/r/${activeShare.share_token}`
                  : null;
                const customerPhone = customer?.phone;
                const waText = shareUrl
                  ? encodeURIComponent(`שלום, מצורף דוח עבודה לעיון וחתימה:\n${shareUrl}`)
                  : null;
                const waUrl = shareUrl && customerPhone
                  ? `https://wa.me/972${customerPhone.replace(/^0/, "")}?text=${waText}`
                  : shareUrl
                  ? `https://wa.me/?text=${waText}`
                  : null;

                const reportStatusColors: Record<string, string> = {
                  draft: "bg-warning/15 text-warning",
                  sent: "bg-primary/15 text-primary",
                  signed: "bg-success/15 text-success",
                  final: "bg-muted text-muted-foreground",
                };
                const reportStatusLabels: Record<string, string> = {
                  draft: "טיוטה", sent: "נשלח", signed: "נחתם", final: "סופי",
                };

                return (
                  <div
                    key={report.id}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{report.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${reportStatusColors[report.status] || ""}`}>
                          {reportStatusLabels[report.status] || report.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(report.created_at).toLocaleDateString("he-IL")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {shareUrl && (
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="צפה בדוח"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                          title={customerPhone ? `שלח לוואטסאפ ${customerPhone}` : "שלח בוואטסאפ"}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/reports/${report.id}`)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                      >
                        פתח
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פרטי לקוח</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isContractor ? (
                <div className="text-sm text-muted-foreground">
                  <p>שם: {customer.name}</p>
                  {customer.city && <p>עיר: {customer.city}</p>}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {customer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span dir="ltr">{customer.phone}</span>
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span dir="ltr">{customer.email}</span>
                      </div>
                    )}
                    {(customer.city || customer.address) && (
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{[customer.city, customer.address].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                  </div>
                  {customer.notes && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{customer.notes}</p>
                    </div>
                  )}
                  {(customer as any).lead_source && (
                    <div className="pt-2 border-t border-border flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${leadSourceColors[(customer as any).lead_source] || "bg-muted"}`} />
                      <span className="text-sm font-medium">
                        מקור: {leadSourceLabels[(customer as any).lead_source] || (customer as any).lead_source}
                      </span>
                      {(customer as any).lead_source_note && (
                        <span className="text-sm text-muted-foreground">
                          — {(customer as any).lead_source_note}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Lead Cost - editable inline */}
                  {isAdmin && (customer as any).lead_source && (
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">עלות ליד:</span>
                        {editingLeadCost ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-7 w-28 text-sm"
                              value={leadCostInput}
                              onChange={(e) => setLeadCostInput(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") saveLeadCost(); if (e.key === "Escape") setEditingLeadCost(false); }}
                            />
                            <button onClick={saveLeadCost} disabled={savingLeadCost} className="text-success hover:opacity-70">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingLeadCost(false)} className="text-muted-foreground hover:opacity-70">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingLeadCost(true)}
                            className="text-sm font-medium hover:underline text-foreground flex items-center gap-1"
                          >
                            {(customer as any).lead_cost != null
                              ? `₪${Number((customer as any).lead_cost).toLocaleString("he-IL")}`
                              : <span className="text-muted-foreground italic">לא הוזן — לחץ לעריכה</span>}
                            <Edit className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Combined Billing & Expenses Tab */}
        <TabsContent value="billing">
          <div className="space-y-8">
            <BillingTab
              customerId={id!}
              customerName={customer.name}
              customerPhone={customer.phone}
              customerCity={customer.city}
              customerAddress={customer.address}
              onBillingChange={billing.refresh}
            />
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold mb-4">עלות עבודה בפועל</h3>
              <CustomerExpensesTab customerId={id!} customerName={customer.name} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת לקוח</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הלקוח "{customer.name}"?
              פעולה זו לא ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDeleting(true);
                const { error } = await supabase.from("customers").delete().eq("id", id!);
                if (error) {
                  toast({ title: "שגיאה", description: "לא ניתן למחוק את הלקוח. ייתכן שיש קריאות שירות משויכות.", variant: "destructive" });
                  setDeleting(false);
                } else {
                  toast({ title: "נמחק", description: `הלקוח "${customer.name}" נמחק בהצלחה` });
                  navigate("/customers");
                }
              }}
            >
              {deleting ? "מוחק..." : "מחק לקוח"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CustomerDetail;
