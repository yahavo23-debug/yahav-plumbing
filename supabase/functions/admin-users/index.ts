import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !callerUser) {
      console.error("Auth error:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      console.error("Non-admin user attempted admin action:", callerUser.id);
      return new Response(JSON.stringify({ error: "Forbidden - Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    console.log(`Admin action: ${action} by user ${callerUser.id}`);

    // LIST USERS - returns emails from auth.users
    if (action === "list" && req.method === "GET") {
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });

      if (listError) {
        console.error("Error listing users:", listError.message);
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userMap = users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

      console.log(`Listed ${userMap.length} users`);
      return new Response(JSON.stringify({ users: userMap }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // BAN USER
    if (action === "ban" && req.method === "POST") {
      const { userId, bannedUntil, reason } = await req.json();

      if (!userId || !bannedUntil) {
        return new Response(JSON.stringify({ error: "userId and bannedUntil required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow banning yourself
      if (userId === callerUser.id) {
        return new Response(JSON.stringify({ error: "Cannot ban yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profiles with ban info
      const { error: banError } = await adminClient
        .from("profiles")
        .update({
          banned_until: bannedUntil,
          ban_reason: reason || null,
          banned_by: callerUser.id,
        })
        .eq("user_id", userId);

      if (banError) {
        console.error("Error banning user:", banError.message);
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`User ${userId} banned until ${bannedUntil}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UNBAN USER
    if (action === "unban" && req.method === "POST") {
      const { userId } = await req.json();

      if (!userId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: unbanError } = await adminClient
        .from("profiles")
        .update({
          banned_until: null,
          ban_reason: null,
          banned_by: null,
        })
        .eq("user_id", userId);

      if (unbanError) {
        console.error("Error unbanning user:", unbanError.message);
        return new Response(JSON.stringify({ error: unbanError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`User ${userId} unbanned`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE USER
    if (action === "delete" && req.method === "POST") {
      const { userId } = await req.json();

      if (!userId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow deleting yourself
      if (userId === callerUser.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete from user_roles first
      await adminClient.from("user_roles").delete().eq("user_id", userId);

      // Delete from contractor_customer_access
      await adminClient.from("contractor_customer_access").delete().eq("contractor_user_id", userId);

      // Delete profile
      await adminClient.from("profiles").delete().eq("user_id", userId);

      // Delete the auth user
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

      if (deleteError) {
        console.error("Error deleting user:", deleteError.message);
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`User ${userId} deleted completely`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
