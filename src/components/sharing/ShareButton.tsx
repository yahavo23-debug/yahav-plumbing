import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Share2, Copy, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShareButtonProps {
  serviceCallId: string;
  shareType: "details" | "diagnosis" | "media" | "quotes" | "report";
  label?: string;
}

const shareTypeLabels: Record<string, string> = {
  details: "פרטי קריאה",
  diagnosis: "אבחון",
  media: "מדיה",
  quotes: "הצעות מחיר",
  report: "דוחות",
};

// Get the public-facing base URL for share links
const getPublicBaseUrl = (): string => {
  const origin = window.location.origin;
  // If we're in a preview/dev environment, use the published URL
  if (
    origin.includes("preview--") ||
    origin.includes("lovableproject.com") ||
    origin.includes("localhost")
  ) {
    return "https://soft-spark-story.lovable.app";
  }
  // In production (published app or custom domain), use the current origin
  return origin;
};

export const ShareButton = ({ serviceCallId, shareType, label }: ShareButtonProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Check for existing active share
      const { data: existing } = await supabase
        .from("service_call_shares")
        .select("share_token")
        .eq("service_call_id", serviceCallId)
        .eq("share_type", shareType)
        .eq("is_active", true)
        .is("revoked_at", null)
        .limit(1) as any;

      let token: string;

      if (existing && existing.length > 0) {
        token = existing[0].share_token;
      } else {
        const { data, error } = await supabase
          .from("service_call_shares")
          .insert({
            service_call_id: serviceCallId,
            share_type: shareType,
            created_by: user.id,
          } as any)
          .select("share_token")
          .single() as any;

        if (error) throw error;
        token = data.share_token;
      }

      const baseUrl = getPublicBaseUrl();
      const url = `${baseUrl}/s/${token}`;
      setShareUrl(url);
      setDialogOpen(true);
    } catch (err: any) {
      console.error("Share error:", err);
      toast({ title: "שגיאה", description: "לא ניתן ליצור קישור שיתוף", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "הועתק!", description: "הקישור הועתק ללוח" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!shareUrl) return;
    const text = encodeURIComponent(`${shareTypeLabels[shareType]}: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        disabled={loading}
        className="gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
        {label || "שלח ללקוח"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>שיתוף {shareTypeLabels[shareType]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              הקישור הבא מאפשר צפייה בלבד ללא צורך בהתחברות. הלקוח לא יוכל לשנות דבר ולא יראה מידע של לקוחות אחרים.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl || ""}
                className="flex-1 text-sm bg-muted rounded-md px-3 py-2 border border-input text-left direction-ltr"
                dir="ltr"
              />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
                <Copy className="w-4 h-4" />
                העתק קישור
              </Button>
              <Button onClick={handleWhatsApp} className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                וואטסאפ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
