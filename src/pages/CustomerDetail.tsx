import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import {
  ArrowRight, Edit, Phone, Mail, MapPin, Plus, Calendar,
} from "lucide-react";

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
  const canEdit = isAdmin;
  const canCreateCall = isAdmin || role === "technician";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    loadData();
  }, [user, id]);

  const loadData = async () => {
    const [custRes, callsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id!).single(),
      supabase.from("service_calls").select("*").eq("customer_id", id!).order("created_at", { ascending: false }),
    ]);

    if (custRes.error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הלקוח", variant: "destructive" });
      navigate("/customers");
      return;
    }

    setCustomer(custRes.data);
    setCalls(callsRes.data || []);
    setLoading(false);
  };

  if (loading) {
    return <AppLayout title="טוען..."><p className="text-center py-8">טוען...</p></AppLayout>;
  }

  if (!customer) return null;

  return (
    <AppLayout title={customer.name}>
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate("/customers")} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה ללקוחות
        </Button>
        {canEdit && (
          <Button variant="outline" onClick={() => navigate(`/customers/${id}/edit`)} className="gap-2">
            <Edit className="w-4 h-4" /> עריכה
          </Button>
        )}
      </div>

      <Tabs defaultValue="calls" dir="rtl">
        <TabsList className="mb-4 h-12 w-full justify-start">
          <TabsTrigger value="calls" className="text-base px-6 h-10">
            קריאות שירות ({calls.length})
          </TabsTrigger>
          <TabsTrigger value="details" className="text-base px-6 h-10">
            פרטים
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
                              {serviceTypeLabels[call.job_type] || call.job_type}
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

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פרטי לקוח</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default CustomerDetail;
