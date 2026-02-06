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

const CustomerForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "", notes: "",
  });

  useEffect(() => {
    if (isEdit && user) loadCustomer();
  }, [id, user]);

  const loadCustomer = async () => {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את פרטי הלקוח", variant: "destructive" });
      navigate("/customers");
    } else if (data) {
      setForm({
        name: data.name, phone: data.phone || "", email: data.email || "",
        address: data.address || "", city: data.city || "", notes: data.notes || "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      if (isEdit) {
        const { error } = await supabase.from("customers").update(form).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן בהצלחה", description: "פרטי הלקוח עודכנו" });
        navigate(`/customers/${id}`);
      } else {
        const { data, error } = await supabase.from("customers").insert({ ...form, created_by: user.id }).select().single();
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
