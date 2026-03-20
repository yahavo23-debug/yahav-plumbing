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

const LEGAL_SECTIONS = [
  { title: "1. הגדרת העבודה", text: "העבודה בוצעה בהתאם למפורט בדוח העבודה בלבד. כל עבודה, רכיב או תיקון שלא צוינו במפורש – אינם כלולים באחריות." },
  { title: "2. היקף האחריות", text: "האחריות מוגבלת אך ורק למקטע שטופל/הוחלף בפועל ומתועד בדוח זה. המערכת נבדקה במעמד סיום העבודה, בנוכחות הלקוח, ונמצאה תקינה. לא תחול אחריות על כלל מערכת האינסטלציה בנכס או על תקלות עתידיות במקטעים סמוכים." },
  { title: "3. תשתית ישנה (צנרת פריכה)", text: "לא תחול אחריות לנזקים הנובעים ממצב תשתית קיימת ומתבלה, לרבות צנרת ישנה/פריכה, עקב בלאי טבעי או זעזוע סביר והכרחי של המערכת במהלך העבודה." },
  {
    title: "4. שירותי איתור נזילות וייעוץ",
    text: "ככל שבוצע איתור נזילות במסגרת העבודה:",
    bullets: [
      "הערכה בלבד: השירות (לרבות ציוד טרמי/אקוסטי/גז) מהווה הערכה מקצועית בלבד בהתאם לממצאים ולמגבלות הציוד בשטח, ואינו מהווה התחייבות לזיהוי ודאי של מקור הנזילה.",
      "אישור ועלויות חשיפה: כל פתיחה/חציבה תבוצע רק לאחר אישור הלקוח למיקום. לא תחול אחריות לעלויות חשיפה שבוצעו בהתאם להערכת האיתור ובאמצעים סבירים, גם אם התברר בדיעבד כי המקור שונה.",
      "ריבוי מוקדים: ייתכן קיומם של מספר מוקדי נזילה במקביל, ואיתור מוקד אחד אינו מבטיח היעדר מוקדים נוספים.",
      "שכר טרחה: התשלום הינו עבור עצם ביצוע הבדיקה, הניתוח והפקת הדוח, ואינו מותנה בזיהוי ודאי של המקור או בביצוע התיקון בפועל.",
    ],
  },
  { title: "5. פתיחת סתימות", text: "פתיחת סתימה אינה מקנה אחריות לחזרתה כאשר נגרמה משימוש לא תקין או מכשל מבני בצנרת (לרבות: מגבונים, שומנים, חדירת שורשים, שקיעת קו או שבר)." },
  { title: "6. תיקון נקודתי", text: "ככל שהלקוח בחר בתיקון נקודתי חלף טיפול מקיף שהומלץ – לא תחול אחריות להמשך תקינות המערכת מעבר למקטע שתוקן בפועל." },
  { title: "7. חובת דיווח והקטנת נזק", text: "הלקוח מתחייב לדווח מיידית עם גילוי של כל חשד לתקלה או רטיבות. כל נזק תוצאתי או עקיף (לריהוט, ריצוף, עובש וכו׳) שנגרם עקב השהיית הדיווח ואי-הקטנת הנזק – יחול על הלקוח בלבד." },
  { title: "8. נזקים עקיפים", text: "לא תחול אחריות לנזקים עקיפים (כגון רטיבות, עובש, נזק לריהוט או ירידת ערך) הנובעים ממצב התשתית המקורית או מאי-דיווח מיידי כאמור." },
  { title: "9. עבודות גמר", text: "עבודות סגירה (ריצוף, בטון, טיח) מהוות תיקון פונקציונלי וראשוני בלבד, ואינן כוללות עבודות גמר מקצועיות, רובה או התאמות גוון." },
  { title: "10. אחריות (ככל שניתנה)", text: "האחריות, ככל שניתנה, חלה רק על העבודה שבוצעה בפועל ולתקופה שסוכמה בכתב. בהיעדר ציון מפורש – לא תחול אחריות." },
  { title: "11. תיעוד והתערבות חיצונית", text: "תמונות וסרטונים שצולמו בשטח מהווים חלק בלתי נפרד מהדוח וישמשו כראיה למצב התשתית ולביצוע העבודה. כל התערבות של גורם אחר במקטע שטופל – מבטלת את האחריות לאלתר." },
];

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
        <div className="bg-muted/60 border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground text-center border-b border-border pb-2">
            נספח תנאים, הגבלת אחריות והצהרת ביצוע — {BUSINESS_INFO.name}
          </h3>
          {LEGAL_SECTIONS.map((section, i) => (
            <div key={i}>
              <p className="text-xs font-bold text-foreground mb-0.5">{section.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{section.text}</p>
              {section.bullets && (
                <ul className="text-xs leading-relaxed text-muted-foreground list-disc pr-4 mt-1 space-y-0.5">
                  {section.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
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
