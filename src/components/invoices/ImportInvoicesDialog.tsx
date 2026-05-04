import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle2, XCircle, Loader2, FileImage } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

interface RowResult {
  fileName: string;
  status: "pending" | "processing" | "ok" | "error" | "skipped";
  message?: string;
  customerName?: string;
  amount?: number;
  customerCreated?: boolean;
  invoiceSkipped?: boolean;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64,
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export function ImportInvoicesDialog({ open, onOpenChange, onDone }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => { setFiles([]); setResults([]); setProgress(0); };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    setFiles(list);
    setResults(list.map(f => ({ fileName: f.name, status: "pending" })));
  };

  const run = async () => {
    if (files.length === 0) return;
    setRunning(true);
    let okCount = 0, errCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "processing" } : r));
      try {
        const b64 = await fileToBase64(file);
        const { data, error } = await supabase.functions.invoke("import-yesh-invoice-image", {
          body: { imageBase64: b64, mimeType: file.type },
        });
        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || "שגיאה לא ידועה");
        }
        okCount++;
        setResults(prev => prev.map((r, idx) => idx === i ? {
          ...r,
          status: data.invoiceSkipped ? "skipped" : "ok",
          customerName: data.extracted?.customer_name,
          amount: data.extracted?.total_with_vat,
          customerCreated: data.customerCreated,
          invoiceSkipped: data.invoiceSkipped,
        } : r));
      } catch (err: any) {
        errCount++;
        setResults(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: "error", message: err.message || String(err),
        } : r));
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      // Small delay between AI calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 600));
    }

    setRunning(false);
    toast.success(`הסתיים: ${okCount} הצליחו, ${errCount} נכשלו`);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>ייבוא חשבוניות מתמונות (AI)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border-2 border-dashed p-6 text-center">
            <FileImage className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <input
              type="file" multiple accept="image/*"
              onChange={handleFiles}
              disabled={running}
              className="block mx-auto text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              העלה תמונות חשבוניות מיש חשבונית. ה-AI יחלץ נתונים, יפתח לקוחות חדשים אוטומטית, וירשום הכנסה.
            </p>
          </div>

          {files.length > 0 && (
            <>
              {running && <Progress value={progress} />}

              <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 text-sm">
                    <div className="shrink-0">
                      {r.status === "pending"    && <div className="w-5 h-5" />}
                      {r.status === "processing" && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                      {r.status === "ok"         && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                      {r.status === "skipped"    && <CheckCircle2 className="w-5 h-5 text-amber-600" />}
                      {r.status === "error"      && <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{r.fileName}</p>
                      {r.status === "ok" && (
                        <p className="text-xs text-muted-foreground">
                          {r.customerName} — ₪{r.amount?.toLocaleString("he-IL")}
                          {r.customerCreated && <span className="text-green-600 mr-1">• לקוח חדש נוצר</span>}
                        </p>
                      )}
                      {r.status === "skipped" && (
                        <p className="text-xs text-amber-700">כבר קיים, דולג</p>
                      )}
                      {r.status === "error" && (
                        <p className="text-xs text-red-600 truncate">{r.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={reset} disabled={running}>נקה</Button>
                <Button onClick={run} disabled={running} className="gap-2">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {running ? "מעבד..." : `התחל ייבוא (${files.length})`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
