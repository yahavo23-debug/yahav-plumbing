import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", completed: "הושלם", cancelled: "בוטל",
};
const statusColors: Record<string, string> = {
  open: "bg-warning/15 text-warning border-warning/30",
  in_progress: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const ServiceCalls = () => {
  const [calls, setCalls] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const canCreate = isAdmin || role === "technician";

  useEffect(() => {
    if (!user) return;
    loadCalls();
  }, [user]);

  const loadCalls = async () => {
    const { data, error } = await supabase
      .from("service_calls")
      .select("*, customers(name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load calls error:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאות", variant: "destructive" });
    } else {
      setCalls(data || []);
    }
    setLoading(false);
  };

  const filtered = calls.filter((c) => {
    const matchesSearch = (c.customers as any)?.name?.includes(search) || c.job_type?.includes(search) || c.description?.includes(search);
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <AppLayout title="קריאות שירות">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/service-calls/new")} className="h-10 gap-2">
            <Plus className="w-4 h-4" /> קריאה חדשה
          </Button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[{ value: "all", label: "הכל" }, ...Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))].map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו קריאות</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((call) => (
            <Card
              key={call.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/service-calls/${call.id}`)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{(call.customers as any)?.name}</h3>
                    <Badge variant="outline" className={statusColors[call.status]}>
                      {statusLabels[call.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{call.job_type}</p>
                  {call.scheduled_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" /> {new Date(call.scheduled_date).toLocaleDateString("he-IL")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default ServiceCalls;
