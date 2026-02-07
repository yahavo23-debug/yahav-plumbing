import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLogo } from "@/hooks/useLogo";
import { toast } from "@/hooks/use-toast";
import { Upload, Image, Loader2 } from "lucide-react";

export function LogoUpload() {
  const { user } = useAuth();
  const { logoUrl, refresh } = useLogo();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "שגיאה", description: "יש לבחור קובץ תמונה", variant: "destructive" });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "שגיאה", description: "גודל הקובץ חייב להיות עד 2MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `logo.${ext}`;

      // Delete existing logo files
      const { data: existing } = await supabase.storage.from("branding").list();
      if (existing && existing.length > 0) {
        await supabase.storage.from("branding").remove(existing.map((f) => f.name));
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Update branding_settings
      const { error: updateError } = await (supabase as any)
        .from("branding_settings")
        .update({ logo_path: path, updated_by: user.id })
        .eq("is_singleton", true);
      if (updateError) throw updateError;

      toast({ title: "הלוגו עודכן", description: "הלוגו החדש נשמר בהצלחה" });
      await refresh();
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Image className="w-4 h-4" /> לוגו החברה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {logoUrl && (
          <div className="flex justify-center p-4 bg-muted rounded-lg">
            <img src={logoUrl} alt="לוגו נוכחי" className="max-h-20 max-w-48 object-contain" />
          </div>
        )}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> מעלה...</>
            ) : (
              <><Upload className="w-4 h-4" /> {logoUrl ? "החלף לוגו" : "העלה לוגו"}</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">תמונה עד 2MB. מומלץ PNG שקוף.</p>
        </div>
      </CardContent>
    </Card>
  );
}
