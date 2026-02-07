import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface DispatchCall {
  id: string;
  customer_id: string;
  customer_name: string;
  description: string | null;
  status: string;
  priority: string;
  job_type: string;
  scheduled_at: string | null;
  duration_minutes: number;
  assigned_to: string | null;
  call_number: number;
  notes: string | null;
}

export function useDispatchCalls(selectedDate: Date) {
  const [calls, setCalls] = useState<DispatchCall[]>([]);
  const [unscheduledCalls, setUnscheduledCalls] = useState<DispatchCall[]>([]);
  const [loading, setLoading] = useState(true);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const loadCalls = useCallback(async () => {
    setLoading(true);

    // Create boundaries in LOCAL timezone, then convert to ISO (UTC) for proper DB queries
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999`);

    const [scheduledRes, unscheduledRes] = await Promise.all([
      supabase
        .from("service_calls")
        .select("id, customer_id, description, status, priority, job_type, scheduled_at, duration_minutes, assigned_to, call_number, notes, customers(name)")
        .gte("scheduled_at", dayStart.toISOString())
        .lte("scheduled_at", dayEnd.toISOString())
        .not("status", "eq", "cancelled")
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("service_calls")
        .select("id, customer_id, description, status, priority, job_type, scheduled_at, duration_minutes, assigned_to, call_number, notes, customers(name)")
        .is("scheduled_at", null)
        .not("status", "in", '("completed","cancelled")')
        .order("priority", { ascending: true })
        .limit(50),
    ]);

    if (scheduledRes.error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון קריאות", variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapCall = (row: any): DispatchCall => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_name: (row.customers as any)?.name || "—",
      description: row.description,
      status: row.status,
      priority: row.priority,
      job_type: row.job_type,
      scheduled_at: row.scheduled_at,
      duration_minutes: row.duration_minutes || 60,
      assigned_to: row.assigned_to,
      call_number: row.call_number,
      notes: row.notes,
    });

    setCalls((scheduledRes.data || []).map(mapCall));
    setUnscheduledCalls((unscheduledRes.data || []).map(mapCall));
    setLoading(false);
  }, [dateStr]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const scheduleCall = useCallback(
    async (callId: string, hour: number) => {
      // Create date in LOCAL timezone, then convert to ISO (UTC) for DB storage
      const date = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`);
      const scheduledAt = date.toISOString();

      const { error } = await supabase
        .from("service_calls")
        .update({ scheduled_at: scheduledAt } as any)
        .eq("id", callId);

      if (error) {
        toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        return false;
      }

      await loadCalls();
      return true;
    },
    [dateStr, loadCalls]
  );

  const unscheduleCall = useCallback(
    async (callId: string) => {
      const { error } = await supabase
        .from("service_calls")
        .update({ scheduled_at: null } as any)
        .eq("id", callId);

      if (error) {
        toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        return false;
      }

      await loadCalls();
      return true;
    },
    [loadCalls]
  );

  const assignTechnician = useCallback(
    async (callId: string, techId: string | null) => {
      const { error } = await supabase
        .from("service_calls")
        .update({ assigned_to: techId } as any)
        .eq("id", callId);

      if (error) {
        toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        return false;
      }

      await loadCalls();
      return true;
    },
    [loadCalls]
  );

  return { calls, unscheduledCalls, loading, scheduleCall, unscheduleCall, assignTechnician, reload: loadCalls };
}
