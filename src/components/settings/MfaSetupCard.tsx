import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Loader2, Smartphone, Check } from "lucide-react";

/**
 * אימות דו-שלבי (2FA) עם אפליקציית מאמת (TOTP).
 * המשתמש סורק ברקוד פעם אחת עם Google/Microsoft Authenticator,
 * ומאותו רגע כל התחברות דורשת גם קוד מתחלף בן 6 ספרות.
 * הכי בטוח, חינמי, ולא דורש ספק SMS.
 */

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function MfaSetupCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  // תהליך הרשמה
  const [enrolling, setEnrolling] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Factor | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    // מציגים רק TOTP מאומת
    setFactors(((data?.totp || []) as any[]).filter((f) => f.status === "verified"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isEnabled = factors.length > 0;

  const startEnroll = async () => {
    setEnrolling(true);
    setCode("");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `אפליקציית מאמת ${new Date().toLocaleDateString("he-IL")}`,
    });
    if (error || !data) {
      toast({ title: "שגיאה", description: error?.message || "לא ניתן להתחיל הרשמה", variant: "destructive" });
      setEnrolling(false);
      return;
    }
    setFactorId(data.id);
    setQrSvg(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const cancelEnroll = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    setEnrolling(false);
    setQrSvg(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
  };

  const verifyEnroll = async () => {
    if (!factorId || code.trim().length < 6) {
      toast({ title: "קוד חסר", description: "הזן את הקוד בן 6 הספרות מהאפליקציה", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !challenge) throw chErr || new Error("challenge failed");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast({ title: "האימות הדו-שלבי הופעל ✓", description: "מעכשיו כל התחברות תדרוש גם קוד מהאפליקציה" });
      setEnrolling(false);
      setQrSvg(null); setSecret(null); setFactorId(null); setCode("");
      load();
    } catch (e: any) {
      toast({ title: "הקוד שגוי", description: e.message || "נסה שוב עם הקוד העדכני מהאפליקציה", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const removeFactor = async (f: Factor) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "בוטל", description: "האימות הדו-שלבי הוסר מהחשבון" });
    setRemoveTarget(null);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> אימות דו-שלבי (2FA)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : enrolling ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              1. פתח אפליקציית מאמת (Google Authenticator / Microsoft Authenticator) בטלפון ← "הוסף" ← "סרוק ברקוד".
            </p>
            {qrSvg && (
              <div
                className="w-48 h-48 mx-auto bg-white rounded-xl p-2 border border-border"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
            {secret && (
              <p className="text-xs text-center text-muted-foreground">
                לא מצליח לסרוק? הזן ידנית את הקוד:<br />
                <span className="font-mono text-foreground break-all" dir="ltr">{secret}</span>
              </p>
            )}
            <div>
              <Label className="mb-1.5 block">2. הזן את הקוד בן 6 הספרות שמופיע באפליקציה</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                dir="ltr"
                className="text-center text-lg tracking-widest font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={verifyEnroll} disabled={verifying || code.length < 6} className="gap-2 flex-1">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                הפעל אימות דו-שלבי
              </Button>
              <Button variant="ghost" onClick={cancelEnroll} disabled={verifying}>ביטול</Button>
            </div>
          </div>
        ) : isEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>האימות הדו-שלבי <b>פעיל</b> — כל התחברות דורשת קוד מאפליקציית המאמת שלך.</span>
            </div>
            {factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg border border-border">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Smartphone className="w-4 h-4" /> {f.friendly_name || "אפליקציית מאמת"}
                </span>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRemoveTarget(f)}>
                  הסר
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <span>האימות הדו-שלבי <b>כבוי</b>. הפעלתו מוסיפה שכבת הגנה חזקה — גם אם מישהו יגלה את הסיסמה, הוא לא יוכל להיכנס בלי הטלפון שלך.</span>
            </div>
            <Button onClick={startEnroll} className="gap-2 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
              <ShieldCheck className="w-4 h-4" /> הפעל אימות דו-שלבי
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הסרת אימות דו-שלבי</AlertDialogTitle>
            <AlertDialogDescription>
              להסיר את האימות הדו-שלבי? החשבון יחזור להיות מוגן בסיסמה בלבד — פחות מאובטח.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeFactor(removeTarget)}
            >
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
