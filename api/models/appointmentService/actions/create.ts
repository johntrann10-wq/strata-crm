import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'appointment.business' });
  if (record.appointmentId) {
    const appointment = await api.appointment.maybeFindOne(record.appointmentId, { select: { id: true, businessId: true } });
    if (!appointment) {
      throw new Error("Appointment not found.");
    }
    if (record.serviceId) {
      const service = await api.service.maybeFindOne(record.serviceId, { select: { id: true, businessId: true, deletedAt: true } });
      if (service === null) {
        throw new Error('Service not found.');
      }
      if (service.deletedAt !== null) {
        throw new Error('Cannot link a deleted service to an appointment. Restore the service first.');
      }
      if (appointment.businessId && service.businessId !== appointment.businessId) {
        throw new Error('Cannot link a service from a different business to this appointment.');
      }
    }
  }
  if (record.serviceId) {
    const service = await api.service.maybeFindOne(record.serviceId, { select: { name: true, description: true, price: true, duration: true } });
    if (service === null) {
      logger.warn({ serviceId: record.serviceId }, 'Service not found when creating appointmentService — service may have been deleted');
    } else {
      record.serviceName = service.name;
      record.serviceDescription = service.description;
      if (record.price == null) {
        record.price = service.price;
      }
      record.duration = record.duration ?? service.duration;
    }
  }
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  if (!record.appointmentId) return;
  try {
    const appointmentServices = await api.appointmentService.findMany({
      filter: { appointmentId: { equals: record.appointmentId } },
      select: { id: true, price: true },
      first: 250,
    });
    const totalPrice = appointmentServices.reduce((sum, as) => sum + (as.price ?? 0), 0);
    await api.internal.appointment.update(record.appointmentId, { totalPrice });
  } catch (error) {
    logger.warn({ error, appointmentId: record.appointmentId }, 'Failed to recalculate appointment totalPrice after appointmentService create');
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
