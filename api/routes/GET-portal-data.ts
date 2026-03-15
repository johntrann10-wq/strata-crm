import { RouteHandler } from "gadget-server";

const route: RouteHandler<{ Querystring: { token?: string } }> = async ({ request, reply, api }) => {
  const { token } = request.query;

  if (!token) {
    await reply.code(400).send({ error: "Token is required" });
    return;
  }

  const client = await api.client.maybeFindFirst({
    filter: { portalToken: { equals: token } } as any,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  });

  if (!client) {
    await reply.code(404).send({ error: "Portal not found or link is invalid" });
    return;
  }

  const [vehicles, appointments, invoices] = await Promise.all([
    api.vehicle.findMany({
      filter: { clientId: { equals: client.id } },
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        color: true,
        licensePlate: true,
        vin: true,
        mileage: true,
      },
      first: 50,
    }),
    api.appointment.findMany({
      filter: { clientId: { equals: client.id } },
      sort: { startTime: "Descending" },
      select: {
        id: true,
        title: true,
        startTime: true,
        status: true,
        totalPrice: true,
        notes: true,
        vehicle: {
          year: true,
          make: true,
          model: true,
        },
      },
      first: 50,
    }),
    api.invoice.findMany({
      filter: { clientId: { equals: client.id } },
      sort: { createdAt: "Descending" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        subtotal: true,
        dueDate: true,
        createdAt: true,
      },
      first: 50,
    }),
  ]);

  await reply.send({ client, vehicles, appointments, invoices });
};

route.options = {
  cors: {
    origin: true,
  },
};

export default route;