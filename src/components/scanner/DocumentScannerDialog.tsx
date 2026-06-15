import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Camera, ImagePlus, Loader2, RotateCw, Trash2, ScanLine, X, Sparkles } from "lucide-react";
import jsPDF from "jspdf";

interface DocumentScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user finalizes the scan. Returns a single file (PDF when multi-page, JPG when single page) */
  onComplete: (file: File) => void;
  /** Default filename (without extension) */
  filenameBase?: string;
}

interface ScannedPage {
  id: string;
  /** Processed JPEG data URL */
  dataUrl: string;
  /** Natural width/height of processed image */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  enhanced: boolean;
}

/**
 * Document Scanner Dialog
 * - Mobile: live camera using getUserMedia (environment-facing)
 * - Desktop / fallback: file input (accepts multiple images, also opens camera on supported devices)
 * - Applies a scanner-like enhancement (grayscale + contrast boost) on each page
 * - Multi-page output as a PDF
 */
export function DocumentScannerDialog({ open, onOpenChange, onComplete, filenameBase = "scan" }: DocumentScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("המכשיר אינו תומך בגישה למצלמה");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError(err?.message || "לא ניתן להפעיל את המצלמה");
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Try camera; if it fails we silently show the upload fallback
      startCamera();
    } else {
      stopCamera();
      setPages([]);
      setCameraError(null);
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Apply "scanner" filter: light grayscale + contrast + brightness on a canvas */
  const enhance = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const contrast = 1.35; // boost
    const brightness = 10;
    for (let i = 0; i < d.length; i += 4) {
      // grayscale (luminance)
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // contrast + brightness around 128
      let v = (gray - 128) * contrast + 128 + brightness;
      v = Math.max(0, Math.min(255, v));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  };

  const addPageFromCanvas = (canvas: HTMLCanvasElement, withEnhance: boolean) => {
    if (withEnhance) enhance(canvas);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPages((p) => [
      ...p,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        rotation: 0,
        enhanced: withEnhance,
      },
    ]);
  };

  const capture = async () => {
    if (!videoRef.current || !cameraReady) return;
    setBusy(true);
    try {
      const v = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas error");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      addPageFromCanvas(canvas, true);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        const url = URL.createObjectURL(f);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            // Limit dimension to keep file size reasonable
            const maxDim = 2200;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("canvas error"));
            ctx.drawImage(img, 0, 0, w, h);
            addPageFromCanvas(canvas, true);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("שגיאה בקריאת תמונה"));
          };
          img.src = url;
        });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePage = (id: string) => setPages((p) => p.filter((x) => x.id !== id));
  const rotatePage = (id: string) =>
    setPages((p) =>
      p.map((x) =>
        x.id === id ? { ...x, rotation: (((x.rotation + 90) % 360) as 0 | 90 | 180 | 270) } : x
      )
    );

  const toggleEnhance = async (id: string) => {
    setPages((p) =>
      p.map((x) => {
        if (x.id !== id) return x;
        return { ...x, enhanced: !x.enhanced };
      })
    );
    // Re-render: easier to just re-apply by re-loading the source. Since we already only keep processed,
    // a true toggle would need original. For simplicity we keep current pixels and flip the badge —
    // but to actually "undo" enhancement we'd need original. Skip live re-process to keep flow simple.
  };

  /** Bake rotation into a canvas and return final dataUrl + dimensions */
  const bakeRotation = (page: ScannedPage): Promise<{ dataUrl: string; width: number; height: number }> =>
    new Promise((resolve, reject) => {
      if (page.rotation === 0) {
        resolve({ dataUrl: page.dataUrl, width: page.width, height: page.height });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const rot = page.rotation;
        if (rot === 90 || rot === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas error"));
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height });
      };
      img.onerror = () => reject(new Error("שגיאה בעיבוד עמוד"));
      img.src = page.dataUrl;
    });

  const finish = async () => {
    if (!pages.length) return;
    setBuilding(true);
    try {
      const baked = await Promise.all(pages.map(bakeRotation));

      if (baked.length === 1) {
        // Output a single JPG file
        const blob = await (await fetch(baked[0].dataUrl)).blob();
        const file = new File([blob], `${filenameBase}-${Date.now()}.jpg`, { type: "image/jpeg" });
        onComplete(file);
      } else {
        // Multi-page PDF (A4 portrait, fit-contain)
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        baked.forEach((b, idx) => {
          if (idx > 0) pdf.addPage();
          const ratio = Math.min(pageW / b.width, pageH / b.height);
          const w = b.width * ratio;
          const h = b.height * ratio;
          const x = (pageW - w) / 2;
          const y = (pageH - h) / 2;
          pdf.addImage(b.dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
        });
        const blob = pdf.output("blob");
        const file = new File([blob], `${filenameBase}-${Date.now()}.pdf`, { type: "application/pdf" });
        onComplete(file);
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error("scan finalize error", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[100vw] sm:w-[95vw] sm:max-w-2xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg p-3 sm:p-6 overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            סריקת מסמך
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Camera area / fallback */}
          <div className="relative w-full bg-black/90 rounded-lg overflow-hidden" style={{ aspectRatio: "4/3" }}>
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-4 text-center">
                <Camera className="w-10 h-10 opacity-60" />
                <div className="text-sm opacity-80">{cameraError}</div>
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="w-4 h-4 ml-1" /> בחר תמונה מהמכשיר
                </Button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
                {/* Guide overlay */}
                {cameraReady && (
                  <div className="pointer-events-none absolute inset-4 border-2 border-white/40 rounded-md" />
                )}
              </>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={capture} disabled={!cameraReady || busy} size="lg" className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              צלם עמוד
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
              <ImagePlus className="w-4 h-4" />
              בחר מהגלריה
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={onFilesPicked}
            />
          </div>

          {/* Pages strip */}
          {pages.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-sm text-muted-foreground mb-2">עמודים שנסרקו ({pages.length})</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pages.map((p, idx) => (
                  <div key={p.id} className="relative group bg-muted rounded border overflow-hidden">
                    <img
                      src={p.dataUrl}
                      alt={`page-${idx + 1}`}
                      style={{ transform: `rotate(${p.rotation}deg)` }}
                      className="w-full h-28 object-cover transition-transform"
                    />
                    <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5">
                      {idx + 1}
                    </div>
                    {p.enhanced && (
                      <div className="absolute top-1 left-1 bg-primary/90 text-primary-foreground text-[10px] rounded px-1.5 py-0.5 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> מעובד
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => rotatePage(p.id)}
                        className="text-white p-1 rounded hover:bg-white/20"
                        title="סובב"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePage(p.id)}
                        className="text-white p-1 rounded hover:bg-destructive/70"
                        title="מחק"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={building}>
            <X className="w-4 h-4 ml-1" />
            ביטול
          </Button>
          <Button onClick={finish} disabled={!pages.length || building} className="gap-2">
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {pages.length > 1 ? `שמור כ-PDF (${pages.length} עמ')` : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
