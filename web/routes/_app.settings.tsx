import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router";
import { useFindFirst, useAction, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bell,
  Star,
  Wrench,
  CheckCircle2,
  CreditCard,
  Settings,
  ExternalLink,
  Info,
  Lock,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  PenLine,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";

const BUSINESS_TYPES = [
  { value: "auto_detailing", label: "Auto Detailing" },
  { value: "mobile_detailing", label: "Mobile Detailing" },
  { value: "ppf_ceramic", label: "PPF & Ceramic" },
  { value: "tint_shop", label: "Tint Shop" },
  { value: "mechanic", label: "Mechanic" },
  { value: "tire_shop", label: "Tire Shop" },
  { value: "car_wash", label: "Car Wash" },
  { value: "wrap_shop", label: "Wrap Shop" },
  { value: "dealership_service", label: "Dealership Service" },
  { value: "other_auto_service", label: "Other Auto Service" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET) — New York" },
  { value: "America/Chicago", label: "Central Time (CT) — Chicago" },
  { value: "America/Denver", label: "Mountain Time (MT) — Denver" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) — Los Angeles" },
  { value: "America/Phoenix", label: "Arizona Time (AZ) — Phoenix" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT) — Honolulu" },
];

const BILLING_FEATURES = [
  "Appointments & calendar",
  "Client & vehicle CRM",
  "Quotes & invoices",
  "Payments on invoices",
  "Service catalog",
];

function BillingTab({
  billingStatus,
  setBillingStatus,
  billingPortalLoading,
  setBillingPortalLoading,
  billingFeatures,
}: {
  billingStatus: { status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  setBillingStatus: (s: { status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null } | null) => void;
  billingPortalLoading: boolean;
  setBillingPortalLoading: (v: boolean) => void;
  billingFeatures: string[];
}) {
  useEffect(() => {
    let cancelled = false;
    api.billing.getStatus()
      .then((s) => { if (!cancelled) setBillingStatus(s); })
      .catch(() => { if (!cancelled) setBillingStatus({ status: null, trialEndsAt: null, currentPeriodEnd: null }); });
    return () => { cancelled = true; };
  }, [setBillingStatus]);

  const handleManageSubscription = async () => {
    setBillingPortalLoading(true);
    try {
      const result = await api.billing.createPortalSession();
      if (result?.url) window.location.href = result.url;
      else toast.error("Could not open billing portal.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBillingPortalLoading(false);
    }
  };

  const isActive = billingStatus?.status === "active" || billingStatus?.status === "trialing";
  const trialEnd = billingStatus?.trialEndsAt ? new Date(billingStatus.trialEndsAt) : null;
  const periodEnd = billingStatus?.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-md bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Plan &amp; Billing</CardTitle>
        </div>
        <CardDescription>
          Strata is $29/month. First month free. Manage your subscription and payment method below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {billingStatus && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isActive ? "default" : "secondary"}>
              {billingStatus.status === "trialing" ? "Free trial" : billingStatus.status === "active" ? "Active" : billingStatus.status ?? "No subscription"}
            </Badge>
            {trialEnd && billingStatus.status === "trialing" && (
              <span className="text-sm text-muted-foreground">
                Trial ends {trialEnd.toLocaleDateString()}
              </span>
            )}
            {periodEnd && billingStatus.status === "active" && (
              <span className="text-sm text-muted-foreground">
                Renews {periodEnd.toLocaleDateString()}
              </span>
            )}
          </div>
        )}
        <div>
          <p className="text-sm font-medium mb-3">Everything included:</p>
          <ul className="space-y-2">
            {billingFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <Separator />
        {isActive && (
          <Button
            onClick={handleManageSubscription}
            disabled={billingPortalLoading}
          >
            {billingPortalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Manage subscription
          </Button>
        )}
        {!isActive && billingStatus !== null && (
          <div className="space-y-2">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Subscribe to keep using Strata. Your data is saved.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/subscribe">Subscribe now — $29/mo, first month free</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FormData {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  bio: string;
  instagram: string;
  facebook: string;
  googleReviewLink: string;
  yelpReviewLink: string;
  facebookReviewLink: string;
  defaultTaxRate: number;
  currency: string;
  appointmentBufferMinutes: number;
  timezone: string;
}

const DEFAULT_FORM: FormData = {
  name: "",
  type: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  website: "",
  bio: "",
  instagram: "",
  facebook: "",
  googleReviewLink: "",
  yelpReviewLink: "",
  facebookReviewLink: "",
  defaultTaxRate: 0,
  currency: "USD",
  appointmentBufferMinutes: 15,
  timezone: "America/New_York",
};

export default function SettingsPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();
  const [activeTab, setActiveTab] = useState("profile");
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const [billingStatus, setBillingStatus] = useState<{ status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null } | null>(null);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [deleteLocationId, setDeleteLocationId] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: '', address: '', phone: '', timezone: '', active: true });

  const [{ data: business, fetching: businessFetching }] = useFindFirst(
    api.business,
    {
      filter: { owner: { id: { equals: user.id } } },
      select: {
        id: true,
        name: true,
        type: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        website: true,
        bio: true,
        instagram: true,
        facebook: true,
        googleReviewLink: true,
        yelpReviewLink: true,
        facebookReviewLink: true,
        defaultTaxRate: true,
        currency: true,
        appointmentBufferMinutes: true,
        timezone: true,
        logoUrl: true,
      },
    }
  );

  const [{ fetching: saving }, update] = useAction(api.business.update);

  const [{ data: locations, fetching: locationsFetching }, refetchLocations] = useFindMany(api.location, {
    filter: business?.id ? { businessId: { equals: business.id } } : undefined,
    select: { id: true, name: true, address: true, phone: true, timezone: true, active: true },
    sort: { name: "Ascending" },
    first: 50,
    pause: !business?.id,
  } as any);
  const [{ fetching: savingLocation }, saveLocation] = useAction(api.location.create);
  const [{ fetching: updatingLocation }, updateLocation] = useAction(api.location.update);
  const [{ fetching: deletingLocation }, deleteLocation] = useAction(api.location.delete);

  useEffect(() => {
    if (business) {
      setFormData({
        name: business.name ?? "",
        type: business.type ?? "",
        phone: business.phone ?? "",
        email: business.email ?? "",
        address: business.address ?? "",
        city: business.city ?? "",
        state: business.state ?? "",
        zip: business.zip ?? "",
        website: business.website ?? "",
        bio: business.bio ?? "",
        instagram: business.instagram ?? "",
        facebook: business.facebook ?? "",
        googleReviewLink: business.googleReviewLink ?? "",
        yelpReviewLink: business.yelpReviewLink ?? "",
        facebookReviewLink: business.facebookReviewLink ?? "",
        defaultTaxRate: business.defaultTaxRate ?? 0,
        currency: business.currency ?? "USD",
        appointmentBufferMinutes: business.appointmentBufferMinutes ?? 15,
        timezone: business.timezone ?? "America/New_York",
      });
    }
  }, [business]);

  const handleFieldChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openCreateLocation = () => {
    setEditingLocation(null);
    setLocForm({ name: '', address: '', phone: '', timezone: '', active: true });
    setLocationDialogOpen(true);
  };

  const openEditLocation = (loc: any) => {
    setEditingLocation(loc);
    setLocForm({ name: loc.name ?? '', address: loc.address ?? '', phone: loc.phone ?? '', timezone: loc.timezone ?? '', active: loc.active ?? true });
    setLocationDialogOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!locForm.name.trim() || !business?.id) return;
    if (editingLocation) {
      await updateLocation({ id: editingLocation.id, name: locForm.name.trim(), address: locForm.address || null, phone: locForm.phone || null, timezone: locForm.timezone || null, active: locForm.active });
    } else {
      await saveLocation({ name: locForm.name.trim(), address: locForm.address || null, phone: locForm.phone || null, timezone: locForm.timezone || null, active: locForm.active, business: { _link: business.id } });
    }
    setLocationDialogOpen(false);
    refetchLocations();
    toast.success(editingLocation ? 'Location updated' : 'Location created');
  };

  const handleDeleteLocation = async () => {
    if (!deleteLocationId) return;
    await deleteLocation({ id: deleteLocationId });
    setDeleteLocationId(null);
    refetchLocations();
    toast.success('Location deleted');
  };

  const handleSave = async () => {
    if (!business?.id) {
      toast.error("No business found to save.");
      return;
    }
    try {
      await update({
        id: business.id,
        name: formData.name,
        type: formData.type as any,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        website: formData.website || null,
        bio: formData.bio || null,
        instagram: formData.instagram || null,
        facebook: formData.facebook || null,
        googleReviewLink: formData.googleReviewLink || null,
        yelpReviewLink: formData.yelpReviewLink || null,
        facebookReviewLink: formData.facebookReviewLink || null,
        defaultTaxRate: formData.defaultTaxRate,
        currency: formData.currency || "USD",
        appointmentBufferMinutes: formData.appointmentBufferMinutes,
        timezone: formData.timezone || null,
      });
      toast.success("Settings saved successfully!");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save settings. Please try again.");
    }
  };

  if (businessFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings…</div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your business profile, locations, and billing</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Business Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>

        {/* ─── Business Profile Tab ─── */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>
                Your shop's core details shown on invoices and client-facing
                communications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Name + Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    placeholder="e.g. Elite Auto Detailing"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type">Business Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => handleFieldChange("type", v)}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select a type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Phone + Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleFieldChange("phone", e.target.value)}
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    placeholder="hello@yourbusiness.com"
                  />
                </div>
              </div>

              {/* Row 3: Website */}
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleFieldChange("website", e.target.value)}
                  placeholder="https://yourbusiness.com"
                />
              </div>

              {/* Row 4: Address grid */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-3 space-y-1.5">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleFieldChange("address", e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleFieldChange("city", e.target.value)}
                    placeholder="Los Angeles"
                  />
                </div>
                <div className="md:col-span-1 space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => handleFieldChange("state", e.target.value)}
                    placeholder="CA"
                  />
                </div>
              </div>

              {/* Row 5: ZIP */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={(e) => handleFieldChange("zip", e.target.value)}
                    placeholder="90001"
                  />
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleFieldChange("bio", e.target.value)}
                  placeholder="Tell clients a bit about your business…"
                  rows={3}
                />
              </div>

              <Separator />

              {/* Social / Review links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="instagram">Instagram Handle</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                      @
                    </span>
                    <Input
                      id="instagram"
                      className="rounded-l-none"
                      value={formData.instagram}
                      onChange={(e) => handleFieldChange("instagram", e.target.value)}
                      placeholder="yourhandle"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="facebook">Facebook Page</Label>
                  <Input
                    id="facebook"
                    value={formData.facebook}
                    onChange={(e) => handleFieldChange("facebook", e.target.value)}
                    placeholder="https://facebook.com/yourpage"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="googleReviewLink">Google Review Link</Label>
                <Input
                  id="googleReviewLink"
                  type="url"
                  value={formData.googleReviewLink}
                  onChange={(e) => handleFieldChange("googleReviewLink", e.target.value)}
                  placeholder="https://g.page/r/…"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yelpReviewLink">Yelp Review Link</Label>
                <Input
                  id="yelpReviewLink"
                  type="url"
                  value={formData.yelpReviewLink}
                  onChange={(e) => handleFieldChange("yelpReviewLink", e.target.value)}
                  placeholder="https://www.yelp.com/biz/your-business"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="facebookReviewLink">Facebook Review Link</Label>
                <Input
                  id="facebookReviewLink"
                  type="url"
                  value={formData.facebookReviewLink}
                  onChange={(e) => handleFieldChange("facebookReviewLink", e.target.value)}
                  placeholder="https://www.facebook.com/your-page/reviews"
                />
              </div>

              <Separator />

              {/* Operational settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="defaultTaxRate">Default Tax Rate</Label>
                  <div className="flex">
                    <Input
                      id="defaultTaxRate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      className="rounded-r-none"
                      value={formData.defaultTaxRate}
                      onChange={(e) =>
                        handleFieldChange("defaultTaxRate", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appointmentBufferMinutes">Appointment Buffer</Label>
                  <div className="flex">
                    <Input
                      id="appointmentBufferMinutes"
                      type="number"
                      min={0}
                      step={5}
                      className="rounded-r-none"
                      value={formData.appointmentBufferMinutes}
                      onChange={(e) =>
                        handleFieldChange(
                          "appointmentBufferMinutes",
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                    />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-sm">
                      min
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(v) => handleFieldChange("timezone", v)}
                  >
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={formData.currency}
                    onChange={(e) => handleFieldChange("currency", e.target.value.toUpperCase())}
                    placeholder="USD"
                    maxLength={3}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="min-w-[130px]">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Locations Tab ─── */}
        <TabsContent value="locations" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Locations</CardTitle>
                  <CardDescription className="mt-1">Manage your shop locations. Assign staff and appointments to specific locations.</CardDescription>
                </div>
                <Button onClick={openCreateLocation} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {locationsFetching ? (
                <div className="text-sm text-muted-foreground py-4">Loading locations...</div>
              ) : !locations || locations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
                  <MapPin className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-sm">No locations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add your first shop location to get started.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={openCreateLocation}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Location
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-md ${loc.active !== false ? 'bg-green-100' : 'bg-gray-100'}`}>
                          <MapPin className={`h-4 w-4 ${loc.active !== false ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{loc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[loc.address, loc.phone].filter(Boolean).join(' · ') || 'No address set'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {loc.active === false && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Inactive</span>}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditLocation(loc)}>
                          <PenLine className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteLocationId(loc.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Billing Tab ─── */}
        <TabsContent value="billing" className="space-y-6">
          <BillingTab
            billingStatus={billingStatus}
            setBillingStatus={setBillingStatus}
            billingPortalLoading={billingPortalLoading}
            setBillingPortalLoading={setBillingPortalLoading}
            billingFeatures={BILLING_FEATURES}
          />
        </TabsContent>
      </Tabs>
    </div>

    <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
          <DialogDescription>Enter the details for this shop location.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              value={locForm.name}
              onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Downtown Shop"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input
              value={locForm.address}
              onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="123 Main St, City, ST"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={locForm.phone}
              onChange={(e) => setLocForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="(555) 000-0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={locForm.timezone} onValueChange={(v) => setLocForm((f) => ({ ...f, timezone: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="loc-active"
              checked={locForm.active}
              onCheckedChange={(v) => setLocForm((f) => ({ ...f, active: v }))}
            />
            <Label htmlFor="loc-active" className="cursor-pointer">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveLocation}
            disabled={savingLocation || updatingLocation || !locForm.name.trim()}
          >
            {savingLocation || updatingLocation ? "Saving..." : "Save Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteLocationId} onOpenChange={(o) => !o && setDeleteLocationId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Location?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this location. Appointments and staff assigned to it will not be deleted but will no longer have a location assigned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteLocation}
            disabled={deletingLocation}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deletingLocation ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}