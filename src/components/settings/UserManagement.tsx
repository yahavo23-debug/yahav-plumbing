import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users, Copy, Check, UserPlus, Shield, Wrench, ClipboardList,
  UserX, HardHat, Settings2, Ban, Trash2, ShieldOff, Mail, Pencil,
} from "lucide-react";
import { ContractorAccessDialog } from "./ContractorAccessDialog";
import { BanUserDialog } from "./BanUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { EditUserProfileDialog } from "./EditUserProfileDialog";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  id_number: string | null;
  email: string | null;
  role: "admin" | "technician" | "secretary" | "contractor" | null;
  banned_until: string | null;
  ban_reason: string | null;
}

const getPublicBaseUrl = (): string => {
  const origin = window.location.origin;
  if (
    origin.includes("preview--") ||
    origin.includes("lovableproject.com") ||
    origin.includes("localhost")
  ) {
    return "https://soft-spark-story.lovable.app";
  }
  return origin;
};

export function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [contractorDialog, setContractorDialog] = useState<{
    open: boolean;
    userId: string;
    name: string;
  }>({ open: false, userId: "", name: "" });
  const [banDialog, setBanDialog] = useState<{
    open: boolean;
    userId: string;
    name: string;
  }>({ open: false, userId: "", name: "" });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    userId: string;
    name: string;
  }>({ open: false, userId: "", name: "" });
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    userId: string;
    name: string;
    phone: string | null;
    idNumber: string | null;
    fullName: string | null;
  }>({ open: false, userId: "", name: "", phone: null, idNumber: null, fullName: null });

  const signupUrl = `${getPublicBaseUrl()}/auth`;

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    // Fetch profiles with ban info
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, banned_until, ban_reason, id_number")
      .order("created_at", { ascending: true });

    if (pErr) {
      console.error("Error loading profiles:", pErr);
      setLoading(false);
      return;
    }

    // Fetch roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const roleMap = new Map<string, "admin" | "technician" | "secretary" | "contractor">();
    roles?.forEach((r) => roleMap.set(r.user_id, r.role as any));

    // Fetch emails from edge function
    let emailMap = new Map<string, string>();
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (session) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=list`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        if (res.ok) {
          const result = await res.json();
          result.users?.forEach((u: any) => emailMap.set(u.id, u.email));
        }
      }
    } catch (err) {
      console.error("Error fetching emails:", err);
    }

    const merged: UserProfile[] = (profiles || []).map((p: any) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      phone: p.phone,
      id_number: p.id_number || null,
      email: emailMap.get(p.user_id) || null,
      role: roleMap.get(p.user_id) || null,
      banned_until: p.banned_until,
      ban_reason: p.ban_reason,
    }));

    setUsers(merged);
    setLoading(false);
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (targetUserId === user?.id) {
      toast({ title: "שגיאה", description: "לא ניתן לשנות את התפקיד שלך", variant: "destructive" });
      return;
    }

    const targetUser = users.find(u => u.user_id === targetUserId);
    if (targetUser?.role === "admin" && newRole !== "admin") {
      toast({ title: "שגיאה", description: "לא ניתן להסיר תפקיד מנהל ממשתמש אחר", variant: "destructive" });
      return;
    }

    setUpdating(targetUserId);

    try {
      if (newRole === "none") {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", targetUserId);
        if (error) throw error;
      } else {
        const { data: existing } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", targetUserId)
          .limit(1);

        if (existing && existing.length > 0) {
          const { error } = await supabase
            .from("user_roles")
            .update({ role: newRole as any })
            .eq("user_id", targetUserId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: targetUserId, role: newRole as any });
          if (error) throw error;
        }
      }

      toast({ title: "עודכן", description: "התפקיד עודכן בהצלחה" });
      await loadUsers();
    } catch (err: any) {
      console.error("Role update error:", err);
      toast({ title: "שגיאה", description: "לא ניתן לעדכן את התפקיד", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleBanUser = async (bannedUntil: string, reason: string) => {
    setUpdating(banDialog.userId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=ban`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session!.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ userId: banDialog.userId, bannedUntil, reason }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast({ title: "נחסם", description: `${banDialog.name} נחסם מהמערכת` });
      setBanDialog({ open: false, userId: "", name: "" });
      await loadUsers();
    } catch (err: any) {
      console.error("Ban error:", err);
      toast({ title: "שגיאה", description: err.message || "לא ניתן לחסום", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setUpdating(userId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=unban`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session!.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast({ title: "בוטל", description: "החסימה בוטלה בהצלחה" });
      await loadUsers();
    } catch (err: any) {
      console.error("Unban error:", err);
      toast({ title: "שגיאה", description: err.message || "לא ניתן לבטל חסימה", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteUser = async () => {
    setUpdating(deleteDialog.userId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=delete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session!.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ userId: deleteDialog.userId }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast({ title: "נמחק", description: `${deleteDialog.name} נמחק מהמערכת` });
      setDeleteDialog({ open: false, userId: "", name: "" });
      await loadUsers();
    } catch (err: any) {
      console.error("Delete error:", err);
      toast({ title: "שגיאה", description: err.message || "לא ניתן למחוק", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleCopySignupUrl = async () => {
    await navigator.clipboard.writeText(signupUrl);
    setCopied(true);
    toast({ title: "הועתק!", description: "קישור ההרשמה הועתק ללוח" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppInvite = () => {
    const text = encodeURIComponent(`הוזמנת להצטרף ל-Yahav CRM. הירשם כאן: ${signupUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const isUserBanned = (u: UserProfile) => {
    return u.banned_until && new Date(u.banned_until) > new Date();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">טוען...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> סוגי הרשאות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex items-start gap-2">
              <Badge variant="default" className="shrink-0 gap-1"><Shield className="w-3 h-3" /> מנהל</Badge>
              <span className="text-muted-foreground">גישה מלאה לכל המערכת, כולל ניהול משתמשים והרשאות</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="shrink-0 gap-1"><Wrench className="w-3 h-3" /> טכנאי</Badge>
              <span className="text-muted-foreground">צפייה ועבודה על קריאות שירות שהוקצו לו, לא יכול למחוק</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="shrink-0 gap-1"><ClipboardList className="w-3 h-3" /> מזכירה</Badge>
              <span className="text-muted-foreground">צפייה בכל המידע, יכולה לפתוח לקוח חדש בלבד</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="shrink-0 gap-1"><HardHat className="w-3 h-3" /> קבלן</Badge>
              <span className="text-muted-foreground">צפייה בלקוחות שהוקצו לו בלבד, לא יכול לשנות דבר</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="shrink-0 gap-1"><UserX className="w-3 h-3" /> ללא תפקיד</Badge>
              <span className="text-muted-foreground">אין גישה למערכת - ממתין לאישור מנהל</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invite link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> הזמנת עובד חדש
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            שלח את הקישור הזה לעובדים חדשים כדי שיירשמו למערכת. אחרי ההרשמה, תוכל להגדיר להם תפקיד.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={signupUrl}
              className="flex-1 text-sm bg-muted rounded-md px-3 py-2 border border-input text-left"
              dir="ltr"
            />
            <Button variant="outline" size="icon" onClick={handleCopySignupUrl}>
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCopySignupUrl} variant="outline" className="flex-1 gap-2" size="sm">
              <Copy className="w-4 h-4" /> העתק קישור
            </Button>
            <Button onClick={handleWhatsAppInvite} className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white" size="sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              שלח בוואטסאפ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> ניהול משתמשים ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {users.map((u) => {
              const isCurrentUser = u.user_id === user?.id;
              const isTargetAdmin = u.role === "admin" && !isCurrentUser;
              const banned = isUserBanned(u);
              return (
                <div key={u.user_id} className={`py-3 space-y-2 ${banned ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {u.full_name || "ללא שם"}
                        </span>
                        {isCurrentUser && (
                          <Badge variant="secondary" className="text-xs shrink-0">אתה</Badge>
                        )}
                        {!u.role && !isCurrentUser && (
                          <Badge variant="outline" className="text-xs shrink-0 text-orange-600 border-orange-300">ממתין</Badge>
                        )}
                        {banned && (
                          <Badge variant="destructive" className="text-xs shrink-0 gap-1">
                            <Ban className="w-3 h-3" /> חסום
                          </Badge>
                        )}
                      </div>
                      {u.email && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground" dir="ltr">{u.email}</p>
                        </div>
                      )}
                      {u.phone && (
                        <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{u.phone}</p>
                      )}
                      {u.id_number && (
                        <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">ת.ז: {u.id_number}</p>
                      )}
                      {banned && u.banned_until && (
                        <p className="text-xs text-destructive mt-0.5">
                          חסום עד: {new Date(u.banned_until).getFullYear() >= 2099
                            ? "לצמיתות"
                            : format(new Date(u.banned_until), "dd/MM/yyyy HH:mm", { locale: he })}
                          {u.ban_reason && ` • סיבה: ${u.ban_reason}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isCurrentUser ? (
                        <Badge className="gap-1">
                          <Shield className="w-3 h-3" /> מנהל
                        </Badge>
                      ) : isTargetAdmin ? (
                        <Badge className="gap-1">
                          <Shield className="w-3 h-3" /> מנהל
                        </Badge>
                      ) : (
                        <Select
                          value={u.role || "none"}
                          onValueChange={(val) => handleRoleChange(u.user_id, val)}
                          disabled={updating === u.user_id}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="technician">
                              <span className="flex items-center gap-1.5">
                                <Wrench className="w-3 h-3" /> טכנאי
                              </span>
                            </SelectItem>
                            <SelectItem value="secretary">
                              <span className="flex items-center gap-1.5">
                                <ClipboardList className="w-3 h-3" /> מזכירה
                              </span>
                            </SelectItem>
                            <SelectItem value="contractor">
                              <span className="flex items-center gap-1.5">
                                <HardHat className="w-3 h-3" /> קבלן
                              </span>
                            </SelectItem>
                            <SelectItem value="admin">
                              <span className="flex items-center gap-1.5">
                                <Shield className="w-3 h-3" /> מנהל
                              </span>
                            </SelectItem>
                            <SelectItem value="none">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <UserX className="w-3 h-3" /> ללא תפקיד
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  {/* Action buttons for non-current, non-admin users */}
                  {!isCurrentUser && !isTargetAdmin && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          setEditDialog({
                            open: true,
                            userId: u.user_id,
                            name: u.full_name || "משתמש",
                            phone: u.phone,
                            idNumber: u.id_number,
                            fullName: u.full_name,
                          })
                        }
                      >
                        <Pencil className="w-3 h-3" /> ערוך פרטים
                      </Button>
                      {u.role === "contractor" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            setContractorDialog({
                              open: true,
                              userId: u.user_id,
                              name: u.full_name || "קבלן",
                            })
                          }
                        >
                          <Settings2 className="w-3 h-3" /> גישת לקוחות
                        </Button>
                      )}
                      {banned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleUnbanUser(u.user_id)}
                          disabled={updating === u.user_id}
                        >
                          <ShieldOff className="w-3 h-3" /> בטל חסימה
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                          onClick={() =>
                            setBanDialog({
                              open: true,
                              userId: u.user_id,
                              name: u.full_name || "משתמש",
                            })
                          }
                          disabled={updating === u.user_id}
                        >
                          <Ban className="w-3 h-3" /> חסום
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() =>
                          setDeleteDialog({
                            open: true,
                            userId: u.user_id,
                            name: u.full_name || "משתמש",
                          })
                        }
                        disabled={updating === u.user_id}
                      >
                        <Trash2 className="w-3 h-3" /> מחק
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">אין משתמשים רשומים</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ContractorAccessDialog
        open={contractorDialog.open}
        onOpenChange={(open) => setContractorDialog((prev) => ({ ...prev, open }))}
        contractorUserId={contractorDialog.userId}
        contractorName={contractorDialog.name}
      />
      <BanUserDialog
        open={banDialog.open}
        onOpenChange={(open) => setBanDialog((prev) => ({ ...prev, open }))}
        userName={banDialog.name}
        onConfirm={handleBanUser}
      />
      <DeleteUserDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
        userName={deleteDialog.name}
        onConfirm={handleDeleteUser}
      />
      <EditUserProfileDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}
        userId={editDialog.userId}
        userName={editDialog.name}
        currentPhone={editDialog.phone}
        currentIdNumber={editDialog.idNumber}
        currentFullName={editDialog.fullName}
        onSaved={loadUsers}
      />
    </div>
  );
}
