import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { share_token } = await req.json();
    if (!share_token) {
      return new Response(JSON.stringify({ error: "Missing share_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify token
    const { data: share, error: shareErr } = await supabase
      .from("service_call_shares")
      .select("service_call_id, share_type, is_active, revoked_at, expires_at")
      .eq("share_token", share_token)
      .single();

    if (shareErr || !share) {
      console.log("Share not found for token:", share_token.substring(0, 8));
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!share.is_active || share.revoked_at) {
      return new Response(JSON.stringify({ error: "Token revoked" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scId = share.service_call_id;
    const shareType = share.share_type;

    // Always load service call + customer for header info
    const { data: serviceCall } = await supabase
      .from("service_calls")
      .select("*")
      .eq("id", scId)
      .single();

    if (!serviceCall) {
      return new Response(JSON.stringify({ error: "Service call not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, city, address")
      .eq("id", serviceCall.customer_id)
      .single();

    let responseData: any = {
      share_type: shareType,
      customer: customer || null,
      service_call: {
        call_number: serviceCall.call_number,
        job_type: serviceCall.job_type,
        status: serviceCall.status,
        scheduled_date: serviceCall.scheduled_date,
        description: serviceCall.description,
      },
    };

    // Return section-specific data
    if (shareType === "details") {
      responseData.details = {
        description: serviceCall.description,
        notes: serviceCall.notes,
        priority: serviceCall.priority,
        scheduled_date: serviceCall.scheduled_date,
        completed_date: serviceCall.completed_date,
      };
    }

    if (shareType === "diagnosis") {
      responseData.diagnosis = {
        findings: serviceCall.findings,
        cause_assessment: serviceCall.cause_assessment,
        recommendations: serviceCall.recommendations,
        detection_method: serviceCall.detection_method,
        water_pressure_status: serviceCall.water_pressure_status,
        property_occupied: serviceCall.property_occupied,
        main_valve_closed: serviceCall.main_valve_closed,
        test_limitations: serviceCall.test_limitations,
        diagnosis_confidence: serviceCall.diagnosis_confidence,
        leak_location: serviceCall.leak_location,
        visible_damage: serviceCall.visible_damage,
        urgency_level: serviceCall.urgency_level,
        areas_not_inspected: serviceCall.areas_not_inspected,
        customer_signature_path: serviceCall.customer_signature_path,
        customer_signature_date: serviceCall.customer_signature_date,
      };

      // Generate signed URL for signature if exists
      if (serviceCall.customer_signature_path) {
        const { data: sigUrl } = await supabase.storage
          .from("signatures")
          .createSignedUrl(serviceCall.customer_signature_path, 3600);
        responseData.diagnosis.signature_url = sigUrl?.signedUrl;
      }
    }

    if (shareType === "media") {
      const [photosRes, videosRes] = await Promise.all([
        supabase.from("service_call_photos").select("*").eq("service_call_id", scId).order("created_at"),
        supabase.from("service_call_videos").select("*").eq("service_call_id", scId).order("created_at"),
      ]);

      const photosWithUrls = await Promise.all(
        (photosRes.data || []).map(async (p: any) => {
          const { data } = await supabase.storage.from("photos").createSignedUrl(p.storage_path, 3600);
          return { ...p, url: data?.signedUrl };
        })
      );

      const videosWithUrls = await Promise.all(
        (videosRes.data || []).map(async (v: any) => {
          const { data } = await supabase.storage.from("videos").createSignedUrl(v.storage_path, 3600);
          return { ...v, url: data?.signedUrl };
        })
      );

      responseData.photos = photosWithUrls;
      responseData.videos = videosWithUrls;
    }

    if (shareType === "quotes") {
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, title, status, notes, valid_until, created_at, discount_percent, include_vat, signature_path, signed_at, signed_by, quote_number, scope_of_work")
        .eq("service_call_id", scId)
        .order("created_at", { ascending: false });

      if (quotes && quotes.length > 0) {
        const quoteIds = quotes.map((q: any) => q.id);
        const { data: items } = await supabase
          .from("quote_items")
          .select("quote_id, description, quantity, unit_price, sort_order")
          .in("quote_id", quoteIds)
          .order("sort_order");

        const quotesWithData = await Promise.all(quotes.map(async (q: any) => {
          const qItems = (items || []).filter((i: any) => i.quote_id === q.id);
          const subtotal = qItems.reduce(
            (sum: number, i: any) => sum + Number(i.quantity) * Number(i.unit_price), 0
          );
          const discount = Number(q.discount_percent) || 0;
          const afterDiscount = subtotal * (1 - discount / 100);
          const includeVat = q.include_vat !== false;
          const totalWithVat = includeVat ? afterDiscount * 1.18 : afterDiscount;

          let signature_url = null;
          if (q.signature_path) {
            const { data: sigUrl } = await supabase.storage
              .from("signatures")
              .createSignedUrl(q.signature_path, 3600);
            signature_url = sigUrl?.signedUrl;
          }

          return { ...q, items: qItems, subtotal, total_with_vat: totalWithVat, signature_url };
        }));

        responseData.quotes = quotesWithData;
      } else {
        responseData.quotes = [];
      }
    }

    if (shareType === "report") {
      const { data: reports } = await supabase
        .from("reports")
        .select("*")
        .eq("service_call_id", scId)
        .order("created_at", { ascending: false });

      if (reports && reports.length > 0) {
        // Load photos/videos for context
        const [photosRes, videosRes] = await Promise.all([
          supabase.from("service_call_photos").select("*").eq("service_call_id", scId).order("created_at"),
          supabase.from("service_call_videos").select("*").eq("service_call_id", scId).order("created_at"),
        ]);

        const photosWithUrls = await Promise.all(
          (photosRes.data || []).map(async (p: any) => {
            const { data } = await supabase.storage.from("photos").createSignedUrl(p.storage_path, 3600);
            return { ...p, url: data?.signedUrl };
          })
        );

        const videosWithUrls = await Promise.all(
          (videosRes.data || []).map(async (v: any) => {
            const { data } = await supabase.storage.from("videos").createSignedUrl(v.storage_path, 3600);
            return { ...v, url: data?.signedUrl };
          })
        );

        // Generate signed URL for signature
        for (const report of reports) {
          if ((report as any).signature_path) {
            const { data: sigUrl } = await supabase.storage
              .from("signatures")
              .createSignedUrl((report as any).signature_path, 3600);
            (report as any).signature_url = sigUrl?.signedUrl;
          }
        }

        responseData.reports = reports;
        responseData.photos = photosWithUrls;
        responseData.videos = videosWithUrls;
      } else {
        responseData.reports = [];
      }
    }

    console.log(`Public share accessed: type=${shareType}, sc=${scId}, token=${share_token.substring(0, 8)}...`);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in get-public-share:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
