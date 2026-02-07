import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X } from "lucide-react";

interface ReceiptUploadProps {
  entryId?: string;
  customerId: string;
  currentPath?: string | null;
  onUploaded: (path: string) => void;
  onRemoved?: () => void;
}

export function ReceiptUpload({
  entryId,
  customerId,
  currentPath,
  onUploaded,
  onRemoved,
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "שגיאה", description: "ניתן להעלות תמונות בלבד", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "שגיאה", description: "גודל הקובץ מעל 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${customerId}/${entryId || Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (error) throw error;

      // Show local preview
      setPreviewUrl(URL.createObjectURL(file));
      onUploaded(path);
      toast({ title: "הועלה", description: "תמונת הקבלה נשמרה" });
    } catch (err: any) {
      console.error("Receipt upload error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    onRemoved?.();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleUpload}
      />

      {previewUrl || currentPath ? (
        <div className="relative">
          <img
            src={previewUrl || ""}
            alt="קבלה"
            className="w-12 h-12 object-cover rounded border border-input"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          צרף קבלה
        </Button>
      )}
    </div>
  );
}
