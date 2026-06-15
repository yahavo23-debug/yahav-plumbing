import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScanLine, Loader2, Check, X, Crop, Camera } from "lucide-react";

type FilterMode = "photo" | "color" | "grayscale" | "bw";
type CropMode = "auto" | "manual";
interface Rect { x: number; y: number; w: number; h: number; }

interface Props {
  onUploaded: (path: string) => void;
}

// ─── Image processing helpers ───────────────────────────────────────────────

function detectEdges(img: HTMLImageElement): Rect {
  const SAMPLE = 200;
  const c = document.createElement("canvas");
  const scale = Math.min(SAMPLE / img.naturalWidth, SAMPLE / img.naturalHeight);
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);

  const corner = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const bg = corner(0, 0).map((v, i) =>
    (v + corner(width - 1, 0)[i] + corner(0, height - 1)[i] + corner(width - 1, height - 1)[i]) / 4
  );

  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (diff > 35) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }

  const pad = 3;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad); maxY = Math.min(height, maxY + pad);

  if (maxX <= minX || maxY <= minY) return { x: 3, y: 3, w: 94, h: 94 };
  return {
    x: (minX / width) * 100,
    y: (minY / height) * 100,
    w: ((maxX - minX) / width) * 100,
    h: ((maxY - minY) / height) * 100,
  };
}

