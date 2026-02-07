import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BanUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: (bannedUntil: string, reason: string) => void;
}

export function BanUserDialog({ open, onOpenChange, userName, onConfirm }: BanUserDialogProps) {
  const [duration, setDuration] = useState("7d");
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    let bannedUntil: Date;
    const now = new Date();

    switch (duration) {
      case "1d":
        bannedUntil = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        break;
      case "7d":
        bannedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        bannedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        bannedUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case "forever":
        bannedUntil = new Date("2099-12-31T23:59:59Z");
        break;
      default:
        bannedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    onConfirm(bannedUntil.toISOString(), reason);
    setDuration("7d");
    setReason("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>חסימת משתמש</AlertDialogTitle>
          <AlertDialogDescription>
            האם אתה בטוח שברצונך לחסום את <strong>{userName}</strong>? המשתמש לא יוכל להיכנס למערכת עד לסיום תקופת החסימה.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm">משך החסימה</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">יום אחד</SelectItem>
                <SelectItem value="7d">שבוע</SelectItem>
                <SelectItem value="30d">חודש</SelectItem>
                <SelectItem value="90d">3 חודשים</SelectItem>
                <SelectItem value="forever">לצמיתות</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">סיבת החסימה (אופציונלי)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="הכנס סיבה..."
            />
          </div>
        </div>
        <AlertDialogFooter className="flex-row-reverse gap-2">
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            חסום משתמש
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
