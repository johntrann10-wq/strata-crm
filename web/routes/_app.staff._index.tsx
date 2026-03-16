import { useState, useMemo } from "react";
import { useOutletContext } from "react-router";
import { useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChevronDown, ChevronUp, Briefcase, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

const ROLES = [
  "owner",
  "manager",
  "technician",
  "front-desk",
  "other",
] as const;
type Role = (typeof ROLES)[number];

const SPECIALTIES = [
  "detailing",
  "tinting",
  "wrap",
  "ppf",
  "ceramic-coating",
  "paint-correction",
  "tires",
  "alignment",
  "body-repair",
  "glass",
  "performance",
  "audio-electronics",
  "other",
] as const;
type Specialty = (typeof SPECIALTIES)[number];

type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null | undefined;
  role: string | null | undefined;
  active: boolean | null | undefined;
  color: string | null | undefined;
  commissionRate: number | null | undefined;
  hourlyRate: number | null | undefined;
  specialties: string[] | null | undefined;
  bio: string | null | undefined;
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  color: string;
  commissionRate: string;
  hourlyRate: string;
  specialties: string[];
  bio: string;
  active: boolean;
};

const defaultFormState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  role: "",
  color: "",
  commissionRate: "",
  hourlyRate: "",
  specialties: [],
  bio: "",
  active: true,
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    "#F87171",
    "#FB923C",
    "#FBBF24",
    "#34D399",
    "#60A5FA",
    "#A78BFA",
    "#F472B6",
    "#4ADE80",
    "#38BDF8",
    "#E879F9",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getRoleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "manager":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "technician":
      return "bg-green-100 text-green-800 border-green-200";
    case "front-desk":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function StaffForm({
  formState,
  setFormState,
  showAdvanced,
  onToggleAdvanced,
}: {
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}) {
  const toggleSpecialty = (specialty: string) => {
    setFormState((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter((s) => s !== specialty)
        : [...prev.specialties, specialty],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="staff-firstName">First Name *</Label>
          <Input
            id="staff-firstName"
            value={formState.firstName}
            onChange={(e) =>
              setFormState((prev) => ({ ...prev, firstName: e.target.value }))
            }
            placeholder="Jane"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="staff-lastName">Last Name *</Label>
          <Input
            id="staff-lastName"
            value={formState.lastName}
            onChange={(e) =>
              setFormState((prev) => ({ ...prev, lastName: e.target.value }))
            }
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="staff-email">Email</Label>
        <Input
          id="staff-email"
          type="email"
          value={formState.email}
          onChange={(e) =>
            setFormState((prev) => ({ ...prev, email: e.target.value }))
          }
          placeholder="jane@example.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="staff-role">Role</Label>
          <Select
            value={formState.role}
            onValueChange={(val) =>
              setFormState((prev) => ({ ...prev, role: val }))
            }
          >
            <SelectTrigger id="staff-role">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="staff-color">Calendar Color</Label>
          <div className="flex items-center gap-2">
            <input
              id="staff-color"
              type="color"
              value={formState.color || "#6366f1"}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, color: e.target.value }))
              }
              className="h-9 w-12 rounded border cursor-pointer p-0.5"
            />
            <span className="text-sm text-muted-foreground">
              {formState.color || "Default"}
            </span>
          </div>
        </div>
      </div>

      {showAdvanced && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="staff-commission">Commission Rate (%)</Label>
              <Input
                id="staff-commission"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={formState.commissionRate}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    commissionRate: e.target.value,
                  }))
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-hourly">Hourly Rate ($)</Label>
              <Input
                id="staff-hourly"
                type="number"
                min={0}
                step={0.01}
                value={formState.hourlyRate}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    hourlyRate: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Specialties</Label>
            <div className="border rounded-md p-3 max-h-44 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {SPECIALTIES.map((specialty) => (
                  <div key={specialty} className="flex items-center gap-2">
                    <Checkbox
                      id={`spec-${specialty}`}
                      checked={formState.specialties.includes(specialty)}
                      onCheckedChange={() => toggleSpecialty(specialty)}
                    />
                    <label
                      htmlFor={`spec-${specialty}`}
                      className="text-sm cursor-pointer"
                    >
                      {specialty.replace(/-/g, " ")}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="staff-bio">Bio</Label>
            <Textarea
              id="staff-bio"
              value={formState.bio}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, bio: e.target.value }))
              }
              placeholder="A brief description..."
              rows={3}
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onToggleAdvanced}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {showAdvanced ? "- Less Details" : "+ More Details"}
      </button>

      <div className="flex items-center gap-2">
        <Checkbox
          id="staff-active"
          checked={formState.active}
          onCheckedChange={(checked) =>
            setFormState((prev) => ({ ...prev, active: !!checked }))
          }
        />
        <label
          htmlFor="staff-active"
          className="text-sm font-medium cursor-pointer"
        >
          Active
        </label>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();

  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);

  const staffFilter = useMemo(
    () =>
      businessId
        ? { business: { id: { equals: businessId } } }
        : {},
    [businessId]
  );

  const [
    { data: staffList, fetching: staffFetching, error: staffError },
    refreshStaff,
  ] = useFindMany(api.staff, {
    filter: staffFilter,
    sort: { firstName: "Ascending" },
    first: 50,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      active: true,
      color: true,
      commissionRate: true,
      hourlyRate: true,
      specialties: true,
      bio: true,
    },
    pause: !businessId,
  });

  const isRefetching = staffFetching && !!staffList;

  const [{ data: recentAppointments }] = useFindMany(api.appointment, {
    filter: businessId
      ? {
          AND: [
            { business: { id: { equals: businessId } } },
            { startTime: { greaterThanOrEqual: thirtyDaysAgo } },
          ],
        }
      : {},
    select: { id: true, assignedStaffId: true, status: true },
    first: 250,
    pause: !businessId,
  });

  const { jobCountMap, activeCountMap } = useMemo(() => {
    const jobCountMap = new Map<string, number>();
    const activeCountMap = new Map<string, number>();
    if (recentAppointments) {
      for (const appt of recentAppointments) {
        if (appt.assignedStaffId) {
          jobCountMap.set(appt.assignedStaffId, (jobCountMap.get(appt.assignedStaffId) ?? 0) + 1);
          if (["scheduled", "confirmed", "in_progress"].includes(appt.status ?? "")) {
            activeCountMap.set(appt.assignedStaffId, (activeCountMap.get(appt.assignedStaffId) ?? 0) + 1);
          }
        }
      }
    }
    return { jobCountMap, activeCountMap };
  }, [recentAppointments]);

  const [{ fetching: creating }, createStaff] = useAction(api.staff.create);
  const [{ fetching: updating }, updateStaff] = useAction(api.staff.update);
  const [{ fetching: deleting }, deleteStaff] = useAction(api.staff.delete);

  const [showAdvancedStaff, setShowAdvancedStaff] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [formState, setFormState] = useState<FormState>(defaultFormState);

  const openCreate = () => {
    setFormState(defaultFormState);
    setShowAdvancedStaff(false);
    setCreateOpen(true);
  };

  const openEdit = (staff: StaffMember) => {
    setShowAdvancedStaff(false);
    setSelectedStaff(staff);
    setFormState({
      firstName: staff.firstName ?? "",
      lastName: staff.lastName ?? "",
      email: staff.email ?? "",
      role: staff.role ?? "",
      color: staff.color ?? "",
      commissionRate:
        staff.commissionRate != null ? String(staff.commissionRate) : "",
      hourlyRate: staff.hourlyRate != null ? String(staff.hourlyRate) : "",
      specialties: (staff.specialties as string[]) ?? [],
      bio: staff.bio ?? "",
      active: staff.active ?? true,
    });
    setEditOpen(true);
  };

  const handleCreate = async () => {
    if (!formState.firstName || !formState.lastName || !businessId) return;
    const result = await createStaff({
      firstName: formState.firstName,
      lastName: formState.lastName,
      ...(formState.email ? { email: formState.email } : {}),
      ...(formState.role ? { role: formState.role as Role } : {}),
      ...(formState.color ? { color: formState.color } : {}),
      ...(formState.commissionRate
        ? { commissionRate: parseFloat(formState.commissionRate) }
        : {}),
      ...(formState.hourlyRate
        ? { hourlyRate: parseFloat(formState.hourlyRate) }
        : {}),
      ...(formState.specialties.length > 0
        ? { specialties: formState.specialties as Specialty[] }
        : {}),
      ...(formState.bio ? { bio: formState.bio } : {}),
      active: formState.active,
      business: { _link: businessId },
    });
    if (result.data) {
      toast.success("Staff member added");
      setCreateOpen(false);
      refreshStaff({ requestPolicy: "network-only" });
    } else if (result.error) {
      toast.error("Failed to create staff: " + result.error.message);
    }
  };

  const handleUpdate = async () => {
    if (!selectedStaff || !formState.firstName || !formState.lastName) return;
    const result = await updateStaff({
      id: selectedStaff.id,
      firstName: formState.firstName,
      lastName: formState.lastName,
      email: formState.email || undefined,
      role: (formState.role as Role) || undefined,
      color: formState.color || undefined,
      commissionRate: formState.commissionRate
        ? parseFloat(formState.commissionRate)
        : undefined,
      hourlyRate: formState.hourlyRate
        ? parseFloat(formState.hourlyRate)
        : undefined,
      specialties:
        formState.specialties.length > 0
          ? (formState.specialties as Specialty[])
          : undefined,
      bio: formState.bio || undefined,
      active: formState.active,
    });
    if (result.data) {
      toast.success("Changes saved");
      setEditOpen(false);
      refreshStaff({ requestPolicy: "network-only" });
    } else if (result.error) {
      toast.error("Failed to update staff: " + result.error.message);
    }
  };

  const handleDelete = async () => {
    if (!selectedStaff) return;
    const result = await deleteStaff({ id: selectedStaff.id });
    if (result.error) {
      toast.error("Failed to delete staff: " + result.error.message);
    } else {
      toast.success("Staff member removed");
      setEditOpen(false);
      setDeleteConfirmOpen(false);
      refreshStaff({ requestPolicy: "network-only" });
    }
  };

  const handleToggleActive = async (
    staff: StaffMember,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const result = await updateStaff({ id: staff.id, active: !staff.active });
    if (result.error) {
      toast.error("Failed to update staff status: " + result.error.message);
      return;
    }
    refreshStaff({ requestPolicy: "network-only" });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Staff"
        right={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Staff Member
          </Button>
        }
      />

      {/* Loading skeleton – only on first load */}
      {staffFetching && !staffList && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border bg-card h-52 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {staffError && !staffFetching && (
        <div className="text-center py-12 text-destructive">
          Failed to load team members. Please refresh the page.
        </div>
      )}

      {/* Empty state */}
      {!staffFetching && !staffError && (!staffList || staffList.length === 0) && (
        <EmptyState
          icon={UserCheck}
          title="No staff members yet"
          description="Add your first team member to start assigning jobs and tracking performance."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff Member
            </Button>
          }
        />
      )}

      {/* Staff cards */}
      {staffList && staffList.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity${isRefetching ? " opacity-60" : ""}`}>
          {staffList.map((staff) => {
            const initials = getInitials(staff.firstName, staff.lastName);
            const avatarColor =
              staff.color ||
              getColorFromName(`${staff.firstName}${staff.lastName}`);
            const specialtiesArr = (staff.specialties as string[]) ?? [];
            const displaySpecialties = specialtiesArr.slice(0, 3);
            const extraCount = specialtiesArr.length - 3;

            return (
              <Card
                key={staff.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  !staff.active ? "opacity-60" : ""
                }`}
                onClick={() => openEdit(staff as StaffMember)}
              >
                <CardContent className="p-5">
                  {/* Avatar row */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initials}
                    </div>
                    {/* Active toggle */}
                    <div
                      className="flex items-center gap-1.5 mt-1"
                      onClick={(e) => handleToggleActive(staff as StaffMember, e)}
                    >
                      <span className="text-xs text-muted-foreground">
                        {staff.active ? "Active" : "Inactive"}
                      </span>
                      <Checkbox
                        checked={staff.active ?? false}
                        onCheckedChange={() => {}}
                        className="pointer-events-none"
                      />
                    </div>
                  </div>

                  {/* Name */}
                  <h3 className="font-semibold text-base leading-tight mb-1">
                    {staff.firstName} {staff.lastName}
                  </h3>

                  {/* Role badge */}
                  {staff.role && (
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border mb-2 ${getRoleBadgeClass(staff.role)}`}
                    >
                      {staff.role.replace(/-/g, " ")}
                    </span>
                  )}

                  {/* Email */}
                  {staff.email && (
                    <p className="text-sm text-muted-foreground mb-1 truncate">
                      {staff.email}
                    </p>
                  )}

                  {/* Commission rate */}
                  {staff.commissionRate != null && (
                    <p className="text-sm text-muted-foreground mb-2">
                      Commission: {staff.commissionRate}%
                    </p>
                  )}

                  {/* Specialties */}
                  {displaySpecialties.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {displaySpecialties.map((s) => (
                        <span
                          key={s}
                          className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full"
                        >
                          {s.replace(/-/g, " ")}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                          +{extraCount}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Job count */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Briefcase className="h-3 w-3" />
                    <span>{jobCountMap.get(staff.id) ?? 0} jobs (30d)</span>
                    {(activeCountMap.get(staff.id) ?? 0) > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs ml-2 px-1.5 py-0 border-0 hover:bg-blue-100">
                        {activeCountMap.get(staff.id)} active
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>

          <StaffForm
            formState={formState}
            setFormState={setFormState}
            showAdvanced={showAdvancedStaff}
            onToggleAdvanced={() => setShowAdvancedStaff((prev) => !prev)}
          />

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating || !formState.firstName || !formState.lastName
              }
            >
              {creating ? "Creating..." : "Create Staff Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {selectedStaff?.firstName} {selectedStaff?.lastName}
            </DialogTitle>
          </DialogHeader>
          <StaffForm
            formState={formState}
            setFormState={setFormState}
            showAdvanced={showAdvancedStaff}
            onToggleAdvanced={() => setShowAdvancedStaff((prev) => !prev)}
          />
          <DialogFooter className="mt-4 flex justify-between w-full">
            <Button
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={
                  updating || !formState.firstName || !formState.lastName
                }
              >
                {updating ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedStaff?.firstName}{" "}
              {selectedStaff?.lastName} from your team. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}