function renderToCanvas(canvas: HTMLCanvasElement, img: HTMLImageElement, crop: Rect, filter: FilterMode) {
  const srcX = (crop.x / 100) * img.naturalWidth;
  const srcY = (crop.y / 100) * img.naturalHeight;
  const srcW = (crop.w / 100) * img.naturalWidth;
  const srcH = (crop.h / 100) * img.naturalHeight;
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  if (filter === "color") {
    // Mild contrast boost for scanned-doc feel
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = Math.min(255, Math.max(0, (d[i]     - 128) * 1.2 + 128));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * 1.2 + 128));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * 1.2 + 128));
    }
    ctx.putImageData(id, 0, 0);
  } else if (filter === "grayscale" || filter === "bw") {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const enhanced = Math.min(255, Math.max(0, (g - 128) * 1.4 + 128));
      const v = filter === "bw" ? (enhanced > 145 ? 255 : 0) : enhanced;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(id, 0, 0);
  }
  // "photo" = no processing
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DocumentScanner({ onUploaded }: Props) {
  const { user } = useAuth();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [filter, setFilter] = useState<FilterMode>("color");
  const [cropMode, setCropMode] = useState<CropMode>("auto");
  const [crop, setCrop] = useState<Rect>({ x: 5, y: 5, w: 90, h: 90 });
  const [uploading, setUploading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const manualContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ corner: string; startX: number; startY: number; startCrop: Rect } | null>(null);

  // Always keep output canvas up-to-date (used for upload)
  useEffect(() => {
    if (!img || !outputCanvasRef.current) return;
    renderToCanvas(outputCanvasRef.current, img, crop, filter);
  }, [img, crop, filter]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const el = new Image();
    const url = URL.createObjectURL(file);
    el.onload = () => { setImg(el); setCrop(detectEdges(el)); setCropMode("auto"); };
    el.src = url;
  };

  // Compute the rendered image rect inside manualContainerRef (object-contain letterboxing)
  const getImageDisplayRect = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    if (!manualContainerRef.current || !img) return null;
    const cont = manualContainerRef.current.getBoundingClientRect();
    const ia = img.naturalWidth / img.naturalHeight;
    const ca = cont.width / cont.height;
    let iw, ih, ix, iy;
    if (ia > ca) {
      iw = cont.width; ih = cont.width / ia;
      ix = cont.left; iy = cont.top + (cont.height - ih) / 2;
    } else {
      ih = cont.height; iw = cont.height * ia;
      iy = cont.top; ix = cont.left + (cont.width - iw) / 2;
    }
    return { left: ix, top: iy, width: iw, height: ih };
  }, [img]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { corner, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  }, [crop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const ir = getImageDisplayRect();
    if (!ir) return;

    const dx = ((e.clientX - dragRef.current.startX) / ir.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / ir.height) * 100;
    const sc = dragRef.current.startCrop;
    const MIN = 10;
    let { x, y, w, h } = sc;

    switch (dragRef.current.corner) {
      case "tl":
        x = Math.max(0, Math.min(sc.x + dx, sc.x + sc.w - MIN));
        y = Math.max(0, Math.min(sc.y + dy, sc.y + sc.h - MIN));
        w = sc.w - (x - sc.x); h = sc.h - (y - sc.y); break;
      case "tr":
        y = Math.max(0, Math.min(sc.y + dy, sc.y + sc.h - MIN));
        w = Math.max(MIN, Math.min(sc.w + dx, 100 - sc.x));
        h = sc.h - (y - sc.y); break;
      case "bl":
        x = Math.max(0, Math.min(sc.x + dx, sc.x + sc.w - MIN));
        w = sc.w - (x - sc.x);
        h = Math.max(MIN, Math.min(sc.h + dy, 100 - sc.y)); break;
      case "br":
        w = Math.max(MIN, Math.min(sc.w + dx, 100 - sc.x));
        h = Math.max(MIN, Math.min(sc.h + dy, 100 - sc.y)); break;
    }
    setCrop({ x, y, w, h });
  }, [getImageDisplayRect]);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const handleUpload = async () => {
    if (!outputCanvasRef.current || !user) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        outputCanvasRef.current!.toBlob(b => b ? resolve(b) : reject(new Error("שגיאת canvas")), "image/jpeg", 0.92)
      );
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage
        .from("finance-docs")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      onUploaded(path);
      toast({ title: "המסמך הועלה בהצלחה" });
      handleClose();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setImg(null);
    setFilter("color");
    setCropMode("auto");
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
    if (inputRef.current) inputRef.current.value = "";
  };

  const FILTERS: { key: FilterMode; label: string }[] = [
    { key: "photo",     label: "תמונה" },
    { key: "color",     label: "צבע"   },
    { key: "grayscale", label: "אפור"  },
    { key: "bw",        label: "שח״ל"  },
  ];

  const CORNERS = ["tl", "tr", "bl", "br"] as const;

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
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="w-full gap-2 border-dashed border-2 h-11 text-muted-foreground hover:text-foreground"
      >
        <ScanLine className="w-4 h-4" />
        סרוק מסמך
      </Button>

      <Dialog open={!!img} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-sm p-4" dir="rtl">
          <DialogHeader className="pb-1">
            <DialogTitle>סריקת מסמך</DialogTitle>
          </DialogHeader>

          {img && (
            <div className="space-y-3">

              {/* ── Auto mode: show processed canvas ── */}
              <div
                className="bg-muted rounded-lg overflow-hidden flex items-center justify-center"
                style={{ height: 260, display: cropMode === "auto" ? "flex" : "none" }}
              >
                <canvas
                  ref={outputCanvasRef}
                  style={{ maxWidth: "100%", maxHeight: 256, display: "block" }}
                />
              </div>

              {/* ── Manual mode: original image + draggable crop overlay ── */}
              {cropMode === "manual" && (
                <div
                  ref={manualContainerRef}
                  className="relative bg-black rounded-lg overflow-hidden select-none"
                  style={{ height: 260 }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <img
                    src={img.src}
                    alt=""
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                  {/* Dark vignette outside crop */}
                  <div className="absolute inset-0 pointer-events-none"
                       style={{ background: "rgba(0,0,0,0.55)" }} />
                  {/* Crop cutout */}
                  <div
                    className="absolute border-2 border-white pointer-events-none"
                    style={{
                      left: `${crop.x}%`, top: `${crop.y}%`,
                      width: `${crop.w}%`, height: `${crop.h}%`,
                      background: "transparent",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                    }}
                  />
                  {/* Corner handles */}
                  {CORNERS.map(corner => (
                    <div
                      key={corner}
                      className="absolute bg-white rounded-sm z-10"
                      style={{
                        width: 22, height: 22,
                        left:  corner.endsWith("l") ? `calc(${crop.x}% - 11px)` : `calc(${crop.x + crop.w}% - 11px)`,
                        top:   corner.startsWith("t") ? `calc(${crop.y}% - 11px)` : `calc(${crop.y + crop.h}% - 11px)`,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => onPointerDown(e, corner)}
                    />
                  ))}
                  {/* Hidden processing canvas (always updated by useEffect) */}
                  <canvas ref={outputCanvasRef} className="hidden" />
                </div>
              )}

              {/* ── Crop mode toggle ── */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button" size="sm"
                  variant={cropMode === "auto" ? "default" : "outline"}
                  onClick={() => { setCropMode("auto"); setCrop(detectEdges(img)); }}
                  className="gap-1.5"
                >
                  <Crop className="w-3.5 h-3.5" /> אוטומטי
                </Button>
                <Button
                  type="button" size="sm"
                  variant={cropMode === "manual" ? "default" : "outline"}
                  onClick={() => setCropMode("manual")}
                >
                  ידני
                </Button>
              </div>

              {/* ── Filter selector ── */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">פילטר</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {FILTERS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`text-xs py-2 rounded-md border font-medium transition-colors ${
                        filter === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Rescan ── */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5" /> צלם מחדש
              </button>
            </div>
          )}

          <DialogFooter className="gap-2 pt-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={uploading} className="flex-1">
              <X className="w-4 h-4 ml-1" /> ביטול
            </Button>
            <Button type="button" onClick={handleUpload} disabled={uploading} className="flex-1">
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin ml-1" />
                : <Check className="w-4 h-4 ml-1" />}
              העלה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
