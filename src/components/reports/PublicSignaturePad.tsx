import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, RotateCcw, Pen, AlertCircle } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/pdf-utils";

interface PublicSignaturePadProps {
  shareToken: string;
  onSigned: (signatureDate: string) => void;
}

const LEGAL_DISCLAIMER = `אני מאשר/ת בחתימתי כי קיבלתי את דוח העבודה לעיל, כולל ממצאים והמלצות, כפי שהוצגו בפניי על ידי ${BUSINESS_INFO.name}. קראתי והבנתי את תוכן הדוח במלואו. ידוע לי כי אחריות הביצוע של ההמלצות חלה עליי ו/או על מי מטעמי. ${BUSINESS_INFO.name} לא יישא באחריות לנזקים שייגרמו כתוצאה מאי ביצוע ההמלצות המפורטות בדוח זה.`;

export const PublicSignaturePad = ({ shareToken, onSigned }: PublicSignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerId, setSignerId] = useState("");
  const [idTouched, setIdTouched] = useState(false);

  const isIdValid = /^\d{9}$/.test(signerId);
  const showIdError = idTouched && !isIdValid;
  const canSign = hasSignature && signerName.trim().length > 0 && isIdValid;

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
    if (!canvasRef.current || !canSign) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate signature image");

      const formData = new FormData();
      formData.append("share_token", shareToken);
      formData.append("signature", blob, "signature.png");
      formData.append("signed_by", signerName.trim());
      formData.append("signer_id_number", signerId.trim());

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
      <CardContent className="space-y-4">
        {/* Legal disclaimer */}
        <div className="bg-muted/60 border border-border rounded-lg p-4">
          <p className="text-sm leading-relaxed font-medium text-foreground">
            {LEGAL_DISCLAIMER}
          </p>
        </div>

        {/* Signer name */}
        <div className="space-y-2">
          <Label className="text-sm">
            שם מלא <span className="text-destructive">*</span>
          </Label>
          <Input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="הזן שם מלא..."
            className="max-w-xs"
            required
          />
        </div>

        {/* Signer ID number */}
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-1">
            תעודת זהות (9 ספרות) <span className="text-destructive">*</span>
            {showIdError && <AlertCircle className="w-4 h-4 text-destructive animate-pulse" />}
          </Label>
          <Input
            value={signerId}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 9);
              setSignerId(v);
              if (!idTouched) setIdTouched(true);
            }}
            onBlur={() => setIdTouched(true)}
            placeholder="000000000"
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
            className={`max-w-xs ${showIdError ? "border-destructive ring-2 ring-destructive/30 animate-pulse" : ""}`}
            required
          />
          {showIdError && (
            <div className="flex items-center gap-1.5 text-destructive text-xs font-medium animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>יש להזין תעודת זהות בעלת 9 ספרות בדיוק</span>
            </div>
          )}
        </div>

        {/* Signature canvas */}
        <div>
          <Label className="text-sm mb-2 block">חתימה <span className="text-destructive">*</span></Label>
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
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasSignature || saving} className="gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> נקה
          </Button>
          <Button size="sm" onClick={saveSignature} disabled={!canSign || saving} className="gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? "שומר..." : "חתום ושלח"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
