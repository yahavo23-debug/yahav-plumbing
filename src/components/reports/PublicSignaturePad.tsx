import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, RotateCcw, Pen } from "lucide-react";

interface PublicSignaturePadProps {
  shareToken: string;
  onSigned: (signatureDate: string) => void;
}

export const PublicSignaturePad = ({ shareToken, onSigned }: PublicSignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || initialized) return;
    canvasRef.current = canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    setInitialized(true);
  }, [initialized]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
  };

  const saveSignature = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate signature image");

      const formData = new FormData();
      formData.append("share_token", shareToken);
      formData.append("signature", blob, "signature.png");

      const { data, error } = await supabase.functions.invoke("sign-public-report", {
        body: formData,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onSigned(data.signature_date);
    } catch (err: any) {
      console.error("Signature save error:", err);
      alert("שגיאה בשמירת החתימה: " + (err.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Pen className="w-4 h-4" />
          אישור לקוח — חתימה על קבלת ממצאים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          אני מאשר/ת שקיבלתי את ממצאי הבדיקה והוסברו לי התוצאות וההמלצות.
        </p>
        <div className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={initCanvas}
            className="w-full cursor-crosshair touch-none"
            style={{ height: 150 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasSignature || saving} className="gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> נקה
          </Button>
          <Button size="sm" onClick={saveSignature} disabled={!hasSignature || saving} className="gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? "שומר..." : "שמור חתימה"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
