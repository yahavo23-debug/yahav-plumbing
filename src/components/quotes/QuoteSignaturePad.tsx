import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Check, RotateCcw, Pen } from "lucide-react";

interface QuoteSignaturePadProps {
  quoteId: string;
  existingSignaturePath?: string | null;
  existingSignedAt?: string | null;
  onSigned: (path: string, date: string) => void;
}

export const QuoteSignaturePad = ({
  quoteId,
  existingSignaturePath,
  existingSignedAt,
  onSigned,
}: QuoteSignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const isSigned = !!existingSignaturePath;

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  useEffect(() => {
    if (isSigned) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
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
  }, [isSigned]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (isSigned) return;
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || isSigned) return;
    const ctx = getCtx();
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
    if (!canvasRef.current || !user) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate signature image");

      const filePath = `${user.id}/quotes/${quoteId}-signature-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(filePath, blob, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          signature_path: filePath,
          signed_at: now,
        } as any)
        .eq("id", quoteId);

      if (updateError) throw updateError;

      onSigned(filePath, now);
      toast({ title: "חתימה נשמרה", description: "חתימת הלקוח על הצעת המחיר נשמרה בהצלחה" });
    } catch (err: any) {
      console.error("Quote signature save error:", err);
      toast({
        title: "שגיאה בשמירת החתימה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isSigned) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            הצעת מחיר נחתמה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            נחתמה בתאריך:{" "}
            {existingSignedAt
              ? new Date(existingSignedAt).toLocaleString("he-IL")
              : "—"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Pen className="w-4 h-4" />
          חתימת לקוח על הצעת מחיר
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          אני מאשר/ת את הצעת המחיר ומסכים/ה לתנאים המפורטים בה.
        </p>
        <div className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
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
          <Button
            variant="outline"
            size="sm"
            onClick={clearCanvas}
            disabled={!hasSignature || saving}
            className="gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> נקה
          </Button>
          <Button
            size="sm"
            onClick={saveSignature}
            disabled={!hasSignature || saving}
            className="gap-1"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? "שומר..." : "שמור חתימה"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
