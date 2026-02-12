import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ScopeOfWorkData {
  project_overview: string;
  demolition: string;
  plumbing: string;
  drying_included: boolean;
  drying_duration_days: string;
  restoration_included: boolean;
  restoration_details: string;
  tiling_included: boolean;
  tiling_pricing_method: "sqm" | "daily" | "";
  tiling_price: string;
  materials_note: string;
  workforce_crew_size: string;
  workforce_duration_days: string;
  equipment_note: string;
  warranty_note: string;
}

export const DEFAULT_SCOPE: ScopeOfWorkData = {
  project_overview:
    "שיפוץ כללי / שדרוג אינסטלציה בנכס, כולל עבודה, חומרים, תיאום עם בעלי מקצוע נוספים ואחריות מלאה עד לסיום.",
  demolition:
    "• הסרת תשתיות קיימות לפי הצורך\n• הכנת האתר להתקנת אינסטלציה חדשה\n• פינוי פסולת",
  plumbing:
    "• קווי מים חדשים (חם/קר)\n• התאמות ניקוז\n• התקנת אינטרפלאש / אביזרים\n• בדיקת לחץ\n• בדיקת מערכת סופית",
  drying_included: false,
  drying_duration_days: "",
  restoration_included: false,
  restoration_details: "• ריצוף / אריחים\n• תיקון קירות\n• טיח וצבע\n• איטום",
  tiling_included: false,
  tiling_pricing_method: "",
  tiling_price: "",
  materials_note: "חומרים מסופקים על ידי הקבלן אלא אם צוין אחרת.",
  workforce_crew_size: "",
  workforce_duration_days: "",
  equipment_note: "כלים תעשייתיים וציוד איתור נזילות כלולים לפי הצורך.",
  warranty_note: "אחריות על טיב העבודה בהתאם לחוק ולמדיניות החברה.",
};

interface ScopeOfWorkSectionProps {
  data: ScopeOfWorkData;
  onChange: (data: ScopeOfWorkData) => void;
}

