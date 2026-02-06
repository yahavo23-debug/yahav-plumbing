import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { User, Shield } from "lucide-react";

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "הפרופיל עודכן בהצלחה" });
    }
    setSaving(false);
  };

  if (loading) {
    return <AppLayout title="הגדרות"><p className="text-center py-8 text-muted-foreground">טוען...</p></AppLayout>;
  }

  return (
    <AppLayout title="הגדרות">
      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> פרטי משתמש
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">אימייל</Label>
              <Input value={user?.email || ""} disabled className="mt-1 bg-muted" />
            </div>
            <div>
              <Label className="text-sm">שם מלא</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="הכנס שם מלא"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">טלפון</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="הכנס מספר טלפון"
                className="mt-1"
                dir="ltr"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="h-10">
              {saving ? "שומר..." : "שמור שינויים"}
            </Button>
          </CardContent>
        </Card>

        {/* Role info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" /> הרשאות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <strong>תפקיד:</strong>{" "}
              <span className={isAdmin ? "text-primary font-medium" : "text-muted-foreground"}>
                {isAdmin ? "מנהל" : "טכנאי"}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Settings;
