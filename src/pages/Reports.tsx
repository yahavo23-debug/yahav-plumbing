import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FileText, Share2 } from "lucide-react";

const Reports = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadReports();
  }, [user]);

  const loadReports = async () => {
    const { data, error } = await supabase
      .from("reports")
      .select("*, service_calls(*, customers(name))")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load reports error:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון דוחות", variant: "destructive" });
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  return (
    <AppLayout title="דוחות">
      {loading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">אין דוחות עדיין</p>
          <p className="text-sm text-muted-foreground mt-1">צור דוח מתוך קריאת שירות</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const sc = report.service_calls as any;
            const customer = sc?.customers as any;
            return (
              <Card
                key={report.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/reports/${report.id}`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{report.title}</h3>
                      <Badge className={report.status === "final" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}>
                        {report.status === "final" ? "סופי" : "טיוטה"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {customer?.name} • {sc?.job_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString("he-IL")}
                    </p>
                  </div>
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
