import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { CustomerCard } from "@/components/customers/CustomerCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Customer = Tables<"customers">;

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingCustomerIds, setPendingCustomerIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user, role, isAdmin } = useAuth();
  const { logAction } = useAuditLog();
  const isContractor = role === "contractor";

  // Secretary and admin can create customers
  const canCreate = isAdmin || role === "secretary";

  useEffect(() => {
    if (!user) return;
    loadCustomers();
    loadPendingCalls();
  }, [user]);

  const loadPendingCalls = async () => {
    const { data } = await supabase
      .from("service_calls")
      .select("customer_id")
      .eq("status", "pending_customer");
    if (data) {
      setPendingCustomerIds(new Set(data.map((d) => d.customer_id)));
    }
  };

  const loadCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load customers error:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את רשימת הלקוחות", variant: "destructive" });
    } else {
      setCustomers(data || []);
      logAction({
        action: "view_customer_list",
        resource_type: "customer_list",
        resource_label: `${(data || []).length} לקוחות`,
      });
    }
    setLoading(false);
  };

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("customers").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק את הלקוח. ייתכן שיש קריאות שירות משויכות.", variant: "destructive" });
    } else {
      toast({ title: "נמחק", description: `הלקוח "${deleteTarget.name}" נמחק בהצלחה` });
      setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const filtered = customers.filter(
    (c) =>
      c.name.includes(search) ||
      c.phone?.includes(search) ||
      c.email?.includes(search) ||
      c.city?.includes(search)
  );

  return (
    <AppLayout title="לקוחות">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {!isContractor && (
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לקוחות..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        )}
        {canCreate && (
          <Button onClick={() => navigate("/customers/new")} className="h-10 gap-2">
            <Plus className="w-4 h-4" /> לקוח חדש
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו לקוחות</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isAdmin={isAdmin}
              isContractor={isContractor}
              hasPendingCall={pendingCustomerIds.has(customer.id)}
              onEdit={(id) => navigate(`/customers/${id}/edit`)}
              onDelete={(c) => setDeleteTarget(c)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת לקוח</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הלקוח "{deleteTarget?.name}"?
              פעולה זו לא ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "מוחק..." : "מחק לקוח"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Customers;
