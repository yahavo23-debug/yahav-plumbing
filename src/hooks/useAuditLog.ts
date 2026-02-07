import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AuditLogEntry {
  action: string;
  resource_type: string;
  resource_id?: string;
  resource_label?: string;
}

export function useAuditLog() {
  const { user, role } = useAuth();
  const loggedRef = useRef<Set<string>>(new Set());

  const logAction = useCallback(
    async (entry: AuditLogEntry) => {
      if (!user || (role !== "contractor" && role !== "secretary")) return;

      // Deduplicate within the same component mount
      const key = `${entry.action}:${entry.resource_type}:${entry.resource_id}`;
      if (loggedRef.current.has(key)) return;
      loggedRef.current.add(key);

      try {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: entry.action,
          resource_type: entry.resource_type,
          resource_id: entry.resource_id || null,
          resource_label: entry.resource_label || null,
        } as any);
      } catch (err) {
        console.error("Audit log error:", err);
      }
    },
    [user, role]
  );

  return { logAction };
}