export const ScopeOfWorkSection = ({ data, onChange }: ScopeOfWorkSectionProps) => {
  const [expanded, setExpanded] = useState(true);

  const update = (field: keyof ScopeOfWorkData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <Button
        type="button"
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-3 h-auto"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <span className="font-bold text-base">תכולת עבודה (Scope of Work)</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </Button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t">
          {/* 1. Project Overview */}
          <SectionBlock number={1} title="סקירת הפרויקט" titleEn="Project Overview">
            <Textarea
              value={data.project_overview}
              onChange={(e) => update("project_overview", e.target.value)}
              rows={3}
              className="text-sm"
            />
          </SectionBlock>

          {/* 2. Demolition & Preparation */}
          <SectionBlock number={2} title="פירוק והכנה" titleEn="Demolition & Preparation">
            <Textarea
              value={data.demolition}
              onChange={(e) => update("demolition", e.target.value)}
              rows={4}
              className="text-sm font-mono"
            />
          </SectionBlock>

          {/* 3. Plumbing Installation */}
          <SectionBlock number={3} title="התקנת אינסטלציה" titleEn="Plumbing Installation">
            <Textarea
              value={data.plumbing}
              onChange={(e) => update("plumbing", e.target.value)}
              rows={6}
              className="text-sm font-mono"
            />
          </SectionBlock>

          {/* 4. Drying */}
          <SectionBlock number={4} title="ייבוש תת-רצפתי" titleEn="Subfloor Drying">
            <div className="space-y-3">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!data.drying_included}
                    onCheckedChange={() => update("drying_included", false)}
                  />
                  <span className="text-sm">לא כלול</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={data.drying_included}
                    onCheckedChange={() => update("drying_included", true)}
                  />
                  <span className="text-sm">כלול — ייבוש תעשייתי עם ציוד מקצועי</span>
                </label>
              </div>
              {data.drying_included && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    משך משוער:
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={data.drying_duration_days}
                    onChange={(e) => update("drying_duration_days", e.target.value)}
                    className="h-8 w-24"
                    placeholder="ימים"
                  />
                  <span className="text-sm text-muted-foreground">ימים</span>
                </div>
              )}
            </div>
          </SectionBlock>

          {/* 5. Structural Restoration */}
          <SectionBlock number={5} title="שיקום מבנה" titleEn="Structural Restoration" optional>
            <div className="space-y-3">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!data.restoration_included}
                    onCheckedChange={() => update("restoration_included", false)}
                  />
                  <span className="text-sm">לא כלול</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={data.restoration_included}
                    onCheckedChange={() => update("restoration_included", true)}
                  />
                  <span className="text-sm">כלול — שיקום למצב מקורי</span>
                </label>
              </div>
              {data.restoration_included && (
                <Textarea
                  value={data.restoration_details}
                  onChange={(e) => update("restoration_details", e.target.value)}
                  rows={4}
                  className="text-sm font-mono"
                  placeholder="פרטי שיקום..."
                />
              )}
            </div>
          </SectionBlock>

          {/* 6. Tile Work */}
          <SectionBlock number={6} title="ריצוף" titleEn="Tile Work" optional>
            <div className="space-y-3">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!data.tiling_included}
                    onCheckedChange={() => update("tiling_included", false)}
                  />
                  <span className="text-sm">לא כלול</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={data.tiling_included}
                    onCheckedChange={() => update("tiling_included", true)}
                  />
                  <span className="text-sm">כלול</span>
                </label>
              </div>
              {data.tiling_included && (
                <div className="space-y-2">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={data.tiling_pricing_method === "sqm"}
                        onCheckedChange={() => update("tiling_pricing_method", "sqm")}
                      />
                      <span className="text-sm">למ"ר</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={data.tiling_pricing_method === "daily"}
                        onCheckedChange={() => update("tiling_pricing_method", "daily")}
                      />
                      <span className="text-sm">תעריף יומי</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={data.tiling_price}
                      onChange={(e) => update("tiling_price", e.target.value)}
                      className="h-8 w-28"
                      placeholder="מחיר"
                    />
                    <span className="text-sm text-muted-foreground">
                      ₪ {data.tiling_pricing_method === "sqm" ? "למ\"ר" : "ליום"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </SectionBlock>

          {/* 7. Materials */}
          <SectionBlock number={7} title="הערכת חומרים" titleEn="Materials Estimate">
            <Textarea
              value={data.materials_note}
              onChange={(e) => update("materials_note", e.target.value)}
              rows={2}
              className="text-sm"
            />
          </SectionBlock>

          {/* 8. Workforce */}
          <SectionBlock number={8} title="כוח אדם" titleEn="Workforce">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  מספר עובדים משוער:
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={data.workforce_crew_size}
                  onChange={(e) => update("workforce_crew_size", e.target.value)}
                  className="h-8 w-20"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  משך פרויקט משוער:
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={data.workforce_duration_days}
                  onChange={(e) => update("workforce_duration_days", e.target.value)}
                  className="h-8 w-20"
                />
                <span className="text-sm text-muted-foreground">ימים</span>
              </div>
            </div>
          </SectionBlock>

          {/* 9. Equipment */}
          <SectionBlock number={9} title="ציוד" titleEn="Equipment">
            <Textarea
              value={data.equipment_note}
              onChange={(e) => update("equipment_note", e.target.value)}
              rows={2}
              className="text-sm"
            />
          </SectionBlock>

          {/* 10. Warranty */}
          <SectionBlock number={10} title="אחריות" titleEn="Warranty">
            <Textarea
              value={data.warranty_note}
              onChange={(e) => update("warranty_note", e.target.value)}
              rows={2}
              className="text-sm"
            />
          </SectionBlock>
        </div>
      )}
    </div>
  );
};

function SectionBlock({
  number,
  title,
  titleEn,
  optional,
  children,
}: {
  number: number;
  title: string;
  titleEn?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-4 first:pt-3">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {number}
        </span>
        <h4 className="font-semibold text-sm">
          {title}
          {titleEn && (
            <span className="text-muted-foreground font-normal mr-1">({titleEn})</span>
          )}
          {optional && (
            <span className="text-xs text-muted-foreground font-normal mr-2">— אופציונלי</span>
          )}
        </h4>
      </div>
      <div className="mr-8">{children}</div>
    </div>
  );
}
