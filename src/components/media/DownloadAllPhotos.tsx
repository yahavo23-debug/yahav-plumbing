import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Download, Loader2 } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Photo = Tables<"service_call_photos">;

interface DownloadAllPhotosProps {
  photos: Photo[];
}

export function DownloadAllPhotos({ photos }: DownloadAllPhotosProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (photos.length === 0) return;
    setDownloading(true);

    try {
      const paths = photos.map((p) => p.storage_path);
      const { data, error } = await supabase.storage
        .from("photos")
        .createSignedUrls(paths, 600);

      if (error || !data) throw error || new Error("לא ניתן ליצור קישורים");

      const validUrls = data.filter((d) => d.signedUrl);

      for (let i = 0; i < validUrls.length; i++) {
        const item = validUrls[i];
        try {
          const response = await fetch(item.signedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const ext = photos[i]?.storage_path?.split(".").pop() || "jpg";
          a.download = `תמונה_${i + 1}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          // Small delay between downloads to avoid browser blocking
          if (i < validUrls.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch {
          console.warn(`Failed to download photo ${i + 1}`);
        }
      }

      toast({
        title: "התמונות הורדו",
        description: `${validUrls.length} תמונות הורדו בהצלחה`,
      });
    } catch (err: any) {
      console.error("Download photos error:", err);
      toast({
        title: "שגיאה",
        description: err.message || "לא ניתן להוריד תמונות",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (photos.length === 0) return null;

  return (
    <Button
      onClick={handleDownload}
      disabled={downloading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {downloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> מוריד...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" /> הורד כל התמונות ({photos.length})
        </>
      )}
    </Button>
  );
}
