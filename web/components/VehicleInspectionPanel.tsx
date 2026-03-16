import { useState, useEffect } from "react";
import { useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Save,
  Edit2,
  X,
  Loader2,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

const DEFAULT_CHECKLIST_AREAS = [
  {
    area: "Exterior Panels",
    items: [
      "Front Bumper",
      "Rear Bumper",
      "Hood",
      "Trunk/Liftgate",
      "Roof",
      "Driver Door",
      "Passenger Door",
      "Rear Driver Door",
      "Rear Passenger Door",
      "Driver Fender",
      "Passenger Fender",
      "Driver Quarter Panel",
      "Passenger Quarter Panel",
    ],
  },
  {
    area: "Paint & Finish",
    items: [
      "Paint Depth Front",
      "Paint Depth Rear",
      "Paint Depth Sides",
      "Clear Coat Condition",
      "Swirl Marks",
      "Oxidation",
      "Stone Chips",
      "Scratches",
    ],
  },
  {
    area: "Glass & Seals",
    items: [
      "Windshield",
      "Rear Window",
      "Driver Window",
      "Passenger Window",
      "Sunroof/Moonroof",
      "Weather Stripping",
      "Mirrors",
    ],
  },
  {
    area: "Wheels & Tires",
    items: [
      "Front Left Tire",
      "Front Right Tire",
      "Rear Left Tire",
      "Rear Right Tire",
      "Front Left Wheel",
      "Front Right Wheel",
      "Rear Left Wheel",
      "Rear Right Wheel",
      "Spare Tire",
    ],
  },
  {
    area: "Interior",
    items: [
      "Driver Seat",
      "Passenger Seat",
      "Rear Seats",
      "Dashboard",
      "Headliner",
      "Carpet/Floor Mats",
      "Door Panels",
      "Center Console",
      "Steering Wheel",
    ],
  },
  {
    area: "Lights & Electronics",
    items: [
      "Headlights",
      "Tail Lights",
      "Fog Lights",
      "Turn Signals",
      "Interior Lights",
      "Infotainment Screen",
      "AC/Heat Controls",
    ],
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemStatus = "ok" | "damaged" | "note";

interface ChecklistItem {
  area: string;
  label: string;
  status: ItemStatus;
  notes: string;
}

type OverallCondition = "excellent" | "good" | "fair" | "poor";

interface VehicleInspectionPanelProps {
  appointmentId: string;
  vehicleId: string;
  businessId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultItems(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_AREAS.flatMap((area) =>
    area.items.map((label) => ({
      area: area.area,
      label,
      status: "ok" as ItemStatus,
      notes: "",
    }))
  );
}

function mergeChecklist(stored: any[]): ChecklistItem[] {
  const defaults = getDefaultItems();
  if (!stored || !Array.isArray(stored)) return defaults;
  return defaults.map((defaultItem) => {
    const storedItem = stored.find(
      (s) => s.area === defaultItem.area && s.label === defaultItem.label
    );
    if (storedItem) {
      return {
        ...defaultItem,
        status: (storedItem.status as ItemStatus) || "ok",
        notes: storedItem.notes || "",
      };
    }
    return defaultItem;
  });
}

function conditionBadgeClass(condition: string): string {
  switch (condition) {
    case "excellent":
      return "bg-green-100 text-green-800 border-green-200";
    case "good":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "fair":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "poor":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VehicleInspectionPanel({
  appointmentId,
  vehicleId,
  businessId,
}: VehicleInspectionPanelProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ChecklistItem[]>(getDefaultItems());
  const [overallCondition, setOverallCondition] = useState<string>("");
  const [mileage, setMileage] = useState<string>("");
  const [technicianName, setTechnicianName] = useState<string>("");
  const [freeNotes, setFreeNotes] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(
    new Set(DEFAULT_CHECKLIST_AREAS.map((a) => a.area))
  );

  // ── Data fetching ──────────────────────────────────────────────────────────
  const [{ data: inspectionData, fetching: inspectionFetching }] =
    useFindFirst(api.vehicleInspection, {
      filter: { appointmentId: { equals: appointmentId } },
      select: {
        id: true,
        checklist: true,
        overallCondition: true,
        mileageAtInspection: true,
        technicianName: true,
        completedAt: true,
        notes: true,
      },
    });

  const [{ fetching: createFetching }, create] = useAction(
    api.vehicleInspection.create
  );
  const [{ fetching: updateFetching }, update] = useAction(
    api.vehicleInspection.update
  );

  const isSaving = createFetching || updateFetching;

  // ── Sync state when inspection loads ──────────────────────────────────────
  useEffect(() => {
    if (inspectionData) {
      const stored = inspectionData.checklist;
      const mergedItems = mergeChecklist(
        Array.isArray(stored) ? (stored as any[]) : []
      );
      setItems(mergedItems);
      setOverallCondition((inspectionData.overallCondition as string) || "");
      setMileage(
        inspectionData.mileageAtInspection != null
          ? String(inspectionData.mileageAtInspection)
          : ""
      );
      setTechnicianName(inspectionData.technicianName || "");
      setFreeNotes(inspectionData.notes || "");
      setIsEditing(false);
    }
  }, [inspectionData]);

  // ── Item helpers ───────────────────────────────────────────────────────────
  const updateItemStatus = (area: string, label: string, status: ItemStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.area === area && item.label === label ? { ...item, status } : item
      )
    );
  };

  const updateItemNotes = (area: string, label: string, notes: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.area === area && item.label === label ? { ...item, notes } : item
      )
    );
  };

  const toggleArea = (area: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) {
        next.delete(area);
      } else {
        next.add(area);
      }
      return next;
    });
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      if (inspectionData?.id) {
        await update({
          id: inspectionData.id,
          checklist: items as any,
          overallCondition: (overallCondition as OverallCondition) || null,
          mileageAtInspection: mileage ? Number(mileage) : null,
          technicianName: technicianName || null,
          notes: freeNotes || null,
        });
      } else {
        await create({
          appointment: { _link: appointmentId },
          vehicle: { _link: vehicleId },
          business: { _link: businessId },
          checklist: items as any,
          overallCondition: (overallCondition as OverallCondition) || null,
          mileageAtInspection: mileage ? Number(mileage) : null,
          technicianName: technicianName || null,
          notes: freeNotes || null,
          completedAt: new Date(),
        });
      }
      toast.success("Inspection saved successfully");
      setIsEditing(false);
    } catch {
      toast.error("Failed to save inspection");
    }
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    if (inspectionData) {
      const stored = inspectionData.checklist;
      const mergedItems = mergeChecklist(
        Array.isArray(stored) ? (stored as any[]) : []
      );
      setItems(mergedItems);
      setOverallCondition((inspectionData.overallCondition as string) || "");
      setMileage(
        inspectionData.mileageAtInspection != null
          ? String(inspectionData.mileageAtInspection)
          : ""
      );
      setTechnicianName(inspectionData.technicianName || "");
      setFreeNotes(inspectionData.notes || "");
    } else {
      setItems(getDefaultItems());
      setOverallCondition("");
      setMileage("");
      setTechnicianName("");
      setFreeNotes("");
    }
    setIsEditing(false);
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalItems = items.length;
  const okCount = items.filter((i) => i.status === "ok").length;
  const damagedCount = items.filter((i) => i.status === "damaged").length;
  const noteCount = items.filter((i) => i.status === "note").length;

  const areaGroups = DEFAULT_CHECKLIST_AREAS.map((areaDef) => ({
    area: areaDef.area,
    items: items.filter((item) => item.area === areaDef.area),
  }));

  // ── Loading ────────────────────────────────────────────────────────────────
  if (inspectionFetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!inspectionData && !isEditing) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <ClipboardList className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="text-base font-medium text-foreground">
              No pre-inspection recorded yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Record the vehicle's condition before work begins
            </p>
          </div>
          <Button onClick={() => setIsEditing(true)}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Start Inspection
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Read mode ──────────────────────────────────────────────────────────────
  if (!isEditing && inspectionData) {
    return (
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/40 rounded-lg border">
          {overallCondition && (
            <Badge
              className={cn(
                "capitalize border text-sm px-3 py-1",
                conditionBadgeClass(overallCondition)
              )}
            >
              {overallCondition}
            </Badge>
          )}
          {mileage && (
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{mileage}</span> mi
            </span>
          )}
          {technicianName && (
            <span className="text-sm text-muted-foreground">
              Tech:{" "}
              <span className="font-medium text-foreground">
                {technicianName}
              </span>
            </span>
          )}
          {inspectionData.completedAt && (
            <span className="text-sm text-muted-foreground">
              Completed:{" "}
              <span className="font-medium text-foreground">
                {new Date(inspectionData.completedAt).toLocaleDateString()}
              </span>
            </span>
          )}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit Inspection
            </Button>
          </div>
        </div>

        {/* Read-mode checklist */}
        <div className="space-y-3">
          {areaGroups.map(({ area, items: areaItems }) => {
            const issueCount = areaItems.filter(
              (i) => i.status === "damaged" || i.status === "note"
            ).length;
            const hasDamaged = areaItems.some((i) => i.status === "damaged");
            const isExpanded = expandedAreas.has(area);

            return (
              <div key={area} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleArea(area)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                    hasDamaged
                      ? "bg-red-50 hover:bg-red-100"
                      : "bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium text-sm">{area}</span>
                    {issueCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {issueCount} issue{issueCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y">
                    {areaItems.map((item) => (
                      <div
                        key={item.label}
                        className="px-4 py-2 flex items-start gap-3"
                      >
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.status === "ok" && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          {item.status === "damaged" && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                          {item.status === "note" && (
                            <MessageSquare className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{item.label}</p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {freeNotes && (
          <div className="p-3 bg-muted/30 rounded-lg border">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{freeNotes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Damage summary strip */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center p-3 bg-muted/30 rounded-lg border">
          <span className="text-xl font-bold">{totalItems}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg border border-green-200">
          <span className="text-xl font-bold text-green-700">{okCount}</span>
          <span className="text-xs text-green-600">OK</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg border border-red-200">
          <span className="text-xl font-bold text-red-700">{damagedCount}</span>
          <span className="text-xs text-red-600">Damaged</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-amber-50 rounded-lg border border-amber-200">
          <span className="text-xl font-bold text-amber-700">{noteCount}</span>
          <span className="text-xs text-amber-600">Notes</span>
        </div>
      </div>

      {/* Area sections */}
      <div className="space-y-3">
        {areaGroups.map(({ area, items: areaItems }) => {
          const issueCount = areaItems.filter(
            (i) => i.status === "damaged" || i.status === "note"
          ).length;
          const hasDamaged = areaItems.some((i) => i.status === "damaged");
          const isExpanded = expandedAreas.has(area);

          return (
            <div key={area} className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleArea(area)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                  hasDamaged
                    ? "bg-red-50 hover:bg-red-100"
                    : "bg-muted/30 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium text-sm">{area}</span>
                  {issueCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {issueCount} issue{issueCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y">
                  {areaItems.map((item) => (
                    <div key={item.label} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm flex-1 min-w-0">{item.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* OK button */}
                          <button
                            type="button"
                            onClick={() =>
                              updateItemStatus(area, item.label, "ok")
                            }
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors",
                              item.status === "ok"
                                ? "bg-green-500 text-white border-green-500"
                                : "bg-transparent text-muted-foreground border-input hover:border-green-400 hover:text-green-600"
                            )}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            OK
                          </button>
                          {/* Damaged button */}
                          <button
                            type="button"
                            onClick={() =>
                              updateItemStatus(area, item.label, "damaged")
                            }
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors",
                              item.status === "damaged"
                                ? "bg-red-500 text-white border-red-500"
                                : "bg-transparent text-muted-foreground border-input hover:border-red-400 hover:text-red-600"
                            )}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Damaged
                          </button>
                          {/* Note button */}
                          <button
                            type="button"
                            onClick={() =>
                              updateItemStatus(area, item.label, "note")
                            }
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors",
                              item.status === "note"
                                ? "bg-amber-500 text-white border-amber-500"
                                : "bg-transparent text-muted-foreground border-input hover:border-amber-400 hover:text-amber-600"
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Note
                          </button>
                        </div>
                      </div>

                      {(item.status === "damaged" || item.status === "note") && (
                        <div className="mt-2">
                          <Input
                            value={item.notes}
                            onChange={(e) =>
                              updateItemNotes(area, item.label, e.target.value)
                            }
                            placeholder="Add notes..."
                            className="h-7 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Bottom fields */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Overall Condition</Label>
          <Select
            value={overallCondition}
            onValueChange={setOverallCondition}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Overall condition..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="poor">Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mileage</Label>
          <Input
            type="number"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="Mileage"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Technician Name</Label>
          <Input
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
            placeholder="Technician name"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={freeNotes}
          onChange={(e) => setFreeNotes(e.target.value)}
          placeholder="Additional notes about the vehicle condition..."
          className="min-h-[80px] text-sm resize-none"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Inspection
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}