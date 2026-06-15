import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Upload, Image, Video, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface MediaUploaderProps {
  serviceCallId: string;
  type: "photo" | "video";
  onUploadComplete: () => void;
}

export function MediaUploader({ serviceCallId, type, onUploadComplete }: MediaUploaderProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tag, setTag] = useState("other");
  const [caption, setCaption] = useState("");

  const bucket = type === "photo" ? "photos" : "videos";
  const accept = type === "photo" ? "image/*" : "video/*";

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${serviceCallId}/${crypto.randomUUID()}.${ext}`;

        setProgress(Math.round(((i) / files.length) * 100));

        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
        if (uploadError) throw uploadError;

        if (type === "photo") {
          const { error: dbError } = await supabase.from("service_call_photos").insert({
            service_call_id: serviceCallId,
            storage_path: path,
            caption: caption || null,
            tag,
            uploaded_by: user.id,
          });
          if (dbError) throw dbError;
        } else {
          // Get video metadata
          let duration = 0;
          try {
            const videoEl = document.createElement("video");
            videoEl.preload = "metadata";
            videoEl.src = URL.createObjectURL(file);
            await new Promise((resolve) => {
              videoEl.onloadedmetadata = resolve;
              setTimeout(resolve, 3000);
            });
            duration = Math.round(videoEl.duration || 0);
            URL.revokeObjectURL(videoEl.src);
          } catch {}

          const { error: dbError } = await supabase.from("service_call_videos").insert({
            service_call_id: serviceCallId,
            storage_path: path,
            title: caption || file.name,
            tag,
            duration_seconds: duration,
            file_size_bytes: file.size,
            uploaded_by: user.id,
          });
          if (dbError) throw dbError;
        }

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      toast({ title: "הועלה בהצלחה", description: `${files.length} ${type === "photo" ? "תמונות" : "סרטונים"} הועלו` });
      setCaption("");
      onUploadComplete();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({ title: "שגיאה בהעלאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = "";
    }
  }, [user, serviceCallId, type, tag, caption, bucket, onUploadComplete]);

  const tagLabels: Record<string, string> = {
    before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
  };

  return (
    <div className="space-y-3 p-4 border border-dashed border-border rounded-lg bg-muted/30">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <span className="text-sm font-medium">תגית</span>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tagLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <span className="text-sm font-medium">{type === "photo" ? "כיתוב" : "כותרת"}</span>
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={type === "photo" ? "כיתוב לתמונה..." : "כותרת הסרטון..."}
          />
        </div>
        <div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept={accept}
              multiple
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
              capture={type === "video" ? "environment" : undefined}
            />
            <Button asChild disabled={uploading} className="h-10 gap-2">
              <span>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : type === "photo" ? <Image className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                {uploading ? "מעלה..." : type === "photo" ? "העלה תמונות" : "העלה סרטון"}
              </span>
            </Button>
          </label>
        </div>
      </div>
      {uploading && <Progress value={progress} className="h-2" />}
    </div>
  );
}
