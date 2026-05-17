import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns signed URL for an image in the `inventory` bucket. */
export function useInventoryImage(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("inventory").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}
