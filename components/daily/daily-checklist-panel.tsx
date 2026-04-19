"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SECTION_LABELS } from "@/lib/constants";

type ChecklistSectionItem = {
  completed: boolean;
  section: string;
  template_key: string;
  title: string;
};

type DailyChecklistPanelProps = {
  compliance: number;
  groupedChecklist: Record<string, ChecklistSectionItem[]>;
  onShowMetrics?: () => void;
  onToggleChecklist: (templateKey: string, checked: boolean) => void;
  showMetricsShortcut?: boolean;
  syncingChecklistKey: string | null;
};

export function DailyChecklistPanel({
  compliance,
  groupedChecklist,
  onShowMetrics,
  onToggleChecklist,
  showMetricsShortcut = false,
  syncingChecklistKey
}: DailyChecklistPanelProps) {
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Checklisten</CardTitle>
            <CardDescription className="mt-2">
              Große Targets, direktes Speichern und klare Tagesstruktur.
            </CardDescription>
          </div>
          {showMetricsShortcut && onShowMetrics ? (
            <Button variant="secondary" onClick={onShowMetrics} className="sm:w-auto xl:hidden">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zu Metrics
            </Button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-muted px-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span>Checklist-Compliance</span>
            <span className="font-semibold">{compliance}%</span>
          </div>
          <ProgressBar value={compliance} className="mt-3" />
        </div>
      </Card>

      {Object.entries(groupedChecklist).map(([section, items]) => {
        const completedCount = items.filter((item) => item.completed).length;

        return (
          <Card key={section} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{SECTION_LABELS[section] ?? section}</CardTitle>
                <CardDescription className="mt-2">
                  {section === "meals"
                    ? "Meals sauber abhaken, damit Tagesstruktur und Lean Bulk nicht wegrutschen."
                    : "Schnelles Abhaken direkt auf dem iPhone."}
                </CardDescription>
              </div>
              <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {completedCount}/{items.length}
              </div>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <Checkbox
                  key={item.template_key}
                  checked={item.completed}
                  onCheckedChange={(checked) => onToggleChecklist(item.template_key, checked)}
                  label={item.title}
                  description={
                    syncingChecklistKey === item.template_key ? "Speichert..." : undefined
                  }
                />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
