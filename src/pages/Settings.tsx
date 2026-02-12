import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { User, Shield, Wrench, ClipboardList, HardHat, Cloud, Database, RefreshCw } from "lucide-react";
import { UserManagement } from "@/components/settings/UserManagement";
import { AuditLogViewer } from "@/components/settings/AuditLogViewer";
import { LogoUpload } from "@/components/settings/LogoUpload";

const ROLE_DISPLAY: Record<string, { label: string; icon: React.ReactNode }> = {
  admin: { label: "מנהל", icon: <Shield className="w-3.5 h-3.5" /> },
  technician: { label: "טכנאי", icon: <Wrench className="w-3.5 h-3.5" /> },
  secretary: { label: "מזכירה", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  contractor: { label: "קבלן", icon: <HardHat className="w-3.5 h-3.5" /> },
};

const DB_LIMIT_MB = 500;
const STORAGE_LIMIT_MB = 1024; // 1 GB

const CloudStorageInfo = () => {
  const [dbSizeMB, setDbSizeMB] = useState<number | null>(null);
  const [storageSizeMB, setStorageSizeMB] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSize = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke("get-db-size", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!error && data) {
        if (data.db_size_bytes) setDbSizeMB(Math.round((data.db_size_bytes / (1024 * 1024)) * 10) / 10);
        if (data.storage_size_bytes != null) setStorageSizeMB(Math.round((data.storage_size_bytes / (1024 * 1024)) * 10) / 10);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSize(); }, []);

  const dbPct = dbSizeMB != null ? Math.min((dbSizeMB / DB_LIMIT_MB) * 100, 100) : 0;
  const storagePct = storageSizeMB != null ? Math.min((storageSizeMB / STORAGE_LIMIT_MB) * 100, 100) : 0;

  const formatSize = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;

  return (
    <CardContent className="space-y-4">
      <div className="text-sm text-muted-foreground space-y-1">
        <p>• גיבויים מתבצעים <strong>אוטומטית</strong> על ידי התשתית.</p>
        <p>• ניתן להגדיל משאבים בהתאם לצורך.</p>
      </div>

      {/* DB size meter */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> מסד נתונים
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchSize} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {dbSizeMB != null ? (
          <>
            <Progress value={dbPct} className="h-2" />
            <p className="text-xs text-muted-foreground" dir="ltr">
              {formatSize(dbSizeMB)} / {formatSize(DB_LIMIT_MB)} ({dbPct.toFixed(1)}%)
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{loading ? "טוען..." : "לא ניתן לטעון"}</p>
        )}
      </div>

      {/* File storage meter */}
      <div className="space-y-2 rounded-lg border p-3">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Cloud className="w-3.5 h-3.5" /> אחסון קבצים (תמונות, וידאו, מסמכים)
        </span>
        {storageSizeMB != null ? (
          <>
            <Progress value={storagePct} className="h-2" />
            <p className="text-xs text-muted-foreground" dir="ltr">
              {formatSize(storageSizeMB)} / {formatSize(STORAGE_LIMIT_MB)} ({storagePct.toFixed(1)}%)
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{loading ? "טוען..." : "לא ניתן לטעון"}</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">לצפייה מפורטת — יש לגשת ללוח הבקרה דרך עורך הפרויקט (לחצן Cloud בצד שמאל).</p>
    </CardContent>
  );
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

        {/* Admin-only: Cloud Management */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cloud className="w-4 h-4" /> ניהול ענן
              </CardTitle>
            </CardHeader>
            <CloudStorageInfo />
          </Card>
        )}

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
