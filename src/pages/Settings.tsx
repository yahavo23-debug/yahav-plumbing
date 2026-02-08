import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { User, Shield, Wrench, ClipboardList, HardHat } from "lucide-react";
import { UserManagement } from "@/components/settings/UserManagement";
import { AuditLogViewer } from "@/components/settings/AuditLogViewer";
import { LogoUpload } from "@/components/settings/LogoUpload";

const ROLE_DISPLAY: Record<string, { label: string; icon: React.ReactNode }> = {
  admin: { label: "מנהל", icon: <Shield className="w-3.5 h-3.5" /> },
  technician: { label: "טכנאי", icon: <Wrench className="w-3.5 h-3.5" /> },
  secretary: { label: "מזכירה", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  contractor: { label: "קבלן", icon: <HardHat className="w-3.5 h-3.5" /> },
};

const Settings = () => {
  const { user, isAdmin, role } = useAuth();
  const isContractor = role === "contractor";
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone, id_number")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setIdNumber((data as any).id_number || "");
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
        id_number: idNumber.trim() || null,
      } as any)
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

  const roleInfo = role ? ROLE_DISPLAY[role] : null;

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
              <div className="mt-1 text-sm py-2 px-3 bg-muted rounded-md">{user?.email || ""}</div>
            </div>
            {isContractor ? (
              <>
                <div>
                  <Label className="text-sm">שם מלא</Label>
                  <div className="mt-1 text-sm py-2 px-3 bg-muted rounded-md">{fullName || "—"}</div>
                </div>
                <div>
                  <Label className="text-sm">טלפון</Label>
                  <div className="mt-1 text-sm py-2 px-3 bg-muted rounded-md" dir="ltr">{phone || "—"}</div>
                </div>
                <div>
                  <Label className="text-sm">תעודת זהות</Label>
                  <div className="mt-1 text-sm py-2 px-3 bg-muted rounded-md" dir="ltr">{idNumber || "—"}</div>
                </div>
              </>
            ) : (
              <>
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
                <div>
                  <Label className="text-sm">תעודת זהות</Label>
                  <Input
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="הכנס מספר תעודת זהות"
                    className="mt-1"
                    dir="ltr"
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="h-10">
                  {saving ? "שומר..." : "שמור שינויים"}
                </Button>
              </>
            )}
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">תפקיד:</span>
              {roleInfo ? (
                <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1">
                  {roleInfo.icon} {roleInfo.label}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">ללא תפקיד</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Admin-only: Logo */}
        {isAdmin && <LogoUpload />}

        {/* Admin-only: User Management */}
        {isAdmin && <UserManagement />}

        {/* Admin-only: Audit Log */}
        {isAdmin && <AuditLogViewer />}
      </div>
    </AppLayout>
  );
};

export default Settings;
