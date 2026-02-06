import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, ScrollText } from "lucide-react";

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  created_at: string;
  profile_name?: string;
}

const ACTION_LABELS: Record<string, string> = {
  view_customer: "צפייה בלקוח",
  view_customer_list: "צפייה ברשימת לקוחות",
  view_service_call: "צפייה בקריאת שירות",
};

const RESOURCE_LABELS: Record<string, string> = {
  customer: "לקוח",
  customer_list: "רשימת לקוחות",
  service_call: "קריאת שירות",
};

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    // Fetch last 100 audit logs
    const { data: logsData, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100) as any;

    if (error) {
      console.error("Load audit logs error:", error);
      setLoading(false);
      return;
    }

    if (!logsData || logsData.length === 0) {
      setLogs([]);
      setLoading(false);
      return;
    }

    // Fetch profile names for all unique user_ids
    const userIds = [...new Set(logsData.map((l: any) => l.user_id))] as string[];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    const nameMap = new Map(
      (profiles || []).map((p) => [p.user_id, p.full_name])
    );

    setLogs(
      logsData.map((l: any) => ({
        ...l,
        profile_name: nameMap.get(l.user_id) || "משתמש לא ידוע",
      }))
    );
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="w-4 h-4" /> לוג פעילות קבלנים
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            אין פעילות מתועדת
          </p>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <Eye className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {log.profile_name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {RESOURCE_LABELS[log.resource_type] || log.resource_type}
                        {log.resource_label && `: ${log.resource_label}`}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(log.created_at).toLocaleString("he-IL", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
