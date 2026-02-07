import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";

export interface TechnicianStat {
  user_id: string;
  total: number;
  completed: number;
  cancelled: number;
  in_progress: number;
  open: number;
}

export function useTechnicianStats(month: Date) {
  const [stats, setStats] = useState<TechnicianStat[]>([]);
  const [loading, setLoading] = useState(true);

  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const start = startOfMonth(month);
      const end = endOfMonth(month);

      const { data } = await supabase
        .from("service_calls")
        .select("assigned_to, status")
        .not("assigned_to", "is", null)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (data) {
        const map = new Map<string, TechnicianStat>();

        data.forEach((call) => {
          if (!call.assigned_to) return;

          if (!map.has(call.assigned_to)) {
            map.set(call.assigned_to, {
              user_id: call.assigned_to,
              total: 0,
              completed: 0,
              cancelled: 0,
              in_progress: 0,
              open: 0,
            });
          }

          const stat = map.get(call.assigned_to)!;
          stat.total++;

          if (call.status === "completed") stat.completed++;
          else if (call.status === "cancelled") stat.cancelled++;
          else if (call.status === "in_progress") stat.in_progress++;
          else stat.open++;
        });

        setStats(Array.from(map.values()));
      }

      setLoading(false);
    }

    load();
  }, [monthKey]);

  return { stats, loading };
}
