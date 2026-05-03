import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Users, Wrench, AlertCircle, Plus, CheckCircle2, Clock,
  PhoneCall, ChevronLeft, CalendarClock, Flame, ChevronDown,
  MessageCircle, HourglassIcon,
} from "lucide-react";
import { getJobTypeLabel, statusColors, statusLabels } from "@/lib/constants";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { QuickCallDialog } from "@/components/service-calls/QuickCallDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";

interface DashboardStats {
  totalCustomers: number;
  openCalls: number;
  inProgressCalls: number;
  completedCalls: number;
  urgentCalls: number;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function toWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0, openCalls: 0, inProgressCalls: 0, completedCalls: 0, urgentCalls: 0,
  });
  const [todayCalls, setTodayCalls] = useState<any[]>([]);
  const [urgentCalls, setUrgentCalls] = useState<any[]>([]);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [pendingCalls, setPendingCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickCallOpen, setQuickCallOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const isSecretary = role === "secretary";
  const isTechnician = role === "technician";
  const canCreate = isAdmin || isTechnician || isSecretary;

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [customersRes, callsRes, todayRes, urgentRes, recentRes, pendingRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("service_calls").select("status, priority"),
        supabase
          .from("service_calls")
          .select("*, customers(name, phone)")
          .eq("scheduled_date", today)
          .in("status", ["open", "in_progress"])
          .order("scheduled_date"),
        supabase
          .from("service_calls")
          .select("*, customers(name, phone)")
          .in("priority", ["urgent", "high"])
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("service_calls")
          .select("*, customers(name, phone)")
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("service_calls")
          .select("*, customers(name, phone)")
          .eq("status", "pending_customer")
          .order("updated_at", { ascending: true }),
      ]);

      const calls = callsRes.data || [];
      setStats({
        totalCustomers: customersRes.count || 0,
        openCalls: calls.filter(c => c.status === "open").length,
        inProgressCalls: calls.filter(c => c.status === "in_progress").length,
        completedCalls: calls.filter(c => c.status === "completed").length,
        urgentCalls: calls.filter(c => c.priority === "urgent" || c.priority === "high").length,
      });
      setTodayCalls(todayRes.data || []);
      setUrgentCalls(urgentRes.data || []);
      setRecentCalls(recentRes.data || []);
      setPendingCalls(pendingRes.data || []);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = format(new Date(), "EEEE, d בMMMM yyyy", { locale: he });

  const statusOptions = [
    { value: "open",             label: "פתוח" },
    { value: "in_progress",      label: "בטיפול" },
    { value: "pending_customer", label: "ממתין לאישור לקוח" },
    { value: "completed",        label: "הושלם" },
    { value: "cancelled",        label: "בוטל" },
  ];

  const updateCallStatus = async (callId: string, newStatus: string) => {
    const { error } = await supabase
      .from("service_calls")
      .update({ status: newStatus })
      .eq("id", callId);

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לעדכן סטטוס", variant: "destructive" });
      return false;
    }
    return true;
  };

  // Update all local lists when a status changes
  const handleStatusChange = (id: string, status: string) => {
    const updatedAt = new Date().toISOString();
    const updateList = (list: any[]) =>
      list.map(c => c.id === id ? { ...c, status, updated_at: updatedAt } : c);

    setTodayCalls(prev => updateList(prev));
    setRecentCalls(prev => updateList(prev));
    setUrgentCalls(prev => updateList(prev));

    if (status === "pending_customer") {
      // Find the call and add to pending list
      const allCalls = [...todayCalls, ...recentCalls, ...urgentCalls, ...pendingCalls];
      const call = allCalls.find(c => c.id === id);
      if (call) {
        const updated = { ...call, status, updated_at: updatedAt };
        setPendingCalls(prev => {
          const exists = prev.some(c => c.id === id);
          return exists
            ? updateList(prev)
            : [...prev, updated].sort((a, b) =>
                new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
              );
        });
      }
    } else {
      // Remove from pending list if no longer pending
      setPendingCalls(prev => prev.filter(c => c.id !== id));
    }
  };

  const CallRow = ({ call }: { call: any }) => (
    <div className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/60 transition-colors text-right">
      <button
        onClick={() => navigate(`/service-calls/${call.id}`)}
        className="flex-1 min-w-0 text-right"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{call.customers?.name}</span>
          {call.priority === "urgent" && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium shrink-0">דחוף</span>
          )}
          {call.priority === "high" && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">גבוהה</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {getJobTypeLabel(call.job_type)}
          {call.description && ` • ${call.description.slice(0, 40)}`}
        </p>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {call.customers?.phone && (
          <a
            href={`tel:${call.customers.phone}`}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
          >
            <PhoneCall className="w-4 h-4" />
          </a>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-opacity hover:opacity-80 ${statusColors[call.status]}`}
            >
              {statusLabels[call.status]}
              <ChevronDown className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1.5">
            <p className="text-xs text-muted-foreground font-medium px-2 py-1 mb-1">שנה סטטוס</p>
            {statusOptions.map(opt => (
              <button
                key={opt.value}
                onClick={async () => {
                  const ok = await updateCallStatus(call.id, opt.value);
                  if (ok) handleStatusChange(call.id, opt.value);
                }}
                className={`w-full text-right text-sm px-3 py-2 rounded-lg transition-colors hover:bg-accent ${
                  call.status === opt.value ? "font-semibold bg-accent" : ""
                }`}
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <button
          onClick={() => navigate(`/service-calls/${call.id}`)}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );

  // Row specifically for pending_customer calls — shows waiting days + WhatsApp
  const PendingRow = ({ call }: { call: any }) => {
    const days = daysSince(call.updated_at);
    const ageBg =
      days >= 7 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
      days >= 3 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    const phone = call.customers?.phone;

    return (
      <div className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-right ${
        days >= 7 ? "border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10" :
        days >= 3 ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-900/40 dark:bg-yellow-900/10" :
                    "border-border hover:bg-accent/60"
      }`}>
        <button
          onClick={() => navigate(`/service-calls/${call.id}`)}
          className="flex-1 min-w-0 text-right"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{call.customers?.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ageBg}`}>
              {days === 0 ? "היום" : days === 1 ? "יום 1" : `${days} ימים`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {getJobTypeLabel(call.job_type)}
            {call.description && ` • ${call.description.slice(0, 35)}`}
          </p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {phone && (
            <>
              <a
                href={`tel:${phone}`}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                title="התקשר"
              >
                <PhoneCall className="w-4 h-4" />
              </a>
              <a
                href={toWhatsApp(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                title="שלח WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            </>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-opacity hover:opacity-80 ${ageBg}`}
              >
                סטטוס <ChevronDown className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1.5">
              <p className="text-xs text-muted-foreground font-medium px-2 py-1 mb-1">שנה סטטוס</p>
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={async () => {
                    const ok = await updateCallStatus(call.id, opt.value);
                    if (ok) handleStatusChange(call.id, opt.value);
                  }}
                  className={`w-full text-right text-sm px-3 py-2 rounded-lg transition-colors hover:bg-accent ${
                    call.status === opt.value ? "font-semibold bg-accent" : ""
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <button
            onClick={() => navigate(`/service-calls/${call.id}`)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <AppLayout title="לוח בקרה">
      <QuickCallDialog open={quickCallOpen} onClose={() => setQuickCallOpen(false)} />
      {/* Date + greeting */}
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">{todayStr}</p>
        <h1 className="text-2xl font-bold mt-1">שלום, בוא נראה מה קורה היום 👋</h1>
      </div>

      {/* Quick action buttons */}
      {canCreate && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            size="lg"
            className="h-12 gap-2 text-base shadow-sm"
            onClick={() => setQuickCallOpen(true)}
          >
            <Plus className="w-5 h-5" />
            קריאה חדשה
          </Button>
          {(isAdmin || isSecretary) && (
            <Button
              size="lg"
              variant="outline"
              className="h-12 gap-2"
              onClick={() => navigate("/customers/new")}
            >
              <Users className="w-5 h-5" />
              לקוח חדש
            </Button>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card
          className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
          onClick={() => navigate("/service-calls?status=open")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : stats.openCalls}</p>
              <p className="text-xs text-muted-foreground">קריאות פתוחות</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
          onClick={() => navigate("/service-calls?status=in_progress")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : stats.inProgressCalls}</p>
              <p className="text-xs text-muted-foreground">בטיפול</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
          onClick={() => navigate("/customers")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : stats.totalCustomers}</p>
              <p className="text-xs text-muted-foreground">לקוחות</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
          onClick={() => navigate("/service-calls")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : stats.urgentCalls}</p>
              <p className="text-xs text-muted-foreground">דחוף / גבוה</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ממתין לאישור לקוח — reminder section */}
      {(loading || pendingCalls.length > 0) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <HourglassIcon className="w-4 h-4 text-purple-600" />
              ממתין לאישור לקוח
              {pendingCalls.length > 0 && (
                <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                  pendingCalls.some(c => daysSince(c.updated_at) >= 7)
                    ? "bg-red-500 text-white"
                    : pendingCalls.some(c => daysSince(c.updated_at) >= 3)
                    ? "bg-yellow-500 text-white"
                    : "bg-purple-500 text-white"
                }`}>
                  {pendingCalls.length}
                </span>
              )}
            </h2>
            {pendingCalls.some(c => daysSince(c.updated_at) >= 3) && (
              <span className="text-xs text-orange-600 font-medium">⚠️ יש ממתינים מזמן רב</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : pendingCalls.length === 0 ? null : (
            <div className="space-y-2">
              {pendingCalls.map(call => <PendingRow key={call.id} call={call} />)}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's calls */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              קריאות היום
              {todayCalls.length > 0 && (
                <span className="text-xs bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {todayCalls.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => navigate("/dispatch")}
              className="text-xs text-primary hover:underline"
            >
              לוח דיספץ' ←
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : todayCalls.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">אין קריאות מתוזמנות להיום</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayCalls.map(call => <CallRow key={call.id} call={call} />)}
            </div>
          )}
        </div>

        {/* Urgent / open calls */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-destructive" />
              דחוף ופתוח
            </h2>
            <button
              onClick={() => navigate("/service-calls")}
              className="text-xs text-primary hover:underline"
            >
              כל הקריאות ←
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">אין קריאות פתוחות</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCalls.map(call => <CallRow key={call.id} call={call} />)}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
