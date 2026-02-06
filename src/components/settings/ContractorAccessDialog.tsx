import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

interface ContractorAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorUserId: string;
  contractorName: string;
}

interface CustomerAccess {
  id: string;
  name: string;
  hasAccess: boolean;
}

export function ContractorAccessDialog({
  open,
  onOpenChange,
  contractorUserId,
  contractorName,
}: ContractorAccessDialogProps) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadData();
  }, [open, contractorUserId]);

  const loadData = async () => {
    setLoading(true);

    const [custRes, accessRes] = await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase
        .from("contractor_customer_access")
        .select("customer_id")
        .eq("contractor_user_id", contractorUserId),
    ]);

    const accessSet = new Set(
      (accessRes.data || []).map((a) => a.customer_id)
    );

    setCustomers(
      (custRes.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        hasAccess: accessSet.has(c.id),
      }))
    );
    setLoading(false);
  };

  const toggleAccess = async (customerId: string, grant: boolean) => {
    setSaving(true);
    try {
      if (grant) {
        const { error } = await supabase
          .from("contractor_customer_access")
          .insert({
            contractor_user_id: contractorUserId,
            customer_id: customerId,
            created_by: user!.id,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contractor_customer_access")
          .delete()
          .eq("contractor_user_id", contractorUserId)
          .eq("customer_id", customerId);
        if (error) throw error;
      }

      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId ? { ...c, hasAccess: grant } : c
        )
      );

      toast({
        title: grant ? "גישה ניתנה" : "גישה הוסרה",
        description: `${grant ? "נוספה" : "הוסרה"} גישה ללקוח`,
      });
    } catch (err) {
      console.error("Toggle access error:", err);
      toast({
        title: "שגיאה",
        description: "לא ניתן לעדכן את הגישה",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const accessCount = customers.filter((c) => c.hasAccess).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            ניהול גישת קבלן: {contractorName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          סמן את הלקוחות שהקבלן יוכל לצפות בהם ({accessCount} מתוך{" "}
          {customers.length})
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : customers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            אין לקוחות במערכת
          </p>
        ) : (
          <ScrollArea className="max-h-[400px] pr-1">
            <div className="space-y-1">
              {customers.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={c.hasAccess}
                    onCheckedChange={(checked) =>
                      toggleAccess(c.id, !!checked)
                    }
                    disabled={saving}
                  />
                  <span className="text-sm font-medium">{c.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
