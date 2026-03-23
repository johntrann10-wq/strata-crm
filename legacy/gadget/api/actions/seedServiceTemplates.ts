import { ActionOptions } from "gadget-server";

type ServiceTemplate = {
  name: string;
  price: number;
  duration: number;
  category: string;
};

const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  "auto-detailing": [
    { name: "Exterior Wash & Dry", price: 50, duration: 60, category: "detailing" },
    { name: "Interior Detail", price: 150, duration: 180, category: "detailing" },
    { name: "Full Detail", price: 250, duration: 300, category: "detailing" },
    { name: "Paint Correction (1-Stage)", price: 500, duration: 480, category: "paint-correction" },
    { name: "Paint Correction (2-Stage)", price: 800, duration: 600, category: "paint-correction" },
    { name: "Ceramic Coating (1 Year)", price: 800, duration: 480, category: "ceramic-coating" },
    { name: "Ceramic Coating (3 Year)", price: 1200, duration: 600, category: "ceramic-coating" },
    { name: "Ceramic Coating (Lifetime)", price: 2000, duration: 720, category: "ceramic-coating" },
  ],
  "window-tinting": [
    { name: "Front Two Windows", price: 150, duration: 90, category: "tinting" },
    { name: "Full Sedan Tint", price: 300, duration: 180, category: "tinting" },
    { name: "Full SUV/Truck Tint", price: 400, duration: 240, category: "tinting" },
    { name: "Windshield Tint", price: 200, duration: 120, category: "tinting" },
  ],
  "wrap-ppf": [
    { name: "PPF Hood", price: 600, duration: 240, category: "ppf" },
    { name: "PPF Full Front", price: 1200, duration: 480, category: "ppf" },
    { name: "PPF Full Car", price: 3500, duration: 1440, category: "ppf" },
    { name: "Full Color Wrap", price: 3000, duration: 1440, category: "wrap" },
    { name: "Partial Wrap", price: 800, duration: 480, category: "wrap" },
  ],
  "auto-body-collision": [
    { name: "Dent Removal (small)", price: 150, duration: 120, category: "dent-removal" },
    { name: "Windshield Replacement", price: 350, duration: 120, category: "glass" },
    { name: "Bumper Repair", price: 500, duration: 300, category: "body-repair" },
  ],
  "tire-wheel-alignment": [
    { name: "Tire Rotation", price: 30, duration: 30, category: "tires" },
    { name: "Tire Installation (set of 4)", price: 80, duration: 60, category: "tires" },
    { name: "Wheel Alignment", price: 100, duration: 60, category: "alignment" },
    { name: "Tire Balance", price: 60, duration: 45, category: "tires" },
  ],
  "performance-customization": [
    { name: "ECU Tune", price: 600, duration: 180, category: "performance" },
    { name: "Audio System Install", price: 400, duration: 300, category: "audio-electronics" },
    { name: "Custom Lighting Install", price: 250, duration: 180, category: "lighting" },
  ],
  "mobile-services": [
    { name: "Mobile Exterior Wash", price: 75, duration: 60, category: "detailing" },
    { name: "Mobile Full Detail", price: 275, duration: 360, category: "detailing" },
    { name: "Mobile Oil Change", price: 80, duration: 45, category: "oil-change" },
  ],
};

const DEFAULT_TEMPLATES: ServiceTemplate[] = [
  { name: "Service Consultation", price: 0, duration: 30, category: "other" },
  { name: "Custom Service", price: 100, duration: 60, category: "other" },
];

export const run: ActionRun = async ({ params, logger, api }) => {
  const businessId = params.businessId as string;
  const businessType = params.businessType as string;

  const templates = SERVICE_TEMPLATES[businessType] ?? DEFAULT_TEMPLATES;

  logger.info({ businessId, businessType, templateCount: templates.length }, "Seeding service templates for business");

  for (const template of templates) {
    await api.service.create({
      name: template.name,
      price: template.price,
      duration: template.duration,
      category: template.category as any,
      taxable: true,
      active: true,
      business: { _link: businessId },
    });
  }

  logger.info({ businessId, businessType }, "Service templates seeded successfully");
};

export const params = {
  businessId: { type: "string" },
  businessType: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};
