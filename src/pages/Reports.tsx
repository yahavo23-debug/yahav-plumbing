import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FileText, Send, MessageCircle, Clock } from "lucide-react";
import { getJobTypeLabel } from "@/lib/constants";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-warning/15 text-warning" },
  sent: { label: "ממתין לחתימה", color: "bg-primary/15 text-primary" },
  signed: { label: "נחתם", color: "bg-success/15 text-success" },
  final: { label: "סופי", color: "bg-muted text-muted-foreground" },
};

const Reports = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadReports();
  }, [user]);

  const loadReports = async () => {
    const { data, error } = await supabase
      .from("reports")
      .select("*, service_calls(*, customers(name, phone))")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load reports error:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון דוחות", variant: "destructive" });
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  const filteredReports = filter === "all" ? reports : reports.filter(r => r.status === filter);
  const sentCount = reports.filter(r => r.status === "sent").length;

  const handleSendReminder = (e: React.MouseEvent, report: any) => {
    e.stopPropagation();
    const customer = (report.service_calls as any)?.customers as any;
    const phone = customer?.phone?.replace(/[^0-9]/g, "");
    if (!phone) {
      toast({ title: "אין מספר טלפון", description: "לא ניתן לשלוח תזכורת", variant: "destructive" });
      return;
    }
    const msg = encodeURIComponent(`שלום ${customer?.name || ""}, תזכורת: נשלח אליך דוח עבודה לחתימה. אנא חתום בהקדם. תודה!`);
    window.open(`https://wa.me/${phone.startsWith("0") ? "972" + phone.slice(1) : phone}?text=${msg}`, "_blank");
  };

  return (
    <AppLayout title="דוחות">
      {/* Filter bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "all", label: "הכל" },
          { key: "draft", label: "טיוטות" },
          { key: "sent", label: `ממתינים (${sentCount})` },
          { key: "signed", label: "נחתמו" },
          { key: "final", label: "סופי" },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">אין דוחות {filter !== "all" ? "בסטטוס זה" : "עדיין"}</p>
          {filter === "all" && <p className="text-sm text-muted-foreground mt-1">צור דוח מתוך קריאת שירות</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const sc = report.service_calls as any;
            const customer = sc?.customers as any;
            const cfg = statusConfig[report.status] || statusConfig.draft;
            return (
              <Card
                key={report.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/reports/${report.id}`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{report.title}</h3>
                      <Badge className={cfg.color}>
                        {cfg.label}
                      </Badge>
                      {report.signature_path && (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">
                          ✓ חתום
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {customer?.name} • {getJobTypeLabel(sc?.job_type)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                  {report.status === "sent" && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={(e) => handleSendReminder(e, report)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> תזכורת
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default Reports;
