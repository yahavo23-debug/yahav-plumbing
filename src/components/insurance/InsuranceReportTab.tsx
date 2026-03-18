import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, FileDown } from "lucide-react";
import { InsurancePdfGenerator } from "./InsurancePdfGenerator";

const damageTypes = [
  { value: "leak", label: "נזילה" },
  { value: "burst", label: "פיצוץ" },
  { value: "clog", label: "סתימה" },
  { value: "structural", label: "נזק מבני" },
  { value: "other", label: "אחר" },
];

interface CostItem {
  description: string;
  amount: number;
}

interface InsuranceReportTabProps {
  serviceCallId: string;
  callData: any;
  readOnly?: boolean;
}

export function InsuranceReportTab({ serviceCallId, callData, readOnly }: InsuranceReportTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportMode, setReportMode] = useState<"quote" | "repair">("repair");
  const [eventDescription, setEventDescription] = useState("");
  const [damageType, setDamageType] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [technicalDetails, setTechnicalDetails] = useState("");
  const [costSummary, setCostSummary] = useState<CostItem[]>([]);
  const [professionalStatement, setProfessionalStatement] = useState("");
  const [photos, setPhotos] = useState<any[]>([]);

  const customer = callData?.customers;

  useEffect(() => {
    loadReport();
    loadPhotos();
  }, [serviceCallId]);

  const loadReport = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("insurance_reports" as any)
      .select("*")
      .eq("service_call_id", serviceCallId)
      .order("created_at", { ascending: false })
      .limit(1);

    const reports = data as any[];
    if (reports && reports.length > 0) {
      const r = reports[0];
      setReportId(r.id);
      setReportMode(r.report_mode || "repair");
      setEventDescription(r.event_description || "");
      setDamageType(r.damage_type || "");
      setIsEmergency(r.is_emergency || false);
      setTechnicalDetails(r.technical_details || "");
      setCostSummary(r.cost_summary || []);
      setProfessionalStatement(r.professional_statement || "");
    }
    setLoading(false);
  };

  const loadPhotos = async () => {
    const { data } = await supabase
      .from("service_call_photos")
      .select("*")
      .eq("service_call_id", serviceCallId)
      .order("created_at");
    setPhotos(data || []);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        service_call_id: serviceCallId,
        report_mode: reportMode,
        event_description: eventDescription.trim() || null,
        damage_type: damageType || null,
        is_emergency: isEmergency,
        technical_details: technicalDetails.trim() || null,
        cost_summary: costSummary,
        professional_statement: professionalStatement.trim() || null,
      };

      if (reportId) {
        const { error } = await supabase
          .from("insurance_reports" as any)
          .update(payload)
          .eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("insurance_reports" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setReportId((data as any).id);
      }
      toast({ title: "נשמר", description: "דו״ח הביטוח נשמר בהצלחה" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addCostItem = () => {
    setCostSummary([...costSummary, { description: "", amount: 0 }]);
  };

  const updateCostItem = (index: number, field: keyof CostItem, value: string | number) => {
    const updated = [...costSummary];
    updated[index] = { ...updated[index], [field]: value };
    setCostSummary(updated);
  };

  const removeCostItem = (index: number) => {
    setCostSummary(costSummary.filter((_, i) => i !== index));
  };

  const totalCost = costSummary.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">סוג מסמך</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant={reportMode === "quote" ? "default" : "outline"}
              onClick={() => !readOnly && setReportMode("quote")}
              disabled={readOnly}
            >
              הצעת מחיר לביטוח
            </Button>
            <Button
              variant={reportMode === "repair" ? "default" : "outline"}
              onClick={() => !readOnly && setReportMode("repair")}
              disabled={readOnly}
            >
              דו״ח תיקון
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Event description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">תיאור האירוע</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>תיאור המפגע</Label>
            <Textarea
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
              placeholder='לדוגמה: "זיהוי נזילה פעילה עקב פיצוץ צנרת ראשית"'
              rows={4}
              disabled={readOnly}
              className="mt-1"
            />
          </div>

          <div>
            <Label>מהות הנזק</Label>
            <Select value={damageType} onValueChange={setDamageType} disabled={readOnly}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="בחר סוג נזק" />
              </SelectTrigger>
              <SelectContent>
                {damageTypes.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>
                    {dt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="emergency"
              checked={isEmergency}
              onCheckedChange={(v) => setIsEmergency(!!v)}
              disabled={readOnly}
            />
            <Label htmlFor="emergency" className="cursor-pointer">
              עבודת חירום למניעת נזק תוצאתי
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Technical details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פירוט טכני של התיקון</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={technicalDetails}
            onChange={(e) => setTechnicalDetails(e.target.value)}
            placeholder="פירוט החלקים שהוחלפו והפעולות שבוצעו (ברזים, ניאגרות, שסתומי אל-חוזר וכו׳)"
            rows={6}
            disabled={readOnly}
          />
        </CardContent>
      </Card>

      {/* Cost summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">סיכום עלויות לביטוח</CardTitle>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addCostItem} className="gap-1">
                <Plus className="w-4 h-4" /> הוסף שורה
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {costSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              לא הוזנו עלויות. לחץ "הוסף שורה" להוספת פריט.
            </p>
          ) : (
            <div className="space-y-3">
              {costSummary.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={item.description}
                    onChange={(e) => updateCostItem(i, "description", e.target.value)}
                    placeholder="תיאור (עבודה / חומרים)"
                    className="flex-1"
                    disabled={readOnly}
                  />
                  <Input
                    type="number"
                    value={item.amount || ""}
                    onChange={(e) => updateCostItem(i, "amount", Number(e.target.value))}
                    placeholder="סכום ₪"
                    className="w-28"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <Button variant="ghost" size="icon" onClick={() => removeCostItem(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">סה״כ:</span>
                <span className="font-bold text-lg">₪{totalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">סה״כ כולל מע״מ (18%):</span>
                <span className="font-semibold">₪{(totalCost * 1.18).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Professional statement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הצהרת איש מקצוע</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={professionalStatement}
            onChange={(e) => setProfessionalStatement(e.target.value)}
            placeholder="אני, הח״מ, מצהיר כי ביצעתי בדיקה מקצועית ומצאתי..."
            rows={4}
            disabled={readOnly}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {!readOnly && (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            שמור דו״ח ביטוח
          </Button>
        )}
        {reportId && (
          <InsurancePdfGenerator
            reportData={{
              reportMode,
              eventDescription,
              damageType,
              isEmergency,
              technicalDetails,
              costSummary,
              professionalStatement,
            }}
            serviceCall={callData}
            customer={customer}
            photos={photos}
          />
        )}
      </div>
    </div>
  );
}
