import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Landmark, Loader2 } from "lucide-react";

/**
 * הגדרות תשלום של העסק — פרטי בנק וביט שמופיעים בדוחות גבייה ובעמוד התשלום.
 * מוזן פעם אחת ע"י המנהל; הצגת מידע בלבד ללקוח (כמו על חשבונית), בלי שום עיבוד תשלומים.
 */

interface PaymentSettings {
  business_name: string;
  business_license: string;
  bank_name: string;
  bank_number: string;
  branch_number: string;
  account_number: string;
  beneficiary_name: string;
  bit_phone: string;
}

const EMPTY: PaymentSettings = {
  business_name: "",
  business_license: "",
  bank_name: "",
  bank_number: "",
  branch_number: "",
  account_number: "",
  beneficiary_name: "",
  bit_phone: "",
};

const FIELDS: { key: keyof PaymentSettings; label: string; ltr?: boolean }[] = [
  { key: "business_name", label: "שם העסק" },
  { key: "business_license", label: "ח.פ / עוסק מורשה", ltr: true },
  { key: "beneficiary_name", label: "שם המוטב (על שם)" },
  { key: "bank_name", label: "בנק" },
  { key: "bank_number", label: "מספר בנק", ltr: true },
  { key: "branch_number", label: "מספר סניף", ltr: true },
  { key: "account_number", label: "מספר חשבון", ltr: true },
  { key: "bit_phone", label: "מספר ביט (bit)", ltr: true },
];

export function PaymentSettingsCard() {
  const [values, setValues] = useState<PaymentSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("business_payment_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        const next = { ...EMPTY };
        (Object.keys(EMPTY) as (keyof PaymentSettings)[]).forEach((k) => {
          next[k] = data[k] ?? "";
        });
        setValues(next);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("business_payment_settings")
      .upsert({ id: 1, ...values, business_license: values.business_license || null, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "פרטי התשלום יופיעו בדוחות הגבייה ובעמוד התשלום" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-4 h-4" /> פרטי תשלום לגבייה (בנק + ביט)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              הפרטים מוצגים ללקוח בדוח הגבייה ובעמוד התשלום, עם כפתור העתקה לכל שדה — בדיוק כמו על חשבונית.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="mb-1 block text-xs">{f.label}</Label>
                  <Input
                    value={values[f.key]}
                    dir={f.ltr ? "ltr" : "rtl"}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              שמור פרטי תשלום
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
