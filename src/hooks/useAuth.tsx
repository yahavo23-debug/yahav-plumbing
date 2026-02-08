import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "technician" | "secretary" | "contractor" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  role: AppRole;
  signUp: (email: string, password: string, fullName: string, phone?: string, idNumber?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AppRole>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setRole(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        fetchUserRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const userRole = (data?.role as AppRole) || null;
    setRole(userRole);
    setIsAdmin(userRole === "admin");
  };

  const signUp = async (email: string, password: string, fullName: string, phone?: string, idNumber?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });

    if (error) return { error: error as Error | null };

    // Update profile with phone and id_number
    if (data.user && (phone || idNumber)) {
      await supabase
        .from("profiles")
        .update({
          phone: phone || null,
          id_number: idNumber || null,
        })
        .eq("user_id", data.user.id);
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error as Error | null };

    // Check if user is banned
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("banned_until, ban_reason")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profile?.banned_until && new Date(profile.banned_until) > new Date()) {
        await supabase.auth.signOut();
        const isBannedForever = new Date(profile.banned_until).getFullYear() >= 2099;
        const banMsg = isBannedForever
          ? "חשבונך חסום לצמיתות"
          : `חשבונך חסום עד ${new Date(profile.banned_until).toLocaleDateString("he-IL")}`;
        const reason = profile.ban_reason ? ` • סיבה: ${profile.ban_reason}` : "";
        return { error: new Error(`${banMsg}${reason}`) };
      }

      // Log login event for contractors and secretaries
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (roleData?.role === "contractor" || roleData?.role === "secretary") {
        await supabase.from("audit_logs").insert({
          user_id: data.user.id,
          action: "login",
          resource_type: "session",
          resource_label: roleData.role === "contractor" ? "קבלן" : "מזכירה",
        });
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    // Log logout event for contractors and secretaries
    if (user && (role === "contractor" || role === "secretary")) {
      try {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "logout",
          resource_type: "session",
          resource_label: role === "contractor" ? "קבלן" : "מזכירה",
        });
      } catch (err) {
        console.error("Audit log logout error:", err);
      }
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, role, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
