import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PhotoLightbox } from "./PhotoLightbox";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";

type Photo = Tables<"service_call_photos">;

interface PhotoGridProps {
  photos: Photo[];
  onDelete?: (id: string) => void;
}

const tagLabels: Record<string, string> = {
  before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
};

const tagColors: Record<string, string> = {
  before: "bg-primary/15 text-primary", after: "bg-success/15 text-success",
  finding: "bg-warning/15 text-warning", other: "bg-muted text-muted-foreground",
};

export function PhotoGrid({ photos, onDelete }: PhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const { user } = useAuth();

  const getPhotoUrl = (storagePath: string) => {
    const { data } = supabase.storage.from("photos").getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const lightboxPhotos = photos.map((p) => ({
    id: p.id,
    url: getPhotoUrl(p.storage_path),
    caption: p.caption,
    tag: p.tag,
  }));

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const photo = photos.find((p) => p.id === id);
    if (!photo) return;

    try {
      await supabase.storage.from("photos").remove([photo.storage_path]);
      const { error } = await supabase.from("service_call_photos").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "נמחק", description: "התמונה נמחקה" });
      onDelete?.(id);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (photos.length === 0) {
    return <p className="text-center text-muted-foreground py-8">אין תמונות עדיין</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer bg-muted"
            onClick={() => setLightboxIndex(i)}
          >
            <img
              src={getPhotoUrl(photo.storage_path)}
              alt={photo.caption || ""}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {photo.tag && (
              <Badge className={`absolute top-2 right-2 text-xs ${tagColors[photo.tag || "other"]}`}>
                {tagLabels[photo.tag || "other"]}
              </Badge>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 left-2 w-7 h-7 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                onClick={(e) => handleDelete(photo.id, e)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {photo.caption && (
              <p className="absolute bottom-0 right-0 left-0 p-2 text-xs text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {photo.caption}
              </p>
            )}
          </div>
        ))}
      </div>
      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxIndex >= 0}
        onClose={() => setLightboxIndex(-1)}
        canDownload={!!user}
      />
    </>
  );
}
