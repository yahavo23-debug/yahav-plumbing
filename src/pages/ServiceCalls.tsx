import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Calendar, ChevronLeft, RotateCcw } from "lucide-react";
import { getJobTypeLabel, statusLabels, statusColors, priorityColors } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { QuickCallDialog } from "@/components/service-calls/QuickCallDialog";

const statusFilters = [
  { value: "all", label: "הכל" },
  { value: "open", label: "פתוח" },
  { value: "in_progress", label: "בטיפול" },
  { value: "pending_customer", label: "ממתין" },
  { value: "completed", label: "הושלם" },
  { value: "cancelled", label: "בוטל" },
];

const ServiceCalls = () => {
  const [calls, setCalls] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const [filter, setFilter] = useState<string>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [quickCallOpen, setQuickCallOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const isContractor = role === "contractor";
  const canCreate = isAdmin || role === "technician" || role === "secretary";
  const canRestore = isAdmin || role === "secretary";
  const [restoreCall, setRestoreCall] = useState<any | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { if (!user) return; loadCalls(); }, [user]);

  const handleRestore = async () => {
    if (!restoreCall) return;
    if (!restoreReason.trim()) {
      toast({ title: "חובה למלא סיבה", description: "יש לציין מדוע הקריאה מוחזרת ללוח", variant: "destructive" });
      return;
    }
    setRestoring(true);
    const { error } = await supabase
      .from("service_calls")
      .update({
        status: "open",
        completed_at: null,
        completed_date: null,
        restore_reason: restoreReason.trim(),
        restored_at: new Date().toISOString(),
        restored_by: user?.id,
      })
      .eq("id", restoreCall.id);
    setRestoring(false);
    if (error) {
      toast({ title: "שגיאה בהחזרה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הקריאה הוחזרה ללוח", description: `${(restoreCall.customers as any)?.name || ""} חזר לסטטוס פתוח` });
    setRestoreCall(null);
    setRestoreReason("");
    loadCalls();
  };

  const loadCalls = async () => {
    try {
      const { data, error } = await supabase
        .from("service_calls")
        .select("*, customers(name, phone)")
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאות", variant: "destructive" });
      } else {
        setCalls(data || []);
      }
    } catch (err) {
      console.error("loadCalls error:", err);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאות", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => calls.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (c.customers as any)?.name?.toLowerCase().includes(q) ||
      c.job_type?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  }), [calls, search, filter]);

  return (
    <AppLayout title="קריאות שירות">
      <QuickCallDialog open={quickCallOpen} onClose={() => { setQuickCallOpen(false); loadCalls(); }} />

      {/* Top bar */}
      <div className="flex gap-2 mb-4">
        {!isContractor && (
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לקוח, סוג עבודה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        )}
        {canCreate && (
          <Button onClick={() => setQuickCallOpen(true)} className="h-10 gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">קריאה חדשה</span>
            <span className="sm:hidden">חדשה</span>
          </Button>
        )}
      </div>

      {/* Status filters */}
      {!isContractor && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-none">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="mr-1.5 text-xs opacity-70">
                  {calls.filter(c => c.status === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">לא נמצאו קריאות</p>
          {canCreate && (
            <Button className="mt-4 gap-2" onClick={() => setQuickCallOpen(true)}>
              <Plus className="w-4 h-4" /> פתח קריאה חדשה
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((call) => {
            const isClosed = call.status === "completed" || call.status === "cancelled";
            const showRestore = canRestore && isClosed;
            return (
              <div
                key={call.id}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:shadow-sm transition-all text-right"
              >
                {/* Priority strip */}
                <div className={cn(
                  "w-1 self-stretch rounded-full shrink-0",
                  call.priority === "urgent" ? "bg-destructive" :
                  call.priority === "high"   ? "bg-orange-400" :
                  call.priority === "medium" ? "bg-primary" : "bg-muted-foreground/30"
                )} />

                <button
                  onClick={() => navigate(`/service-calls/${call.id}`)}
                  className="flex-1 min-w-0 text-right"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold truncate">{(call.customers as any)?.name}</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                      statusColors[call.status]
                    )}>
                      {statusLabels[call.status]}
                    </span>
                    {call.restore_reason && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                        הוחזר
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{getJobTypeLabel(call.job_type)}</p>
                  {call.scheduled_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(call.scheduled_date).toLocaleDateString("he-IL")}
                    </div>
                  )}
                </button>

                {showRestore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setRestoreCall(call); setRestoreReason(""); }}
                    className="shrink-0 gap-1.5 h-9"
                    title="החזר ללוח"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">החזר</span>
                  </Button>
                )}

                <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Restore dialog */}
      <Dialog open={!!restoreCall} onOpenChange={(o) => { if (!o) { setRestoreCall(null); setRestoreReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>החזרת קריאה ללוח</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              לקוח: <span className="font-semibold text-foreground">{(restoreCall?.customers as any)?.name}</span>
            </p>
            <div>
              <label className="text-sm font-medium mb-1.5 block">סיבת ההחזרה <span className="text-destructive">*</span></label>
              <Textarea
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
                placeholder="לדוגמה: בעיה חזרה, לקוח ביקש להמשיך טיפול, התגלתה תקלה נוספת..."
                rows={4}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">הסיבה תישמר לבקרה ולא ניתן יהיה לערוך אותה לאחר מכן.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoreCall(null)} disabled={restoring}>ביטול</Button>
            <Button onClick={handleRestore} disabled={restoring || !restoreReason.trim()} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              {restoring ? "מחזיר..." : "החזר ללוח"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ServiceCalls;
