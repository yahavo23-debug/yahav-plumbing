import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

let cachedUrl: string | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export function useLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedUrl);
  const [loading, setLoading] = useState(!cachedUrl);

  useEffect(() => {
    if (cachedUrl && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setLogoUrl(cachedUrl);
      setLoading(false);
      return;
    }
    fetchLogo();
  }, []);

  const fetchLogo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-logo-url");
      if (!error && data?.url) {
        cachedUrl = data.url;
        cacheTimestamp = Date.now();
        setLogoUrl(data.url);
      }
    } catch (err) {
      console.error("Failed to load logo:", err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    cachedUrl = null;
    cacheTimestamp = 0;
    await fetchLogo();
  };

  return { logoUrl, loading, refresh };
}
