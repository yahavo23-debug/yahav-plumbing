import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Play, Film } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { VideoPlayer } from "./VideoPlayer";

type VideoRecord = Tables<"service_call_videos">;

interface VideoListProps {
  videos: VideoRecord[];
  onDelete?: (id: string) => void;
}

const tagLabels: Record<string, string> = {
  before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
};

const tagColors: Record<string, string> = {
  before: "bg-primary/15 text-primary", after: "bg-success/15 text-success",
  finding: "bg-warning/15 text-warning", other: "bg-muted text-muted-foreground",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoList({ videos, onDelete }: VideoListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { user } = useAuth();

  const getVideoUrl = (storagePath: string) => {
    const { data } = supabase.storage.from("videos").getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const handleDelete = async (video: VideoRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.storage.from("videos").remove([video.storage_path]);
      const { error } = await supabase.from("service_call_videos").delete().eq("id", video.id);
      if (error) throw error;
      toast({ title: "נמחק", description: "הסרטון נמחק" });
      onDelete?.(video.id);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (videos.length === 0) {
    return <p className="text-center text-muted-foreground py-8">אין סרטונים עדיין</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {videos.map((video) => (
          <div
            key={video.id}
            className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => setPlayingId(video.id)}
          >
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center shrink-0">
              <Film className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{video.title || "סרטון"}</h4>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span>{formatDuration(video.duration_seconds)}</span>
                <span>{formatFileSize(video.file_size_bytes)}</span>
                {video.tag && (
                  <Badge className={`text-xs ${tagColors[video.tag || "other"]}`}>
                    {tagLabels[video.tag || "other"]}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="icon" className="text-primary" onClick={(e) => { e.stopPropagation(); setPlayingId(video.id); }}>
                <Play className="w-5 h-5" />
              </Button>
              {onDelete && (
                <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => handleDelete(video, e)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {playingId && (
        <VideoPlayer
          url={getVideoUrl(videos.find((v) => v.id === playingId)!.storage_path)}
          title={videos.find((v) => v.id === playingId)?.title || "סרטון"}
          open={!!playingId}
          onClose={() => setPlayingId(null)}
        />
      )}
    </>
  );
}
