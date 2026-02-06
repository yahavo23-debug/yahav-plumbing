import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  url: string;
  title: string;
  open: boolean;
  onClose: () => void;
}

export function VideoPlayer({ url, title, open, onClose }: VideoPlayerProps) {
  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between p-4 text-white">
            <h3 className="font-medium truncate">{title}</h3>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Video */}
          <div className="flex-1 flex items-center justify-center px-4 pb-4">
            <video
              src={url}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg"
              style={{ maxHeight: "calc(100vh - 100px)" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
