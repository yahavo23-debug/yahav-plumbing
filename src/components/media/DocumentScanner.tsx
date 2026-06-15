import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScanLine, Loader2, Check, X } from "lucide-react";

interface DocumentScannerProps {
  serviceCallId: string;
  onUploadComplete: () => void;
}

export function DocumentScanner({ serviceCallId, onUploadComplete }: DocumentScannerProps) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleConfirm = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${serviceCallId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("photos").upload(path, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("service_call_photos").insert({
        service_call_id: serviceCallId,
        storage_path: path,
        caption: caption.trim() || "מסמך סרוק",
        tag: "document",
        uploaded_by: user.id,
      });
      if (dbError) throw dbError;

      toast({ title: "המסמך הועלה בהצלחה" });
      onUploadComplete();
      handleClose();
    } catch (err: any) {
      toast({ title: "שגיאה בהעלאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setCaption("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="gap-2 h-10"
      >
        <ScanLine className="w-4 h-4" />
        סרוק מסמך
      </Button>

      <Dialog open={!!preview} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>אישור סריקה</DialogTitle>
          </DialogHeader>

          {preview && (
            <img
              src={preview}
              alt="מסמך סרוק"
              className="w-full rounded-lg border object-contain max-h-72"
            />
          )}

          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="שם המסמך (אופציונלי)"
            disabled={uploading}
          />

          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button onClick={handleConfirm} disabled={uploading} className="gap-2">
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Check className="w-4 h-4" />}
              העלה לרשומה
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={uploading} className="gap-2">
              <X className="w-4 h-4" />
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
