import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X, FileText, Maximize2, ScanLine, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { DocumentScannerDialog } from "@/components/scanner/DocumentScannerDialog";



interface FinanceDocUploadProps {
  currentPath?: string | null;
  onUploaded: (path: string) => void;
  onRemoved?: () => void;
}

export function FinanceDocUpload({ currentPath, onUploaded, onRemoved }: FinanceDocUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (currentPath && !previewUrl) {
      setIsPdf(currentPath.endsWith(".pdf"));
      // Try finance-docs first, fallback to receipts (for auto-created entries from billing)
      supabase.storage
        .from("finance-docs")
        .createSignedUrl(currentPath, 300)
        .then(({ data, error }) => {
          if (data?.signedUrl && !error) {
            setPreviewUrl(data.signedUrl);
          } else {
            supabase.storage
              .from("receipts")
              .createSignedUrl(currentPath, 300)
              .then(({ data: rData }) => {
                if (rData?.signedUrl) setPreviewUrl(rData.signedUrl);
              });
          }
        });
    }
  }, [currentPath]);

  const uploadFile = async (file: File) => {
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };


  const handleRemove = () => {
    setPreviewUrl(null);
    setIsPdf(false);
    setZoom(1);
    onRemoved?.();
  };

  const openPreview = () => {
    setZoom(1);
    setFullscreen(true);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,application/pdf"
          className="hidden"
          onChange={handleUpload}
        />
        {previewUrl || currentPath ? (
          <div className="relative group">
            {isPdf ? (
              <div
                onClick={openPreview}
                className="w-16 h-16 rounded border border-input bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
              >
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={previewUrl || ""}
                alt="תצוגה מקדימה"
                onClick={openPreview}
                className="w-16 h-16 rounded border border-input object-cover cursor-pointer hover:opacity-80 transition-opacity"
              />
            )}
            <button
              type="button"
              onClick={openPreview}
              className="absolute bottom-0 left-0 w-5 h-5 bg-black/60 text-white rounded-tr rounded-bl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScannerOpen(true)}
              disabled={uploading}
              className="gap-1.5"
            >
              <ScanLine className="w-3.5 h-3.5" />
              סרוק
            </Button>
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
          </>
        )}
      </div>

      <DocumentScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        filenameBase="finance-doc"
        onComplete={(file) => uploadFile(file)}
      />


      {/* Fullscreen preview dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="w-[96vw] max-w-5xl h-[92dvh] max-h-[92dvh] p-0 overflow-hidden flex flex-col">
          {isPdf ? (
            <iframe
              src={previewUrl || ""}
              className="w-full flex-1 rounded"
              title="תצוגת מסמך"
            />
          ) : (
            <>
              <div className="shrink-0 flex items-center justify-center gap-2 border-b border-border p-2 bg-background" dir="rtl">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
                  disabled={zoom <= 0.5}
                  aria-label="הקטן תצוגה"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(1)}
                  aria-label="התאם לגודל המסך"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <span className="min-w-14 text-center text-sm font-medium text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                  disabled={zoom >= 3}
                  aria-label="הגדל תצוגה"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <div
                className="flex-1 min-h-0 overflow-auto bg-muted/30 p-2 sm:p-4"
                style={{ touchAction: "pan-x pan-y pinch-zoom" }}
              >
                <div className="min-h-full flex items-start justify-center">
                  <img
                    src={previewUrl || ""}
                    alt="תצוגת מסמך"
                    className="h-auto max-h-none rounded border border-border bg-background object-contain select-none"
                    style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none", touchAction: "pan-x pan-y pinch-zoom" }}
                    draggable={false}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
