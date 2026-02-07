import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Technician {
  user_id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get users with technician or admin roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["technician", "admin"]);

      if (!roles || roles.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = [...new Set(roles.map((r) => r.user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, avatar_url")
        .in("user_id", userIds);

      if (profiles) {
        setTechnicians(
          profiles.map((p) => ({
            user_id: p.user_id,
            full_name: p.full_name || "ללא שם",
            phone: p.phone,
            avatar_url: p.avatar_url,
          }))
        );
      }

      setLoading(false);
    }

    load();
  }, []);

  return { technicians, loading };
}
