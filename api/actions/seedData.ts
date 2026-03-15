import { api } from "gadget-server";
import { ActionOptions } from "gadget-server";

// Data pools
const FIRST_NAMES = [
  "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles",
  "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan", "Jessica", "Sarah", "Karen",
  "Christopher", "Daniel", "Paul", "Mark", "Donald", "George", "Kenneth", "Steven", "Edward", "Brian",
  "Margaret", "Lisa", "Betty", "Dorothy", "Sandra", "Ashley", "Kimberly", "Emily", "Donna", "Michelle"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores"
];

const MAKES = ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Audi", "Tesla", "Porsche", "Lexus", "Jeep", "Ram", "Nissan", "Subaru", "Hyundai"];

const MODELS_BY_MAKE: Record<string, string[]> = {
  "Toyota": ["Camry", "Corolla", "RAV4", "Tacoma", "Highlander"],
  "Honda": ["Civic", "Accord", "CR-V", "Pilot", "Ridgeline"],
  "Ford": ["F-150", "Mustang", "Explorer", "Escape", "Bronco"],
  "Chevrolet": ["Silverado", "Equinox", "Traverse", "Tahoe", "Malibu"],
  "BMW": ["3 Series", "5 Series", "X3", "X5", "M3"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLE", "GLC", "S-Class"],
  "Audi": ["A4", "A6", "Q5", "Q7", "TT"],
  "Tesla": ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  "Lexus": ["ES", "IS", "RX", "NX", "GX"],
  "Jeep": ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator"],
  "Ram": ["1500", "2500", "3500", "ProMaster", "Dakota"],
  "Nissan": ["Altima", "Sentra", "Rogue", "Pathfinder", "Frontier"],
  "Subaru": ["Outback", "Forester", "Impreza", "Crosstrek", "Ascent"],
  "Hyundai": ["Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade"]
};

const COLORS = ["White", "Black", "Silver", "Gray", "Red", "Blue", "Green", "Orange", "Yellow", "Brown"];

const CITIES = [
  "Los Angeles", "Phoenix", "Houston", "Chicago", "Philadelphia", "San Antonio", "San Diego", "Dallas",
  "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "Indianapolis",
  "Seattle", "Denver", "Nashville", "Oklahoma City", "Portland"
];

const STATES = [
  "CA", "AZ", "TX", "IL", "PA", "TX", "CA", "TX",
  "CA", "TX", "FL", "TX", "OH", "NC", "IN",
  "WA", "CO", "TN", "OK", "OR"
];

const SOURCES = ["walk-in", "referral", "google", "instagram", "facebook", "website", "other"];

const APPT_STATUSES = [
  ...Array(10).fill("completed"),
  ...Array(6).fill("confirmed"),
  ...Array(5).fill("scheduled"),
  ...Array(2).fill("in_progress"),
  ...Array(2).fill("cancelled"),
  ...Array(1).fill("cancelled")
];

const INVOICE_STATUSES = [
  ...Array(10).fill("paid"),
  ...Array(5).fill("sent"),
  ...Array(3).fill("draft"),
  ...Array(2).fill("partial"),
  ...Array(1).fill("void")
];

const SERVICE_NAMES = [
  "Full Detail", "Interior Detail", "Exterior Wash", "Paint Correction", "Ceramic Coating",
  "Window Tint", "PPF Full Hood", "Vinyl Wrap", "Wheel Ceramic", "Engine Bay Detail"
];
const SERVICE_PRICES = [299, 149, 79, 599, 1299, 399, 699, 2499, 249, 199];
const SERVICE_CATEGORIES = [
  "detailing", "detailing", "detailing", "paint-correction", "ceramic-coating",
  "tinting", "ppf", "wrap", "wheels", "detailing"
];
const PAINT_TYPES = ["stock", "custom", "wrapped", "ppf", "ceramic-coated", "matte", "satin"];

export const run: ActionRun = async ({ params, logger, session }) => {
  const clientCount = (params.clientCount as number) ?? 10000;
  const vehicleCount = (params.vehicleCount as number) ?? 15000;
  const appointmentCount = (params.appointmentCount as number) ?? 50000;
  const invoiceCount = (params.invoiceCount as number) ?? 20000;

  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number, dec = 2): number =>
    parseFloat((Math.random() * (max - min) + min).toFixed(dec));
  const batchArray = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

  // Phase 0 — Resolve user ID
  const userId = session?.get("user") as string;
  if (!userId) {
    throw new Error("No authenticated user found in session. Run this action while signed in.");
  }
  logger.info({ userId }, "Resolved userId for seed");

  // Phase 1 — Seed services (skip if already exist)
  const existingService = await api.service.maybeFindFirst({
    filter: { business: { id: { equals: userId } } },
    select: { id: true }
  });

  if (existingService) {
    logger.info("Services already seeded, skipping");
  } else {
    await Promise.all(
      SERVICE_NAMES.map((name, i) =>
        api.service.create({
          name,
          price: SERVICE_PRICES[i],
          category: SERVICE_CATEGORIES[i] as any,
          business: { _link: userId },
          active: true,
          taxable: true,
        })
      )
    );
    logger.info("Services seeded (10 services created)");
  }

  // Phase 2 — Create clients in parallel batches
  interface ClientItem {
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      city: string;
      state: string;
      source: any;
      marketingOptIn: boolean;
      business: { _link: string };
    };
  }

  const clientItems: ClientItem[] = Array.from({ length: clientCount }, () => {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const cityIdx = randInt(0, CITIES.length - 1);
    return {
      data: {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 9999)}@example.com`,
        phone: `(${randInt(200, 999)}) ${randInt(100, 999)}-${randInt(1000, 9999)}`,
        city: CITIES[cityIdx],
        state: STATES[cityIdx],
        source: pick(SOURCES) as any,
        marketingOptIn: Math.random() > 0.3,
        business: { _link: userId },
      },
    };
  });

  const clientIds: string[] = [];
  const clientBatches = batchArray(clientItems, 50);
  const clientGroups = batchArray(clientBatches, 10);
  let clientLogCount = 0;

  for (const group of clientGroups) {
    const results = await Promise.allSettled(
      group.map(async (batch) => {
        const created = await Promise.all(batch.map((item) => api.client.create(item.data)));
        return created.map((c) => c.id);
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        clientIds.push(...result.value);
        clientLogCount += result.value.length;
        if (Math.floor(clientLogCount / 1000) > Math.floor((clientLogCount - result.value.length) / 1000)) {
          logger.info({ count: clientIds.length }, "Clients created so far");
        }
      } else {
        logger.warn({ error: String(result.reason) }, "Client batch failed");
      }
    }
  }

  logger.info({ total: clientIds.length }, "All clients created");

  // Phase 3 — Create vehicles in parallel batches
  interface VehicleItem {
    data: {
      make: string;
      model: string;
      year: number;
      color: string;
      mileage: number;
      paintType: any;
      licensePlate: string;
      client: { _link: string };
      business: { _link: string };
    };
    clientId: string;
  }

  const vehicleItems: VehicleItem[] = Array.from({ length: vehicleCount }, () => {
    const make = pick(MAKES);
    const model = pick(MODELS_BY_MAKE[make]);
    const clientId = pick(clientIds);
    return {
      data: {
        make,
        model,
        year: randInt(2005, 2024),
        color: pick(COLORS),
        mileage: randInt(0, 150000),
        paintType: pick(PAINT_TYPES) as any,
        licensePlate: Math.random().toString(36).substring(2, 9).toUpperCase(),
        client: { _link: clientId },
        business: { _link: userId },
      },
      clientId,
    };
  });

  const vehicleIds: string[] = [];
  const vehicleClientMap: string[] = [];
  const vehicleBatches = batchArray(vehicleItems, 50);
  const vehicleGroups = batchArray(vehicleBatches, 10);

  for (const group of vehicleGroups) {
    const results = await Promise.allSettled(
      group.map(async (batch) => {
        const created = await Promise.all(batch.map((item) => api.vehicle.create(item.data)));
        return batch.map((item, i) => ({ id: created[i].id, clientId: item.clientId }));
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const { id, clientId } of result.value) {
          vehicleIds.push(id);
          vehicleClientMap.push(clientId);
        }
      } else {
        logger.warn({ error: String(result.reason) }, "Vehicle batch failed");
      }
    }
  }

  logger.info({ total: vehicleIds.length }, "All vehicles created");

  // Phase 4 — Create appointments in parallel batches
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const threeMonthsFromNow = new Date(now.getTime() + 3 * 30 * 24 * 60 * 60 * 1000);
  const apptTimeRange = threeMonthsFromNow.getTime() - twoYearsAgo.getTime();

  interface AppointmentItem {
    data: {
      status: any;
      startTime: Date;
      endTime: Date;
      completedAt: Date | null;
      totalPrice: number;
      business: { _link: string };
      client: { _link: string };
      vehicle: { _link: string };
    };
    clientId: string;
  }

  const appointmentItems: AppointmentItem[] = Array.from({ length: appointmentCount }, () => {
    const vi = randInt(0, vehicleIds.length - 1);
    const vehicleId = vehicleIds[vi];
    const clientId = vehicleClientMap[vi];
    const status = pick(APPT_STATUSES);
    const startTime = new Date(twoYearsAgo.getTime() + Math.random() * apptTimeRange);
    const endTime = new Date(startTime.getTime() + randInt(1, 4) * 60 * 60 * 1000);
    const completedAt = status === "completed" ? endTime : null;

    return {
      data: {
        status: status as any,
        startTime,
        endTime,
        completedAt,
        totalPrice: randFloat(79, 2500),
        business: { _link: userId },
        client: { _link: clientId },
        vehicle: { _link: vehicleId },
      },
      clientId,
    };
  });

  const appointmentIds: string[] = [];
  const appointmentClientMap: string[] = [];
  const apptBatches = batchArray(appointmentItems, 50);
  const apptGroups = batchArray(apptBatches, 10);
  let apptLogCount = 0;

  for (const group of apptGroups) {
    const results = await Promise.allSettled(
      group.map(async (batch) => {
        const created = await Promise.all(batch.map((item) => api.appointment.create(item.data)));
        return batch.map((item, i) => ({ id: created[i].id, clientId: item.clientId }));
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const { id, clientId } of result.value) {
          appointmentIds.push(id);
          appointmentClientMap.push(clientId);
          apptLogCount++;
          if (apptLogCount % 5000 === 0) {
            logger.info({ count: apptLogCount }, "Appointments created so far");
          }
        }
      } else {
        logger.warn({ error: String(result.reason) }, "Appointment batch failed");
      }
    }
  }

  logger.info({ total: appointmentIds.length }, "All appointments created");

  // Phase 5 — Create invoices + line items in parallel batches
  interface InvoiceItem {
    invoiceData: {
      status: any;
      subtotal: number;
      taxRate: number;
      taxAmount: number;
      total: number;
      paidAt: Date | null;
      dueDate: Date;
      invoiceNumber: string;
      business: { _link: string };
      client: { _link: string };
      appointment: { _link: string };
    };
    lineData: {
      description: string;
      unitPrice: number;
      quantity: number;
      total: number;
      taxable: boolean;
    };
  }

  const invoiceItems: InvoiceItem[] = Array.from({ length: invoiceCount }, (_, index) => {
    const ai = randInt(0, appointmentIds.length - 1);
    const appointmentId = appointmentIds[ai];
    const clientId = appointmentClientMap[ai];
    const status = pick(INVOICE_STATUSES);
    const subtotal = randFloat(79, 2500);
    const taxRate = 8.5;
    const taxAmount = parseFloat((subtotal * 0.085).toFixed(2));
    const total = parseFloat((subtotal + taxAmount).toFixed(2));
    const paidAt =
      status === "paid"
        ? new Date(twoYearsAgo.getTime() + Math.random() * (now.getTime() - twoYearsAgo.getTime()))
        : null;
    const dueDate = new Date(now.getTime() + randInt(7, 60) * 24 * 60 * 60 * 1000);
    const invoiceNumber = `INV-${String(index + 1).padStart(6, "0")}`;

    return {
      invoiceData: {
        status: status as any,
        subtotal,
        taxRate,
        taxAmount,
        total,
        paidAt,
        dueDate,
        invoiceNumber,
        business: { _link: userId },
        client: { _link: clientId },
        appointment: { _link: appointmentId },
      },
      lineData: {
        description: pick(SERVICE_NAMES),
        unitPrice: subtotal,
        quantity: 1,
        total: subtotal,
        taxable: true,
      },
    };
  });

  let invoiceLogCount = 0;
  const invoiceBatches = batchArray(invoiceItems, 25);
  const invoiceGroups = batchArray(invoiceBatches, 5);

  for (const group of invoiceGroups) {
    const results = await Promise.allSettled(
      group.map(async (batch) => {
        return await Promise.all(
          batch.map(async ({ invoiceData, lineData }) => {
            const invoice = await api.invoice.create(invoiceData);
            await api.invoiceLineItem.create({
              ...lineData,
              invoice: { _link: invoice.id },
            });
          })
        );
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        invoiceLogCount += result.value.length;
        if (Math.floor(invoiceLogCount / 2000) > Math.floor((invoiceLogCount - result.value.length) / 2000)) {
          logger.info({ count: invoiceLogCount }, "Invoices created so far");
        }
      } else {
        logger.warn({ error: String(result.reason) }, "Invoice batch failed");
      }
    }
  }

  logger.info({ clientCount, vehicleCount, appointmentCount, invoiceCount }, "Seed complete");

  return {
    clientsCreated: clientIds.length,
    vehiclesCreated: vehicleIds.length,
    appointmentsCreated: appointmentIds.length,
    invoicesCreated: invoiceLogCount,
  };
};

export const params = {
  clientCount: { type: "number" },
  vehicleCount: { type: "number" },
  appointmentCount: { type: "number" },
  invoiceCount: { type: "number" },
};

export const options: ActionOptions = {
  timeoutMS: 900000,
  triggers: { api: true },
};