import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leadSources } from "@/lib/constants";

const CustomerForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [contractors, setContractors] = useState<{ user_id: string; full_name: string }[]>([]);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "", notes: "",
    lead_source: "" as string, lead_source_note: "", source_contractor_id: "",
    lead_cost: "" as string,
  });

  useEffect(() => {
    if (isEdit && user) loadCustomer();
    if (user) loadContractors();
  }, [id, user]);

  const loadContractors = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "contractor");
    if (data && data.length > 0) {
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      setContractors((profiles || []).map((p) => ({ user_id: p.user_id, full_name: p.full_name || "ללא שם" })));
    }
  };

  const loadCustomer = async () => {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את פרטי הלקוח", variant: "destructive" });
      navigate("/customers");
    } else if (data) {
      setForm({
        name: data.name, phone: data.phone || "", email: data.email || "",
        address: data.address || "", city: data.city || "", notes: data.notes || "",
        lead_source: (data as any).lead_source || "",
        lead_source_note: (data as any).lead_source_note || "",
        source_contractor_id: (data as any).source_contractor_id || "",
        lead_cost: (data as any).lead_cost != null ? String((data as any).lead_cost) : "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      const payload = {
        name: form.name, phone: form.phone || null, email: form.email || null,
        address: form.address || null, city: form.city || null, notes: form.notes || null,
        lead_source: form.lead_source || null,
        lead_source_note: form.lead_source_note || null,
        source_contractor_id: form.source_contractor_id || null,
        lead_cost: form.lead_cost ? parseFloat(form.lead_cost) : null,
      };

      if (isEdit) {
        const { error } = await supabase.from("customers").update(payload as any).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן בהצלחה", description: "פרטי הלקוח עודכנו" });
        navigate(`/customers/${id}`);
      } else {
        const { data, error } = await supabase.from("customers").insert({ ...payload, created_by: user.id } as any).select().single();
        if (error) throw error;
        toast({ title: "נוצר בהצלחה", description: "הלקוח נוסף למערכת" });
        // If returning from service-call flow, redirect to create a call
        const returnTo = new URLSearchParams(window.location.search).get("returnTo");
        if (returnTo === "service-call" && data) {
          navigate(`/service-calls/new/${data.id}`);
        } else {
          navigate("/customers");
        }
      }
    } catch (err: any) {
      console.error("Customer save error:", err);
      toast({ title: "שגיאה", description: err.message || "אירעה שגיאה בשמירה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <AppLayout title={isEdit ? "עריכת לקוח" : "לקוח חדש"}>
      <Button variant="ghost" onClick={() => navigate(isEdit ? `/customers/${id}` : "/customers")} className="mb-4 gap-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </Button>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEdit ? "עריכת פרטי לקוח" : "הוספת לקוח חדש"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>שם *</Label>
                <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>עיר</Label>
                <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>כתובת</Label>
              <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>הערות</Label>
              <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
            </div>

            {/* Lead Cost */}
            {form.lead_source && (
              <div className="space-y-2">
                <Label>עלות ליד (₪) — כמה עלה לך לגייס לקוח זה</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.lead_cost}
                  onChange={(e) => updateField("lead_cost", e.target.value)}
                />
              </div>
            )}

            {/* Lead Source */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>מקור הגעה</Label>
                <Select value={form.lead_source} onValueChange={(v) => updateField("lead_source", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מקור..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.lead_source === "referral" && (
                <div className="space-y-2">
                  <Label>שם הממליץ</Label>
                  <Input value={form.lead_source_note} onChange={(e) => updateField("lead_source_note", e.target.value)} placeholder="מי המליץ?" />
                </div>
              )}
              {form.lead_source === "contractor" && (
                <div className="space-y-2">
                  <Label>קבלן</Label>
                  <Select value={form.source_contractor_id} onValueChange={(v) => updateField("source_contractor_id", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר קבלן..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contractors.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? "שומר..." : isEdit ? "עדכן לקוח" : "הוסף לקוח"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default CustomerForm;
