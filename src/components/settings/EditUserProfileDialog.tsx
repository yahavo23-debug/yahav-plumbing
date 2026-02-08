import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditUserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentPhone: string | null;
  currentIdNumber: string | null;
  currentFullName: string | null;
  onSaved: () => void;
}

export function EditUserProfileDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentPhone,
  currentIdNumber,
  currentFullName,
  onSaved,
}: EditUserProfileDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(currentFullName || "");
      setPhone(currentPhone || "");
      setIdNumber(currentIdNumber || "");
    }
  }, [open, currentFullName, currentPhone, currentIdNumber]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          id_number: idNumber.trim() || null,
        } as any)
        .eq("user_id", userId);

      if (error) throw error;

      toast({ title: "נשמר", description: `פרטי ${userName} עודכנו בהצלחה` });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      console.error("Update profile error:", err);
      toast({ title: "שגיאה", description: "לא ניתן לשמור את השינויים", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת פרטי {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm">שם מלא</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="הכנס שם מלא"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">טלפון</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0501234567"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">תעודת זהות</Label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="123456789"
              dir="ltr"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "שומר..." : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
