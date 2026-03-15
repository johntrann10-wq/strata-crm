import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, session, api }) => {
  const userId = session?.get("user");
  if (!userId) {
    return { available: false, conflicts: [], error: "Not authenticated" };
  }

  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true, appointmentBufferMinutes: true },
  });

  if (!business) {
    return { available: false, conflicts: [], error: "Business not found" };
  }

  const start = new Date(params.startTime as string);
  const end = new Date(params.endTime as string);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid startTime or endTime");
  }

  if (end.getTime() <= start.getTime()) {
    throw new Error("endTime must be after startTime");
  }

  const maxDurationMs = 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxDurationMs) {
    throw new Error("Time range cannot exceed 24 hours");
  }

  const bufferMs = (business.appointmentBufferMinutes ?? 15) * 60 * 1000;
  const bufferedStart = new Date(start.getTime() - bufferMs).toISOString();
  const bufferedEnd = new Date(end.getTime() + bufferMs).toISOString();

  const baseFilterConditions: object[] = [
    { businessId: { equals: business.id } },
    { NOT: [{ status: { in: ["cancelled", "no-show"] } }] },
    { startTime: { lessThan: bufferedEnd } },
    { endTime: { greaterThan: bufferedStart } },
  ];

  if (params.excludeAppointmentId) {
    baseFilterConditions.push({ id: { notEquals: params.excludeAppointmentId as string } });
  }

  const appointmentSelect = {
    id: true,
    title: true,
    startTime: true,
    endTime: true,
    status: true,
    client: { firstName: true, lastName: true },
  };

  type ConflictAppt = {
    id: string;
    title: string | null;
    startTime: Date | null;
    endTime: Date | null;
    status: string;
    client: { firstName: string; lastName: string } | null;
  };

  const baseAppointments = await api.appointment.findMany({
    filter: { AND: baseFilterConditions },
    select: appointmentSelect,
    first: 10,
  });

  const mapConflict = (c: ConflictAppt) => ({
    id: c.id,
    title: c.title,
    startTime: c.startTime,
    endTime: c.endTime,
    status: c.status,
    clientName: c.client ? `${c.client.firstName} ${c.client.lastName}` : null,
  });

  type MappedConflict = ReturnType<typeof mapConflict>;

  let staffConflicts: MappedConflict[] = [];
  let businessConflicts: MappedConflict[];

  if (params.staffId) {
    const staffFilterConditions: object[] = [
      ...baseFilterConditions,
      { assignedStaffId: { equals: params.staffId as string } },
    ];

    const staffAppointments = await api.appointment.findMany({
      filter: { AND: staffFilterConditions },
      select: appointmentSelect,
      first: 10,
    });

    const staffApptIds = new Set((staffAppointments as ConflictAppt[]).map((a) => a.id));
    staffConflicts = (staffAppointments as ConflictAppt[]).map(mapConflict);
    businessConflicts = (baseAppointments as ConflictAppt[])
      .filter((a) => !staffApptIds.has(a.id))
      .map(mapConflict);
  } else {
    businessConflicts = (baseAppointments as ConflictAppt[]).map(mapConflict);
  }

  const seenIds = new Set<string>();
  const conflicts: MappedConflict[] = [...staffConflicts, ...businessConflicts].filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  return {
    available: staffConflicts.length === 0 && businessConflicts.length === 0,
    conflicts,
    staffConflicts,
    businessConflicts,
  };
};

export const params = {
  startTime: { type: "string" },
  endTime: { type: "string" },
  staffId: { type: "string" },
  excludeAppointmentId: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};