import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams, useOutletContext } from "react-router";
import type { FormEvent } from "react";
import { format } from "date-fns";
import { useFindFirst, useFindMany, useFindOne, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronLeft, ChevronsUpDown, FileText, Package, Plus, Send, Trash2, X, CalendarIcon, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { formatServiceCategory } from "../lib/serviceCatalog";
import { formatPackageIncludedItems, isPackageTemplateService } from "../lib/servicePackages";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { getTransactionalEmailErrorMessage } from "../lib/transactionalEmail";
import { getDisplayedAppointmentAmount } from "@/lib/appointmentAmounts";

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

type ServiceRecord = {
  id: string;
  name: string;
  price: number | null;
  durationMinutes?: number | null;
  category?: string | null;
  categoryId?: string | null;
  categoryLabel?: string | null;
  notes?: string | null;
  isAddon?: boolean | null;
};

type AddonLinkRecord = {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
};

type ClientPickerRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type AppointmentServicePrefillRecord = {
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  service?: { name?: string | null; price?: number | string | null } | null;
};

const DEFAULT_ADMIN_FEE_LABEL = "Admin fee";

function toMoneyNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function SelectionIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      )}
    >
      {checked ? <Check className="size-3 text-secondary" /> : null}
    </span>
  );
}

function getServiceSearchHaystack(service: ServiceRecord) {
  return [service.name, service.notes, service.categoryLabel ?? formatServiceCategory(service.category)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildAppointmentInvoiceItems(
  appointmentServices: AppointmentServicePrefillRecord[],
  appointmentTitle: string,
  appointmentTotalPrice: number,
  options?: {
    applyTax?: boolean | null;
    taxRate?: number | string | null;
    applyAdminFee?: boolean | null;
    adminFeeRate?: number | string | null;
  },
) {
  const appointmentItems = appointmentServices.map((appointmentService) => ({
    id: crypto.randomUUID(),
    description: appointmentService.service?.name ?? "Service",
    qty: Number(appointmentService.quantity ?? 1) || 1,
    unitPrice: Number(appointmentService.unitPrice ?? appointmentService.service?.price ?? 0) || 0,
  }));

  const appointmentSubtotal = appointmentItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const adminFeeRate = options?.applyAdminFee ? Number(options?.adminFeeRate ?? 0) : 0;
  const taxRate = options?.applyTax ? Number(options?.taxRate ?? 0) : 0;
  const effectiveAdminFee = adminFeeRate > 0 ? appointmentSubtotal * (adminFeeRate / 100) : 0;
  const taxableSubtotal = appointmentSubtotal + effectiveAdminFee;
  const effectiveTax = taxRate > 0 ? taxableSubtotal * (taxRate / 100) : 0;
  const structuredTotal = Number((taxableSubtotal + effectiveTax).toFixed(2));
  const needsAdjustment =
    Number.isFinite(appointmentTotalPrice) &&
    appointmentTotalPrice > 0 &&
    Math.abs(appointmentTotalPrice - structuredTotal) >= 0.01;

  if (!needsAdjustment) return appointmentItems;

  return [
    ...appointmentItems,
    {
      id: crypto.randomUUID(),
      description: `${appointmentTitle || "Appointment"} price adjustment`,
      qty: 1,
      unitPrice: Number((appointmentTotalPrice - structuredTotal).toFixed(2)),
    },
  ];
}

function buildInvoicePackageTemplates(
  services: ServiceRecord[],
  addonLinks: AddonLinkRecord[],
) {
  return services
    .filter((service) => !service.isAddon && isPackageTemplateService(service))
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean) as ServiceRecord[];

      return {
        baseService: service,
        linkedAddons,
        totalPrice:
          toMoneyNumber(service.price) +
          linkedAddons.reduce((sum, addon) => sum + toMoneyNumber(addon.price), 0),
        totalDuration:
          Number(service.durationMinutes ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon.durationMinutes ?? 0), 0),
      };
    });
}

function buildSelectedAddonSuggestions(
  services: ServiceRecord[],
  addonLinks: AddonLinkRecord[],
  lineItemDescriptions: string[],
) {
  const selectedDescriptions = new Set(lineItemDescriptions.map((description) => description.trim().toLowerCase()).filter(Boolean));
  return services
    .filter((service) => !service.isAddon && selectedDescriptions.has(service.name.trim().toLowerCase()))
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter((candidate): candidate is ServiceRecord => Boolean(candidate))
        .filter((addon) => !selectedDescriptions.has(addon.name.trim().toLowerCase()));
      return { baseService: service, linkedAddons };
    })
    .filter((entry) => entry.linkedAddons.length > 0);
}

