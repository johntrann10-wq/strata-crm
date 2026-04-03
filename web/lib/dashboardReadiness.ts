export type ActivationChecklistKey =
  | "client"
  | "vehicle"
  | "services"
  | "appointment"
  | "invoice"
  | "booking_basics";

export type ActivationChecklistItemBase = {
  key: ActivationChecklistKey;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  actionLabel: string;
};

export type ActivationChecklistBase = {
  items: ActivationChecklistItemBase[];
  completed: number;
  total: number;
  percent: number;
};

type BuildActivationChecklistInput = {
  operatingHours?: string | null;
  appointmentBufferMinutes?: number | null;
  activationClientsCount: number;
  activationVehiclesCount: number;
  activationServicesCount: number;
  activationAppointmentsCount: number;
  activationInvoicesCount: number;
  scheduleJobHref: string;
};

type AcclimatedWorkspaceInput = {
  activationClientsCount: number;
  activationVehiclesCount: number;
  activationServicesCount: number;
  activationAppointmentsCount: number;
  activationInvoicesCount: number;
  activeJobsCount: number;
  todayAppointmentsCount: number;
  pendingApprovalsCount: number;
  unpaidRevenue: number;
};

export function buildActivationChecklist({
  operatingHours,
  appointmentBufferMinutes,
  activationClientsCount,
  activationVehiclesCount,
  activationServicesCount,
  activationAppointmentsCount,
  activationInvoicesCount,
  scheduleJobHref,
}: BuildActivationChecklistInput): ActivationChecklistBase {
  const bookingBasicsReady = Boolean(operatingHours && appointmentBufferMinutes != null);
  const bufferMinutes = Number(appointmentBufferMinutes ?? 0);
  const items: ActivationChecklistItemBase[] = [
    {
      key: "client",
      label: "Add your first client",
      detail: "Start your CRM with the first real customer record.",
      done: activationClientsCount > 0,
      href: "/clients/new",
      actionLabel: "Add client",
    },
    {
      key: "vehicle",
      label: "Add your first vehicle",
      detail: "Attach a real vehicle so scheduling and history work correctly.",
      done: activationVehiclesCount > 0,
      href: "/clients",
      actionLabel: "Add vehicle",
    },
    {
      key: "services",
      label: "Review loaded services",
      detail: "Your starter menu is preloaded. Confirm the catalog before you start booking.",
      done: activationServicesCount > 0,
      href: "/services",
      actionLabel: "Open services",
    },
    {
      key: "appointment",
      label: "Book your first appointment",
      detail: "Put a real job on the board so the calendar becomes useful immediately.",
      done: activationAppointmentsCount > 0,
      href: scheduleJobHref,
      actionLabel: "New appointment",
    },
    {
      key: "invoice",
      label: "Generate your first invoice",
      detail: "Turn completed work into a payable invoice so billing is ready from day one.",
      done: activationInvoicesCount > 0,
      href: "/invoices/new",
      actionLabel: "New invoice",
    },
    {
      key: "booking_basics",
      label: "Confirm booking basics",
      detail: bookingBasicsReady
        ? `Hours loaded and ${bufferMinutes} minute booking buffer ready.`
        : "Verify hours, booking buffer, and default billing basics.",
      done: bookingBasicsReady,
      href: "/settings",
      actionLabel: "Open settings",
    },
  ];
  const completed = items.filter((item) => item.done).length;
  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
  };
}

export function isAcclimatedWorkspace({
  activationClientsCount,
  activationVehiclesCount,
  activationServicesCount,
  activationAppointmentsCount,
  activationInvoicesCount,
  activeJobsCount,
  todayAppointmentsCount,
  pendingApprovalsCount,
  unpaidRevenue,
}: AcclimatedWorkspaceInput): boolean {
  const coreReady =
    activationClientsCount > 0 &&
    activationVehiclesCount > 0 &&
    activationServicesCount > 0 &&
    activationAppointmentsCount > 0 &&
    activationInvoicesCount > 0;
  const activeOperatingSignals =
    activationClientsCount >= 3 ||
    activeJobsCount > 0 ||
    todayAppointmentsCount > 0 ||
    pendingApprovalsCount > 0 ||
    unpaidRevenue > 0;
  return coreReady && activeOperatingSignals;
}
