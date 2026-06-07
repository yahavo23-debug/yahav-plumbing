import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WalkInQuoteDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setPhone("");
    setAddress("");
    setDescription("");
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast({ title: "חסר שם", description: "יש להזין שם ללקוח המזדמן", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          is_walkin: true,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (custErr) throw custErr;

      const { data: call, error: callErr } = await supabase
        .from("service_calls")
        .insert({
          customer_id: (customer as any).id,
          job_type: "הצעת מחיר",
          description: description.trim() || null,
          status: "open",
          priority: "medium",
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (callErr) throw callErr;

      toast({ title: "נוצר", description: "פתח את עריכת הצעת המחיר" });
      reset();
      onOpenChange(false);
      navigate(`/service-calls/${(call as any).id}?tab=quotes&new=1`);
    } catch (err: any) {
      console.error("Walk-in quote error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            הצעת מחיר ללקוח מזדמן
          </DialogTitle>
          <DialogDescription>
            הלקוח לא יישמר ברשימת הלקוחות הקבועה. ניתן יהיה לשמור אותו מאוחר יותר בלחיצה על "שמור לקוח".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">שם <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הלקוח"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">טלפון</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-..."
                type="tel"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">כתובת</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="אופציונלי"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תיאור עבודה</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="אופציונלי"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
            {submitting ? "יוצר..." : "המשך להצעה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
