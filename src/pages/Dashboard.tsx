import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, Wrench, FileText, AlertCircle, Plus, CheckCircle2, Clock } from "lucide-react";

interface DashboardStats {
  totalCustomers: number;
  openCalls: number;
  inProgressCalls: number;
  completedCalls: number;
  totalReports: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0, openCalls: 0, inProgressCalls: 0, completedCalls: 0, totalReports: 0,
  });
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const canCreate = isAdmin || role === "technician" || role === "secretary";

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    try {
      const [customersRes, callsRes, reportsRes, recentRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("service_calls").select("status"),
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase.from("service_calls").select("*, customers(name)").order("created_at", { ascending: false }).limit(5),
      ]);

      const calls = callsRes.data || [];
      setStats({
        totalCustomers: customersRes.count || 0,
        openCalls: calls.filter(c => c.status === "open").length,
        inProgressCalls: calls.filter(c => c.status === "in_progress").length,
        completedCalls: calls.filter(c => c.status === "completed").length,
        totalReports: reportsRes.count || 0,
      });
      setRecentCalls(recentRes.data || []);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { icon: Users, label: "לקוחות", value: stats.totalCustomers, color: "text-primary" },
    { icon: AlertCircle, label: "קריאות פתוחות", value: stats.openCalls, color: "text-warning" },
    { icon: Clock, label: "בטיפול", value: stats.inProgressCalls, color: "text-primary" },
    { icon: CheckCircle2, label: "הושלמו", value: stats.completedCalls, color: "text-success" },
    { icon: FileText, label: "דוחות", value: stats.totalReports, color: "text-muted-foreground" },
  ];

  const statusLabels: Record<string, string> = {
    open: "פתוח",
    in_progress: "בטיפול",
    completed: "הושלם",
    cancelled: "בוטל",
  };

  const statusColors: Record<string, string> = {
    open: "bg-warning/15 text-warning",
    in_progress: "bg-primary/15 text-primary",
    completed: "bg-success/15 text-success",
    cancelled: "bg-destructive/15 text-destructive",
  };

  return (
    <AppLayout title="לוח בקרה">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
              <span className="text-2xl font-bold">{loading ? "..." : stat.value}</span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      {canCreate && (
        <div className="flex flex-wrap gap-3 mb-8">
          {(isAdmin || role === "secretary") && (
            <Button size="lg" onClick={() => navigate("/customers/new")} className="h-12 gap-2">
              <Plus className="w-5 h-5" /> לקוח חדש
            </Button>
          )}
          {(isAdmin || role === "technician") && (
            <Button size="lg" onClick={() => navigate("/service-calls/new")} variant="outline" className="h-12 gap-2">
              <Wrench className="w-5 h-5" /> קריאת שירות חדשה
            </Button>
          )}
        </div>
      )}

      {/* Recent calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">קריאות שירות אחרונות</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">אין קריאות שירות עדיין</p>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <button
                  key={call.id}
                  onClick={() => navigate(`/service-calls/${call.id}`)}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-right"
                >
                  <div>
                    <p className="font-medium">{(call.customers as any)?.name}</p>
                    <p className="text-sm text-muted-foreground">{call.job_type} • {call.description?.slice(0, 50)}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[call.status]}`}>
                    {statusLabels[call.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default Dashboard;
