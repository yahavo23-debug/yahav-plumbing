import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SignaturePad } from "./SignaturePad";
import { Shield, AlertTriangle, Eye } from "lucide-react";

interface DiagnosisTabProps {
  serviceCallId: string;
  callData: any;
  onDataUpdate: (data: any) => void;
}

const DETECTION_METHODS = [
  "מצלמה תרמית",
  "גז עקיבה",
  "מצלמת ביוב",
  "שעון לחץ",
  "האזנה אקוסטית",
  "בדיקה ויזואלית",
];

const VISIBLE_DAMAGE_OPTIONS = [
  { value: "moisture", label: "רטיבות" },
  { value: "mold", label: "עובש" },
  { value: "peeling_paint", label: "צבע מתקלף" },
  { value: "swollen_flooring", label: "ריצוף פתוח" },
  { value: "ceiling_damage", label: "נזק בתקרה" },
  { value: "other", label: "אחר" },
];

const CONFIDENCE_OPTIONS = [
  { value: "high", label: "גבוהה", color: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" },
  { value: "medium", label: "בינונית", color: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700" },
  { value: "suspicion", label: "חשד בלבד", color: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700" },
];

const URGENCY_OPTIONS = [
  { value: "immediate", label: "תיקון מיידי", icon: AlertTriangle, color: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700" },
  { value: "soon", label: "מומלץ בקרוב", icon: Shield, color: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700" },
  { value: "monitor", label: "ניטור", icon: Eye, color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700" },
];

export const DiagnosisTab = ({ serviceCallId, callData, onDataUpdate }: DiagnosisTabProps) => {
  // Existing fields
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [findings, setFindings] = useState("");
  const [causeAssessment, setCauseAssessment] = useState("");
  const [recommendations, setRecommendations] = useState("");

  // New professional fields
  const [waterPressureStatus, setWaterPressureStatus] = useState("");
  const [propertyOccupied, setPropertyOccupied] = useState<boolean | null>(null);
  const [mainValveClosed, setMainValveClosed] = useState<boolean | null>(null);
  const [testLimitations, setTestLimitations] = useState("");
  const [diagnosisConfidence, setDiagnosisConfidence] = useState("");
  const [leakLocation, setLeakLocation] = useState("");
  const [visibleDamage, setVisibleDamage] = useState<string[]>([]);
  const [urgencyLevel, setUrgencyLevel] = useState("");
  const [areasNotInspected, setAreasNotInspected] = useState("");
  const [visibleDamageOther, setVisibleDamageOther] = useState("");

  // Signature
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [signatureDate, setSignatureDate] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!callData) return;
    const d = callData as any;
    setSelectedMethods(d.detection_method ? d.detection_method.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setFindings(d.findings || "");
    setCauseAssessment(d.cause_assessment || "");
    setRecommendations(d.recommendations || "");
    setWaterPressureStatus(d.water_pressure_status || "");
    setPropertyOccupied(d.property_occupied ?? null);
    setMainValveClosed(d.main_valve_closed ?? null);
    setTestLimitations(d.test_limitations || "");
    setDiagnosisConfidence(d.diagnosis_confidence || "");
    setLeakLocation(d.leak_location || "");
    const dmg = d.visible_damage || [];
    setVisibleDamage(dmg);
    const otherEntry = dmg.find((v: string) => v.startsWith("other:"));
    setVisibleDamageOther(otherEntry ? otherEntry.replace("other:", "") : "");
    setUrgencyLevel(d.urgency_level || "");
    setAreasNotInspected(d.areas_not_inspected || "");
    setSignaturePath(d.customer_signature_path || null);
    setSignatureDate(d.customer_signature_date || null);
  }, [callData]);

  const saveDiagnosis = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("service_calls")
      .update({
        detection_method: selectedMethods.length > 0 ? selectedMethods.join(", ") : null,
        findings: findings.trim() || null,
        cause_assessment: causeAssessment.trim() || null,
        recommendations: recommendations.trim() || null,
        water_pressure_status: waterPressureStatus.trim() || null,
        property_occupied: propertyOccupied,
        main_valve_closed: mainValveClosed,
        test_limitations: testLimitations.trim() || null,
        diagnosis_confidence: diagnosisConfidence || null,
        leak_location: leakLocation.trim() || null,
        visible_damage: (() => {
          const dmg = visibleDamage.filter(v => v !== "other" && !v.startsWith("other:"));
          if (visibleDamage.includes("other")) {
            dmg.push(visibleDamageOther.trim() ? `other:${visibleDamageOther.trim()}` : "other");
          }
          return dmg.length > 0 ? dmg : null;
        })(),
        urgency_level: urgencyLevel || null,
        areas_not_inspected: areasNotInspected.trim() || null,
      } as any)
      .eq("id", serviceCallId);

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "האבחון המקצועי עודכן בהצלחה" });
      onDataUpdate({
        ...callData,
        detection_method: selectedMethods.join(", "),
        findings, cause_assessment: causeAssessment, recommendations,
        water_pressure_status: waterPressureStatus,
        property_occupied: propertyOccupied,
        main_valve_closed: mainValveClosed,
        test_limitations: testLimitations,
        diagnosis_confidence: diagnosisConfidence,
        leak_location: leakLocation,
        visible_damage: visibleDamage,
        urgency_level: urgencyLevel,
        areas_not_inspected: areasNotInspected,
      });
    }
    setSaving(false);
  };

  const toggleDamage = (value: string) => {
    setVisibleDamage((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Inspection Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">תנאי בדיקה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">מצב לחץ מים</Label>
            <Input
              value={waterPressureStatus}
              onChange={(e) => setWaterPressureStatus(e.target.value)}
              placeholder="לדוגמה: לחץ תקין 3.5 בר"
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-3">
              <Switch
                checked={propertyOccupied === true}
                onCheckedChange={(checked) => setPropertyOccupied(checked)}
              />
              <Label className="text-sm">נכס מאוכלס</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={mainValveClosed === true}
                onCheckedChange={(checked) => setMainValveClosed(checked)}
              />
              <Label className="text-sm">ברז ראשי סגור</Label>
            </div>
          </div>
          <div>
            <Label className="text-sm">מגבלות בדיקה</Label>
            <Textarea
              value={testLimitations}
              onChange={(e) => setTestLimitations(e.target.value)}
              placeholder="לדוגמה: אין גישה לקומה 2, ריהוט כבד חוסם קיר מערבי"
              rows={2}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Detection Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">שיטת איתור</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DETECTION_METHODS.map((method) => {
              const isSelected = selectedMethods.includes(method);
              return (
                <Button
                  key={method}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-4"
                  onClick={() =>
                    setSelectedMethods((prev) =>
                      isSelected ? prev.filter((m) => m !== method) : [...prev, method]
                    )
                  }
                >
                  {method}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 3. Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ממצאים</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="תאר את הממצאים שנמצאו"
            rows={4}
            maxLength={2000}
          />
        </CardContent>
      </Card>



      {/* 6. Cause Assessment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">הערכת סיבה</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={causeAssessment}
            onChange={(e) => setCauseAssessment(e.target.value)}
            placeholder="מה לדעתך גרם לבעייה?"
            rows={3}
            maxLength={2000}
          />
        </CardContent>
      </Card>

      {/* 7. Visible Damage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">נזקים נראים לעין</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {VISIBLE_DAMAGE_OPTIONS.map((opt) => {
              const isSelected = visibleDamage.includes(opt.value);
              return (
                <Button
                  key={opt.value}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-4"
                  onClick={() => toggleDamage(opt.value)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
          {visibleDamage.includes("other") && (
            <div className="mt-3">
              <Textarea
                value={visibleDamageOther}
                onChange={(e) => setVisibleDamageOther(e.target.value)}
                placeholder="פרט נזק אחר..."
                rows={3}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8. Urgency Level */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">רמת דחיפות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {URGENCY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`h-10 px-5 gap-2 border ${
                    urgencyLevel === opt.value
                      ? opt.color + " font-semibold"
                      : ""
                  }`}
                  onClick={() => setUrgencyLevel(opt.value)}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 9. Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">המלצה</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="מה ההמלצה לתיקון"
            rows={4}
            maxLength={2000}
          />
        </CardContent>
      </Card>

      {/* 10. Areas Not Inspected */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">אזורים שלא נבדקו</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={areasNotInspected}
            onChange={(e) => setAreasNotInspected(e.target.value)}
            placeholder="פרט אזורים שלא נבדקו ומדוע (להגנה משפטית)"
            rows={2}
            maxLength={1000}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button onClick={saveDiagnosis} disabled={saving} className="h-12 w-full sm:w-auto">
        {saving ? "שומר..." : "שמור אבחון מקצועי"}
      </Button>

      {/* 11. Customer Signature */}
      <SignaturePad
        serviceCallId={serviceCallId}
        existingSignaturePath={signaturePath}
        existingSignatureDate={signatureDate}
        onSigned={(path, date) => {
          setSignaturePath(path);
          setSignatureDate(date);
        }}
      />
    </div>
  );
};
