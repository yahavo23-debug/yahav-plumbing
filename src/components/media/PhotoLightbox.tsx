import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Download, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LightboxPhoto {
  id: string;
  url: string;
  caption?: string | null;
  tag?: string | null;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  canDownload?: boolean;
}

export function PhotoLightbox({ photos, initialIndex, open, onClose, canDownload = false }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setIndex(initialIndex);
    setScale(1);
  }, [initialIndex, open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft") setIndex((i) => Math.min(i + 1, photos.length - 1));
    if (e.key === "ArrowRight") setIndex((i) => Math.max(i - 1, 0));
  }, [open, photos.length, onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open || photos.length === 0) return null;

  const photo = photos[index];
  const tagLabels: Record<string, string> = {
    before: "לפני", after: "אחרי", finding: "ממצא", other: "אחר",
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `photo-${photo.id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
          onClick={onClose}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-70">{index + 1} / {photos.length}</span>
              {photo.tag && (
                <span className="px-2 py-0.5 rounded bg-white/20 text-xs">
                  {tagLabels[photo.tag] || photo.tag}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
                <ZoomOut className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setScale((s) => Math.min(3, s + 0.25))}>
                <ZoomIn className="w-5 h-5" />
              </Button>
              {canDownload && (
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleDownload}>
                  <Download className="w-5 h-5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center overflow-hidden px-4" onClick={(e) => e.stopPropagation()}>
            <motion.img
              key={photo.id}
              src={photo.url}
              alt={photo.caption || ""}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
              style={{ transform: `scale(${scale})` }}
            />
          </div>

          {/* Caption */}
          {photo.caption && (
            <div className="text-center p-3 text-white text-sm opacity-80">{photo.caption}</div>
          )}

          {/* Navigation arrows - RTL aware */}
          {index > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setIndex((i) => i - 1); setScale(1); }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setIndex((i) => i + 1); setScale(1); }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