function buildGroupedServices(
  services: ServiceRecord[],
  recommendedCategories: string[],
  normalizedServiceSearch: string,
) {
  const groups = new Map<string, { title: string; categoryKey: string; services: ServiceRecord[] }>();

  for (const service of services) {
    const haystack = getServiceSearchHaystack(service);
    if (normalizedServiceSearch && !haystack.includes(normalizedServiceSearch)) continue;
    const categoryKey = String(service.category ?? "other");
    const title = service.categoryLabel ?? formatServiceCategory(service.category);
    const key = service.categoryId ? `category:${service.categoryId}` : `legacy:${title.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) existing.services.push(service);
    else groups.set(key, { title, categoryKey, services: [service] });
  }

  return Array.from(groups.entries())
    .sort(([, left], [, right]) => {
      const leftRecommended = recommendedCategories.includes(left.categoryKey);
      const rightRecommended = recommendedCategories.includes(right.categoryKey);
      if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
      return left.title.localeCompare(right.title);
    })
    .map(([groupKey, group]) => ({
      category: groupKey,
      categoryKey: group.categoryKey,
      title: group.title,
      recommended: recommendedCategories.includes(group.categoryKey),
      services: group.services.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function findDirectServiceSearchResults(
  services: ServiceRecord[],
  normalizedServiceSearch: string,
) {
  if (!normalizedServiceSearch) return [];
  return services
    .filter((service) => getServiceSearchHaystack(service).includes(normalizedServiceSearch))
    .sort((left, right) => {
      const leftStartsWith = left.name.toLowerCase().startsWith(normalizedServiceSearch);
      const rightStartsWith = right.name.toLowerCase().startsWith(normalizedServiceSearch);
      if (leftStartsWith !== rightStartsWith) return leftStartsWith ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function getUniqueClientPickerRecords(records: Array<ClientPickerRecord | null | undefined>) {
  return Array.from(
    new Map(
      records
        .filter(Boolean)
        .map((record) => [record!.id, record!])
    ).values()
  );
}

function getEffectiveInvoiceClientRecord(
  selectedClientId: string,
  records: ClientPickerRecord[],
) {
  return records.find((client) => client.id === selectedClientId) ?? null;
}

function getClientDisplayName(client: ClientPickerRecord | null | undefined) {
  return [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || "Client";
}

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const { user, businessId, businessType } = useOutletContext<AuthOutletContext>();
  const userId = (user as any)?.id as string | undefined;
  const creationPreset = getWorkflowCreationPreset(businessType);

  const [searchParams] = useSearchParams();
  const appointmentIdParam = searchParams.get("appointmentId");
  const clientIdParam = searchParams.get("clientId");
  const quoteIdParam = searchParams.get("quoteId");
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/invoices";
  const hasQueueReturn = searchParams.has("from");

  const [{ data: businessRecord }] = useFindFirst(api.business, {
    filter: businessId ? { id: { equals: businessId } } : { id: { equals: "" } },
    select: { id: true, defaultTaxRate: true, defaultAdminFee: true, defaultAdminFeeEnabled: true },
    pause: !businessId,
  });

  const [selectedClientId, setSelectedClientId] = useState(() => clientIdParam ?? "");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [debouncedClientQuery, setDebouncedClientQuery] = useState("");

  const [{ data: clients, fetching: fetchingClients }, refetchClients] = useFindMany(api.client, {
    ...(debouncedClientQuery.length >= 2 ? { search: debouncedClientQuery } : {}),
    first: 20,
    pause: !businessRecord?.id,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });

  const [{ data: clientFromParam }] = useFindFirst(api.client, {
    filter: { id: { equals: clientIdParam ?? "" } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    pause: !clientIdParam,
  });

  const [{ data: selectedClientRecord }] = useFindFirst(api.client, {
    filter: { id: { equals: selectedClientId || "" } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    pause: !selectedClientId,
  });

  const [{ data: appointmentRecord }] = useFindOne(api.appointment, appointmentIdParam ?? undefined, {
    select: {
      id: true,
      title: true,
      subtotal: true,
      taxAmount: true,
      totalPrice: true,
      taxRate: true,
      applyTax: true,
      adminFeeAmount: true,
      adminFeeRate: true,
      applyAdminFee: true,
      client: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      vehicle: {
        id: true,
        year: true,
        make: true,
        model: true,
      },
    },
    pause: !appointmentIdParam,
  });

  const [{ data: quoteData }] = useFindOne(api.quote, quoteIdParam ?? undefined, {
    select: {
      id: true,
      clientId: true,
      taxRate: true,
      notes: true,
      lineItems: {
        edges: {
          node: {
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
        },
      },
    },
    pause: !quoteIdParam,
  });

  const [{ data: apptServices }] = useFindMany(api.appointmentService, {
    filter: appointmentIdParam
      ? { appointmentId: { equals: appointmentIdParam } }
      : { id: { equals: "" } },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      service: { name: true, price: true },
      duration: true,
    },
    first: 50,
    pause: !appointmentIdParam,
  });
  const [{ data: servicesData }] = useFindMany(api.service, {
    filter: { active: { equals: true } },
    select: { id: true, name: true, price: true, durationMinutes: true, category: true, categoryId: true, categoryLabel: true, notes: true, isAddon: true },
    sort: { name: "Ascending" },
    first: 250,
    pause: !businessRecord?.id,
  });
  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
    pause: !businessRecord?.id,
  } as any);

  const [, createInvoice] = useAction(api.invoice.create);
  const [{ fetching: creatingClient }, createClient] = useAction(api.client.create);

  async function finalizeRecoveredInvoiceFlow(invoiceId: string, mode: "draft" | "sent") {
    if (mode === "sent") {
      try {
        const sendResult = await api.invoice.sendToClient({ id: invoiceId });
        const deliveryStatus = (sendResult as { deliveryStatus?: string } | null)?.deliveryStatus;
        if (deliveryStatus === "emailed") {
          toast.success("Invoice created and emailed");
        } else {
          toast.warning("Invoice was created, but delivery state was unclear.");
        }
      } catch (sendError) {
        toast.error(`Invoice created, but ${getTransactionalEmailErrorMessage(sendError, "invoice")}`);
      }
    } else {
      toast.success("Invoice created successfully");
    }
    navigate(`/invoices/${invoiceId}?from=${encodeURIComponent(returnTo)}`);
  }

  async function recoverCreatedAppointmentInvoice(params: {
    appointmentId: string;
    clientId: string;
    expectedTotal: number;
    expectedLineItemCount: number;
  }): Promise<string | null> {
    try {
      const matches = await api.invoice.findMany({
        filter: {
          appointmentId: { equals: params.appointmentId },
          clientId: { equals: params.clientId },
        },
        sort: { createdAt: "Descending" },
        first: 5,
        select: {
          id: true,
          createdAt: true,
          total: true,
        },
      } as any);

      const candidates = Array.isArray(matches)
        ? (matches as Array<{ id?: string; createdAt?: string | null; total?: string | number | null }>)
        : [];

      for (const candidate of candidates) {
        if (!candidate?.id) continue;

        const createdAt = candidate.createdAt ? new Date(candidate.createdAt) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime())) {
          const ageMs = Date.now() - createdAt.getTime();
          if (ageMs > 2 * 60 * 1000) continue;
        }

        const detail = await api.invoice.findOne(candidate.id);
        const detailLineItems = Array.isArray((detail as { lineItems?: unknown[] } | null)?.lineItems)
          ? ((detail as { lineItems?: unknown[] }).lineItems ?? [])
          : [];
        const detailTotal = Number((detail as { total?: string | number | null } | null)?.total ?? 0);

        if (detailLineItems.length === 0) continue;
        if (detailLineItems.length < params.expectedLineItemCount) continue;
        if (Math.abs(detailTotal - params.expectedTotal) > 0.009) continue;

        return candidate.id;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Form state
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [expandedServiceCategories, setExpandedServiceCategories] = useState<string[]>([]);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [quickClientError, setQuickClientError] = useState("");
  const [createdInlineClient, setCreatedInlineClient] = useState<ClientPickerRecord | null>(null);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [applyTax, setApplyTax] = useState(false);
  const [applyAdminFee, setApplyAdminFee] = useState(false);
  const [adminFeeAmount, setAdminFeeAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'sent'>('draft');
  const hasSeededBusinessDefaults = useRef(false);

  // Pre-fill from linked quote
  useEffect(() => {
    if (!quoteData) return;

    const isBlankPlaceholder =
      lineItems.length === 1 &&
      lineItems[0].description === "" &&
      lineItems[0].qty === 1 &&
      lineItems[0].unitPrice === 0;

    if (isBlankPlaceholder) {
      const quoteLineItems =
        (quoteData as any).lineItems?.edges?.map((edge: any) => ({
          id: crypto.randomUUID(),
          description: edge.node.description ?? "",
          qty: Number(edge.node.quantity) || 1,
          unitPrice: Number(edge.node.unitPrice) || 0,
        })) ?? [];

      if (quoteLineItems.length > 0) {
        setLineItems(quoteLineItems);
      }
    }

    if ((quoteData as any).taxRate != null && (quoteData as any).taxRate !== "") {
      const nextTaxRate = Number((quoteData as any).taxRate);
      setTaxRate(nextTaxRate);
      setApplyTax(nextTaxRate > 0);
    }

    if (notes === "" && (quoteData as any).notes) {
      setNotes((quoteData as any).notes);
    }
  }, [lineItems, notes, quoteData, taxRate]);

  // Pre-fill client from linked quote
  useEffect(() => {
    if (!quoteData || !quoteIdParam || appointmentIdParam) return;
    const cid = (quoteData as { clientId?: string }).clientId;
    if (cid && !selectedClientId) setSelectedClientId(cid);
  }, [quoteData, quoteIdParam, selectedClientId, appointmentIdParam]);

  // Pre-fill client from URL param
  useEffect(() => {
    if (appointmentIdParam) return;
    if (clientFromParam && !selectedClientId) {
      setSelectedClientId(clientFromParam.id);
    }
  }, [clientFromParam, selectedClientId, appointmentIdParam]);

  useEffect(() => {
    const appointmentClientId = (appointmentRecord as { client?: { id?: string | null } | null } | null)?.client?.id;
    if (appointmentClientId && selectedClientId !== appointmentClientId) {
      setSelectedClientId(appointmentClientId);
    }
  }, [appointmentRecord, selectedClientId]);

  // Debounce client search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedClientQuery(clientSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearchQuery]);

  // Pre-fill line items from appointment services
  useEffect(() => {
    if (apptServices && apptServices.length > 0) {
      const isBlankPlaceholder =
        lineItems.length === 1 &&
        lineItems[0].description === "" &&
        lineItems[0].qty === 1 &&
        lineItems[0].unitPrice === 0;
      if (isBlankPlaceholder) {
        setLineItems(
          buildAppointmentInvoiceItems(
            apptServices as AppointmentServicePrefillRecord[],
            (appointmentRecord as { title?: string | null } | null)?.title || "Appointment",
            getDisplayedAppointmentAmount((appointmentRecord as Record<string, unknown> | null) ?? {}),
            {
              applyTax: (appointmentRecord as { applyTax?: boolean | null } | null)?.applyTax ?? false,
              taxRate: (appointmentRecord as { taxRate?: number | string | null } | null)?.taxRate ?? 0,
              applyAdminFee: (appointmentRecord as { applyAdminFee?: boolean | null } | null)?.applyAdminFee ?? false,
              adminFeeRate:
                (appointmentRecord as { adminFeeRate?: number | string | null } | null)?.adminFeeRate ?? 0,
            },
          )
        );
      }
    }
  }, [apptServices, appointmentRecord, lineItems]);

  useEffect(() => {
    if (!appointmentRecord || quoteIdParam) return;
    const nextTaxRate = Number((appointmentRecord as { taxRate?: number | string | null }).taxRate ?? 0);
    const nextApplyTax = Boolean((appointmentRecord as { applyTax?: boolean | null }).applyTax) && nextTaxRate > 0;
    const nextAdminFeeRate = Number((appointmentRecord as { adminFeeRate?: number | string | null }).adminFeeRate ?? 0);
    const nextApplyAdminFee =
      Boolean((appointmentRecord as { applyAdminFee?: boolean | null }).applyAdminFee) && nextAdminFeeRate > 0;
    setTaxRate(nextTaxRate);
    setApplyTax(nextApplyTax);
    setAdminFeeAmount(nextAdminFeeRate);
    setApplyAdminFee(nextApplyAdminFee);
    hasSeededBusinessDefaults.current = true;
  }, [appointmentRecord, quoteIdParam]);

  // Set default invoice charges from business when loaded
  useEffect(() => {
    if (!businessRecord || hasSeededBusinessDefaults.current || Boolean(quoteIdParam)) return;
    const defaultTaxRate = Number(businessRecord.defaultTaxRate ?? 0);
    const defaultAdminFee = Number((businessRecord as { defaultAdminFee?: number | string | null }).defaultAdminFee ?? 0);
    setTaxRate(defaultTaxRate);
    setApplyTax(defaultTaxRate > 0);
    setAdminFeeAmount(defaultAdminFee);
    setApplyAdminFee(
      Boolean((businessRecord as { defaultAdminFeeEnabled?: boolean | null }).defaultAdminFeeEnabled) && defaultAdminFee > 0
    );
    hasSeededBusinessDefaults.current = true;
  }, [businessRecord, quoteIdParam]);

  // Calculations
  const subtotal = lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const effectiveAdminFee = applyAdminFee ? subtotal * (adminFeeAmount / 100) : 0;
  const taxableSubtotal = subtotal + effectiveAdminFee;
  const effectiveTaxRate = applyTax ? taxRate : 0;
  const taxAmount = (taxableSubtotal * effectiveTaxRate) / 100;
  const total = taxableSubtotal + taxAmount - (discountAmount || 0);

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof Omit<LineItem, "id">, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addPackageAsLineItems = (baseService: ServiceRecord, addonServices: ServiceRecord[]) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: baseService.name,
        qty: 1,
        unitPrice: Number(baseService.price ?? 0),
      },
      ...addonServices.map((service) => ({
        id: crypto.randomUUID(),
        description: service.name,
        qty: 1,
        unitPrice: Number(service.price ?? 0),
      })),
    ]);
  };

  const addServiceAsLineItem = (service: ServiceRecord) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: service.name,
        qty: 1,
        unitPrice: toMoneyNumber(service.price),
      },
    ]);
  };

  const handleQuickClientFieldChange = (field: keyof typeof quickClientForm, value: string) => {
    setQuickClientForm((current) => ({ ...current, [field]: value }));
    if (quickClientError) setQuickClientError("");
  };

  const handleQuickAddClient = async () => {
    if (!businessRecord?.id) {
      setQuickClientError("Business profile not loaded. Refresh and try again.");
      return;
    }
    const firstName = quickClientForm.firstName.trim();
    const lastName = quickClientForm.lastName.trim();
    const phone = quickClientForm.phone.trim();
    const email = quickClientForm.email.trim();
    if (!firstName || !lastName) {
      setQuickClientError("First and last name are required.");
      return;
    }

    setQuickClientError("");
    const result = await createClient({
      firstName,
      lastName,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    });
    if (result.error) {
      setQuickClientError(result.error.message ?? "Failed to create client.");
      return;
    }
    const createdClientId = (result.data as { id?: string } | null)?.id;
    if (!createdClientId) {
      setQuickClientError("Client saved but no record ID was returned. Please refresh and try again.");
      return;
    }

    const createdClient: ClientPickerRecord = {
      id: createdClientId,
      firstName,
      lastName,
      phone: phone || null,
      email: email || null,
    };
    setCreatedInlineClient(createdClient);
    setSelectedClientId(createdClientId);
    setClientComboOpen(false);
    setClientSearchQuery("");
    setQuickClientOpen(false);
    setQuickClientForm({ firstName: "", lastName: "", phone: "", email: "" });
    await refetchClients();
    toast.success("Client added");
  };

  const serviceRecords = useMemo(() => (servicesData ?? []) as ServiceRecord[], [servicesData]);
  const addonLinks = useMemo(() => (packageAddonLinks ?? []) as AddonLinkRecord[], [packageAddonLinks]);
  const selectedAddonSuggestions = useMemo(
    () => buildSelectedAddonSuggestions(serviceRecords, addonLinks, lineItems.map((item) => item.description)),
    [addonLinks, lineItems, serviceRecords]
  );
  const lockedAppointmentClient = (appointmentRecord as { client?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null } | null)?.client ?? null;
  const appointmentClientId = lockedAppointmentClient?.id ?? "";
  const isClientLockedToAppointment = Boolean(appointmentIdParam && appointmentClientId);
  const searchableClientRecords = getUniqueClientPickerRecords([
    selectedClientRecord as ClientPickerRecord | null | undefined,
    clientFromParam as ClientPickerRecord | null | undefined,
    createdInlineClient,
    ...((clients ?? []) as ClientPickerRecord[]),
  ]);
  const effectiveClientRecord = isClientLockedToAppointment
    ? lockedAppointmentClient
    : getEffectiveInvoiceClientRecord(selectedClientId, searchableClientRecords);
  const normalizedServiceSearch = serviceSearchQuery.trim().toLowerCase();
  const packageTemplates = buildInvoicePackageTemplates(serviceRecords, addonLinks);
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
    [
      pkg.baseService.name,
      pkg.baseService.notes,
      ...pkg.linkedAddons.map((addon) => addon.name),
      pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedServiceSearch || "")
  );
  const otherPackageTemplates = packageTemplates.filter(
    (pkg) =>
      !creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
      [
        pkg.baseService.name,
        pkg.baseService.notes,
        ...pkg.linkedAddons.map((addon) => addon.name),
        pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedServiceSearch || "")
  );
  const groupedServices = buildGroupedServices(serviceRecords, creationPreset.recommendedCategories, normalizedServiceSearch);
  const directServiceSearchResults = findDirectServiceSearchResults(serviceRecords, normalizedServiceSearch);
  const dueDateObject = dueDate ? parseDateInputValue(dueDate) ?? undefined : undefined;


  const doSubmit = async (mode: 'draft' | 'sent') => {
    const effectiveClientId = isClientLockedToAppointment ? appointmentClientId : selectedClientId;

    if (!effectiveClientId) {
      toast.error("Please select a client");
      return;
    }

    if (!userId) {
      toast.error("User session not found");
      return;
    }

    if (!businessRecord?.id) {
      toast.error("Business record not found");
      return;
    }

    if (lineItems.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }

    const hasEmptyDescription = lineItems.some((item) => !item.description.trim());
    if (hasEmptyDescription) {
      toast.error("Please fill in all line item descriptions");
      return;
    }

    const dueDateValue = dueDate.trim();
    const parsedDueDate = dueDateValue ? parseDateInputValue(dueDateValue) : null;
    if (dueDateValue && !parsedDueDate) {
      toast.error("Enter a valid due date.");
      return;
    }

    setSubmitting(true);

    try {
      const invoiceResult = await createInvoice({
        clientId: effectiveClientId,
        appointmentId: appointmentIdParam ?? undefined,
        quoteId: quoteIdParam ?? undefined,
        status: "draft",
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: item.qty,
          unitPrice: item.unitPrice,
        })).concat(
          effectiveAdminFee > 0
            ? [
                {
                  description: DEFAULT_ADMIN_FEE_LABEL,
                  quantity: 1,
                  unitPrice: effectiveAdminFee,
                },
              ]
            : []
        ),
        discountAmount: discountAmount || 0,
        taxRate: effectiveTaxRate,
        notes: notes.trim() || undefined,
        dueDate: parsedDueDate
          ? new Date(
              parsedDueDate.getFullYear(),
              parsedDueDate.getMonth(),
              parsedDueDate.getDate(),
              12,
              0,
              0,
              0
            ).toISOString()
          : undefined,
      });

      if (invoiceResult.error) {
        if (appointmentIdParam) {
          const recoveredInvoiceId = await recoverCreatedAppointmentInvoice({
            appointmentId: appointmentIdParam,
            clientId: effectiveClientId,
            expectedTotal: total,
            expectedLineItemCount:
              lineItems.length + (effectiveAdminFee > 0 ? 1 : 0),
          });
          if (recoveredInvoiceId) {
            toast.warning("Invoice was created, but the appointment workflow lost the response. Finishing the workflow now.");
            await finalizeRecoveredInvoiceFlow(recoveredInvoiceId, mode);
            setSubmitting(false);
            return;
          }
        }
        toast.error(invoiceResult.error.message ?? "Failed to create invoice");
        setSubmitting(false);
        return;
      }

      const newInvoiceId = (invoiceResult.data as { id?: string } | null)?.id;
      if (!newInvoiceId) {
        toast.error("Failed to create invoice");
        setSubmitting(false);
        return;
      }

      if (mode === "sent") {
        await finalizeRecoveredInvoiceFlow(newInvoiceId, mode);
        return;
      }
      toast.success("Invoice created successfully");
      navigate(`/invoices/${newInvoiceId}?from=${encodeURIComponent(returnTo)}`);
    } catch (err: unknown) {
      if (appointmentIdParam) {
        const recoveredInvoiceId = await recoverCreatedAppointmentInvoice({
          appointmentId: appointmentIdParam,
          clientId: effectiveClientId,
          expectedTotal: total,
          expectedLineItemCount:
            lineItems.length + (effectiveAdminFee > 0 ? 1 : 0),
        });
        if (recoveredInvoiceId) {
          toast.warning("Invoice was created, but the appointment workflow lost the response. Finishing the workflow now.");
          await finalizeRecoveredInvoiceFlow(recoveredInvoiceId, mode);
          return;
        }
      }
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextMode = submitter?.dataset.submitMode as typeof submitMode | undefined;
    await doSubmit(nextMode ?? submitMode);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))]">
    <div className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-6 sm:pb-8 lg:px-8">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to invoices queue" /> : null}
      <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-md">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.13),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))] px-3 py-3 sm:px-5 sm:py-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(returnTo)}
            className="h-10 shrink-0 rounded-full px-3"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>

      {clientIdParam && selectedClientId && !isClientLockedToAppointment && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-4">
          <Check className="h-4 w-4 shrink-0" />
          <span>Client was carried in from the previous workflow.</span>
          <Link
            to={`/clients/${selectedClientId}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Client
          </Link>
        </div>
      )}

      {isClientLockedToAppointment && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-6">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            Creating invoice linked to appointment. The client is locked to that appointment and the services have been pre-filled.
          </span>
          <Link
            to={`/appointments/${appointmentIdParam}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Appointment
          </Link>
        </div>
      )}

      {quoteIdParam && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-6">
          <FileText className="h-4 w-4 shrink-0" />
          <span>Creating invoice from quote. Line items have been pre-filled.</span>
          <Link
            to={`/quotes/${quoteIdParam}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Quote
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-5">
        {/* Invoice Details */}
        <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold">Invoice details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            {/* Client Combobox */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>
                  Client <span className="text-red-500">*</span>
                </Label>
                {!isClientLockedToAppointment ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => {
                      setQuickClientOpen((open) => !open);
                      setQuickClientError("");
                    }}
                  >
                    {quickClientOpen ? (
                      <>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New client
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              {isClientLockedToAppointment ? (
                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3">
                  <div className="font-medium">
                    {lockedAppointmentClient
                      ? getClientDisplayName(lockedAppointmentClient)
                      : "Loading linked client…"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Client is locked because this invoice is linked to the appointment.
                  </p>
                </div>
              ) : (
                <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientComboOpen}
                      className="h-11 w-full justify-between rounded-xl font-normal"
                    >
                      {effectiveClientRecord
                        ? getClientDisplayName(effectiveClientRecord)
                        : selectedClientId
                        ? "Loading…"
                        : "Select a client…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type to search clients…"
                        value={clientSearchQuery}
                        onValueChange={setClientSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {clientSearchQuery.length < 2
                            ? "Start typing to search clients, or add a new one below."
                            : fetchingClients
                            ? "Loading…"
                            : "No clients found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {clients?.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.id}
                              onSelect={() => {
                                setSelectedClientId(client.id);
                                setClientComboOpen(false);
                                setClientSearchQuery("");
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedClientId === client.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="min-w-0">
                                <div className="font-medium">
                                  {getClientDisplayName(client)}
                                </div>
                                {client.email || client.phone ? (
                                  <div className="truncate text-xs text-muted-foreground">{client.email ?? client.phone}</div>
                                ) : null}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {!isClientLockedToAppointment && quickClientOpen ? (
                <div className="rounded-2xl border border-orange-100 bg-orange-50/45 p-3 shadow-[0_10px_24px_rgba(249,115,22,0.08)]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-client-first-name">First name</Label>
                      <Input
                        id="invoice-client-first-name"
                        value={quickClientForm.firstName}
                        onChange={(event) => handleQuickClientFieldChange("firstName", event.target.value)}
                        placeholder="Jane"
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-client-last-name">Last name</Label>
                      <Input
                        id="invoice-client-last-name"
                        value={quickClientForm.lastName}
                        onChange={(event) => handleQuickClientFieldChange("lastName", event.target.value)}
                        placeholder="Smith"
                        autoComplete="family-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-client-phone">Phone</Label>
                      <Input
                        id="invoice-client-phone"
                        type="tel"
                        value={quickClientForm.phone}
                        onChange={(event) => handleQuickClientFieldChange("phone", event.target.value)}
                        placeholder="(555) 000-0000"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-client-email">Email</Label>
                      <Input
                        id="invoice-client-email"
                        type="email"
                        value={quickClientForm.email}
                        onChange={(event) => handleQuickClientFieldChange("email", event.target.value)}
                        placeholder="jane@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  {quickClientError ? <p className="mt-3 text-xs text-destructive">{quickClientError}</p> : null}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button type="button" size="sm" onClick={() => void handleQuickAddClient()} disabled={creatingClient}>
                      {creatingClient ? "Saving..." : "Save client"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Saves the customer here, then keeps you on this invoice.
                    </p>
                  </div>
                </div>
              ) : null}
              {effectiveClientRecord?.email ? (
                <p className="text-xs text-muted-foreground">
                  Invoice communication will go to {effectiveClientRecord.email}.
                </p>
              ) : null}
            </div>

            {/* Invoice Number */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Invoice Number</Label>
                <span className="text-xs text-muted-foreground">(auto-generated)</span>
              </div>
              <div className="rounded-xl border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Auto-assigned on save
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-11 w-full justify-start rounded-xl text-left font-normal",
                      !dueDateObject && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDateObject ? format(dueDateObject, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto overflow-hidden rounded-2xl p-0"
                  align="start"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <Calendar
                    mode="single"
                    selected={dueDateObject}
                    onSelect={(date) => {
                      setDueDate(date ? format(date, "yyyy-MM-dd") : "");
                      setDueDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
            <CardTitle className="text-base font-semibold">Billable items</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="space-y-3">
              {/* Column Headers */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <Separator className="hidden sm:block" />

              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-6">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) =>
                        updateLineItem(item.id, "qty", Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="text-center"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={item.unitPrice === 0 ? "" : item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                      className="text-right"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-1 text-right text-sm font-medium hidden sm:block">
                    ${(item.qty * item.unitPrice).toFixed(2)}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => removeLineItem(item.id)}
                      disabled={lineItems.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className="mt-1"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>

              {serviceRecords.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-4">
                    {selectedAddonSuggestions.length > 0 ? (
                      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3 sm:p-4">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-semibold text-amber-950">Suggested add-ons</p>
                          <p className="text-xs leading-5 text-amber-800/80">
                            Based on services already on this invoice. Add only what was sold or completed.
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {selectedAddonSuggestions.map((suggestion) => (
                            <div key={suggestion.baseService.id} className="space-y-2">
                              <p className="text-xs font-medium text-amber-900/80">For {suggestion.baseService.name}</p>
                              <div className="flex flex-wrap gap-2">
                                {suggestion.linkedAddons.map((addon) => (
                                  <button
                                    key={addon.id}
                                    type="button"
                                    onClick={() => addServiceAsLineItem(addon)}
                                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-amber-50"
                                  >
                                    <Plus className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                                    <span className="min-w-0 break-words">{addon.name}</span>
                                    <span className="shrink-0 text-slate-500">${toMoneyNumber(addon.price).toFixed(2)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-border/70 bg-slate-50/70 p-3 sm:p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <p className="text-sm font-medium">Find services</p>
                        <div className="relative w-full lg:max-w-xs">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={serviceSearchQuery}
                            onChange={(event) => setServiceSearchQuery(event.target.value)}
                            placeholder="Search services, notes, or category..."
                            className="h-10 rounded-xl bg-white pl-9"
                          />
                        </div>
                      </div>
                    </div>

                    {recommendedPackageTemplates.length + otherPackageTemplates.length > 0 && (
                      <Accordion type="single" collapsible className="rounded-2xl border border-border/70 bg-card px-3 sm:px-4">
                        <AccordionItem value="packages" className="border-b-0">
                          <AccordionTrigger className="py-4 hover:no-underline">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Package className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 text-left">
                                <p className="text-sm font-semibold text-foreground">Packages</p>
                                <p className="text-xs text-muted-foreground">
                                  {recommendedPackageTemplates.length + otherPackageTemplates.length} template
                                  {recommendedPackageTemplates.length + otherPackageTemplates.length === 1 ? "" : "s"} available
                                </p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-4 pb-4">
                            {recommendedPackageTemplates.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended</p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {recommendedPackageTemplates.map((pkg) => (
                                    <button
                                      key={pkg.baseService.id}
                                      type="button"
                                      onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                                      className="rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
                                          </p>
                                        </div>
                                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>{pkg.totalDuration > 0 ? formatDuration(pkg.totalDuration) : "Custom duration"}</span>
                                        <span>·</span>
                                        <span>${pkg.totalPrice.toFixed(2)}</span>
                                      </div>
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        {formatPackageIncludedItems(pkg.linkedAddons.map((addon) => addon.name))}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {otherPackageTemplates.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Other packages</p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {otherPackageTemplates.map((pkg) => (
                                    <button
                                      key={pkg.baseService.id}
                                      type="button"
                                      onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                                      className="rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
                                          </p>
                                        </div>
                                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>{pkg.totalDuration > 0 ? formatDuration(pkg.totalDuration) : "Custom duration"}</span>
                                        <span>·</span>
                                        <span>${pkg.totalPrice.toFixed(2)}</span>
                                      </div>
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        {formatPackageIncludedItems(pkg.linkedAddons.map((addon) => addon.name))}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {directServiceSearchResults.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">Search results</p>
                          <p className="text-xs text-muted-foreground">
                            {directServiceSearchResults.length} match{directServiceSearchResults.length === 1 ? "" : "es"}
                          </p>
                        </div>
                        <div className="grid gap-2">
                          {directServiceSearchResults.map((service) => (
                            <button
                              key={service.id}
                              type="button"
                              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                              onClick={() => addServiceAsLineItem(service)}
                            >
                              <SelectionIndicator checked={false} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">{service.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {service.categoryLabel ?? formatServiceCategory(service.category)}
                                  {service.notes ? ` - ${service.notes}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-sm">
                                {service.durationMinutes != null && service.durationMinutes > 0 ? (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(service.durationMinutes)}
                                  </span>
                                ) : null}
                                <span className="font-semibold">
                                  ${toMoneyNumber(service.price).toFixed(2)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {groupedServices.length > 0 ? (
                      <Accordion
                        type="multiple"
                        value={expandedServiceCategories}
                        onValueChange={setExpandedServiceCategories}
                        className="rounded-2xl border border-border/70 bg-card px-3 sm:px-4"
                      >
                        {groupedServices.map((group) => (
                          <AccordionItem key={group.category} value={group.category}>
                            <AccordionTrigger className="py-4 hover:no-underline">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{group.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {group.services.length} service{group.services.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                {group.recommended ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                    Recommended
                                  </span>
                                ) : null}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-2 pb-4">
                              {group.services.map((service) => (
                                <button
                                  key={service.id}
                                  type="button"
                                  className="flex min-h-[60px] w-full select-none items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/40"
                                  onClick={() => addServiceAsLineItem(service)}
                                >
                                  <SelectionIndicator checked={false} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{service.name}</p>
                                    {service.notes ? (
                                      <p className="truncate text-xs text-muted-foreground">{service.notes}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-3 text-sm">
                                    {service.durationMinutes != null && service.durationMinutes > 0 ? (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {formatDuration(service.durationMinutes)}
                                      </span>
                                    ) : null}
                                    <span className="font-semibold">
                                      ${toMoneyNumber(service.price).toFixed(2)}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No services match this search yet. Try another term or clear the search.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Notes */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">Notes</CardTitle>
            </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <Textarea
              id="notes"
              placeholder="Add any notes for this invoice..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="min-h-[92px] resize-none rounded-xl"
            />
          </CardContent>
        </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="overflow-hidden rounded-[1.35rem] border-primary/25 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-primary/15 bg-primary/[0.04] px-4 py-4">
              <CardTitle className="text-base font-semibold">Invoice summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Invoice total</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.03em]">${total.toFixed(2)}</p>
              </div>
              <div className="space-y-2 rounded-2xl border border-border/70 bg-slate-50/70 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin fee</span>
                  <span className="font-medium">${effectiveAdminFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-red-500">-${(discountAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Apply tax</p>
                    <p className="text-xs text-muted-foreground">Override the saved rate for this invoice.</p>
                  </div>
                  <Switch checked={applyTax} onCheckedChange={setApplyTax} />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="h-9 rounded-xl text-sm"
                    disabled={!applyTax}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Admin fee</p>
                    <p className="text-xs text-muted-foreground">Adds a separate fee line item.</p>
                  </div>
                  <Switch checked={applyAdminFee} onCheckedChange={setApplyAdminFee} />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={adminFeeAmount === 0 ? "" : adminFeeAmount}
                    onChange={(e) => setAdminFeeAmount(parseFloat(e.target.value) || 0)}
                    className="h-9 rounded-xl text-sm"
                    disabled={!applyAdminFee}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice-discount">Discount</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    id="invoice-discount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={discountAmount === 0 ? "" : discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  type="submit"
                  disabled={submitting}
                  data-submit-mode="draft"
                  onClick={() => setSubmitMode('draft')}
                  className="h-11 w-full rounded-xl"
                >
                  {submitting ? "Saving..." : "Create Invoice"}
                </Button>
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-green-600 text-white hover:bg-green-700"
                  disabled={submitting}
                  onClick={() => doSubmit('sent')}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Create & Send
                </Button>
                <Button type="button" variant="outline" className="h-11 w-full rounded-xl" asChild>
                  <Link to={returnTo}>Cancel</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Invoice total</p>
              <p className="text-lg font-semibold">${total.toFixed(2)}</p>
            </div>
            <Button
              type="submit"
              disabled={submitting}
              data-submit-mode="draft"
              onClick={() => setSubmitMode('draft')}
              className="shrink-0"
            >
              {submitting ? "Saving..." : "Create"}
            </Button>
            <Button
              type="button"
              variant="default"
              className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
              disabled={submitting}
              onClick={() => doSubmit('sent')}
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
    </div>
  );
}
