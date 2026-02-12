import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X, FileText } from "lucide-react";

interface FinanceDocUploadProps {
  currentPath?: string | null;
  onUploaded: (path: string) => void;
  onRemoved?: () => void;
}

export function FinanceDocUpload({ currentPath, onUploaded, onRemoved }: FinanceDocUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load signed URL for existing path
  useEffect(() => {
    if (currentPath && !previewUrl) {
      setIsPdf(currentPath.endsWith(".pdf"));
      supabase.storage
        .from("finance-docs")
        .createSignedUrl(currentPath, 300)
        .then(({ data }) => {
          if (data?.signedUrl) setPreviewUrl(data.signedUrl);
        });
    }
  }, [currentPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast({ title: "שגיאה", description: "ניתן להעלות תמונות או PDF בלבד", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "שגיאה", description: "גודל הקובץ מעל 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("finance-docs")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (error) throw error;

      setIsPdf(file.type === "application/pdf");
      setPreviewUrl(URL.createObjectURL(file));
      onUploaded(path);
      toast({ title: "הועלה", description: "המסמך נשמר" });
    } catch (err: any) {
      console.error("Finance doc upload error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setIsPdf(false);
    onRemoved?.();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleUpload}
      />
      {previewUrl || currentPath ? (
        <div className="relative">
          {isPdf ? (
            <div className="w-16 h-16 rounded border border-input bg-muted flex items-center justify-center">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={previewUrl || ""}
              alt="תצוגה מקדימה"
              className="w-16 h-16 rounded border border-input object-cover"
            />
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
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
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          צרף מסמך
        </Button>
      )}
    </div>
  );
}
