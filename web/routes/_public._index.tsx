import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  FileText,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Users,
  Workflow,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const homeTitle = "Automotive Service Business Software | Strata CRM";
const homeDescription =
  "Strata CRM is a simpler CRM for detailers and small automotive service businesses. Manage bookings, customers, quotes, invoices, and payments in one clean system.";

const featureRail = [
  {
    id: "scheduling",
    title: "Smart Scheduling",
    description: "Manage appointments, reschedules, and your weekly calendar without the clutter.",
    desktopImage: "/marketing/strata-ui/weekly-calendar-desktop.png",
    desktopAlt: "Weekly schedule view in Strata showing an active detailing week.",
    mobileImage: "/marketing/strata-ui/appointment-details-mobile.png",
    mobileAlt: "Mobile appointment details with customer and service context.",
  },
  {
    id: "crm",
    title: "Customer CRM",
    description: "Keep every client, vehicle, and service history in one organized place.",
    desktopImage: "/marketing/strata-ui/customer-crm-desktop.png",
    desktopAlt: "Customer CRM list with vehicles and contact information.",
    mobileImage: "/marketing/strata-ui/customer-detail-mobile.png",
    mobileAlt: "Mobile customer detail view with vehicle and contact info.",
  },
  {
    id: "quotes",
    title: "Quotes & Invoices",
    description: "Create estimates and invoices quickly with a cleaner day-to-day workflow.",
    desktopImage: "/marketing/strata-ui/invoice-quote-desktop.png",
    desktopAlt: "Invoice workflow with balance and line items.",
    mobileImage: "/marketing/strata-ui/payment-invoice-mobile.png",
    mobileAlt: "Mobile customer payment view.",
  },
  {
    id: "payments",
    title: "Deposits & Payments",
    description: "Collect deposits, send invoices, and accept online payments through Stripe.",
    desktopImage: "/marketing/strata-ui/invoice-quote-desktop.png",
    desktopAlt: "Invoice workflow with payment and balance context.",
    mobileImage: "/marketing/strata-ui/payment-invoice-mobile.png",
    mobileAlt: "Mobile payment page showing invoice details.",
  },
  {
    id: "mobile",
    title: "Mobile Workflow",
    description: "Run the business from your phone with pages optimized for real daily use.",
    desktopImage: "/marketing/strata-ui/customer-crm-desktop.png",
    desktopAlt: "Desktop CRM view connected to mobile workflows.",
    mobileImage: "/marketing/strata-ui/customer-detail-mobile.png",
    mobileAlt: "Mobile workflow view for customers and appointments.",
  },
  {
    id: "team",
    title: "Team Access",
    description: "Invite team members and control what each person can see and manage.",
    desktopImage: "/marketing/strata-ui/team-access-desktop.png",
    desktopAlt: "Team access controls for staff permissions.",
    mobileImage: null,
    mobileAlt: null,
  },
];

const platformCards = [
  {
    title: "Scheduling",
    description: "Weekly schedules and day views that stay fast under pressure.",
    icon: CalendarDays,
  },
  {
    title: "CRM",
    description: "Clients, vehicles, and service history in one ledger.",
    icon: Users,
  },
  {
    title: "Invoicing",
    description: "Clean estimates and invoices built for approvals.",
    icon: FileText,
  },
  {
    title: "Payments",
    description: "Accept card payments with clear Stripe status tracking.",
    icon: CreditCard,
  },
  {
    title: "Online Booking",
    description: "Keep intake structured with real booking context.",
    icon: Workflow,
  },
  {
    title: "Communication",
    description: "Email-ready updates that keep customers in the loop.",
    icon: MessageCircle,
  },
  {
    title: "Deposits",
    description: "Collect deposits without chasing manual follow-up.",
    icon: ShieldCheck,
  },
  {
    title: "Mobile Access",
    description: "Mobile-friendly pages for crews on the move.",
    icon: Smartphone,
  },
];

const homeSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Strata CRM",
  url: "https://stratacrm.app/",
  description: homeDescription,
};

export function meta() {
  const socialImageUrl = "https://stratacrm.app/social-preview.png?v=20260404a";
  return [
    { title: homeTitle },
    { name: "description", content: homeDescription },
    { name: "robots", content: "index,follow" },
    { property: "og:site_name", content: "Strata CRM" },
    { property: "og:title", content: homeTitle },
    { property: "og:description", content: homeDescription },
    { property: "og:url", content: "https://stratacrm.app/" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:secure_url", content: socialImageUrl },
    { property: "og:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for detailers." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: "https://stratacrm.app/" },
    { name: "twitter:title", content: homeTitle },
    { name: "twitter:description", content: homeDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for detailers." },
  ];
}

export default function LandingPage() {
  const location = useLocation();
  const [activeFeatureId, setActiveFeatureId] = useState(featureRail[0]?.id ?? "scheduling");
  const featureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeFeature = useMemo(
    () => featureRail.find((feature) => feature.id === activeFeatureId) ?? featureRail[0],
    [activeFeatureId]
  );

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const nextId = visible[0].target.getAttribute("data-feature-id");
          if (nextId) setActiveFeatureId(nextId);
        }
      },
      { threshold: [0.4, 0.6, 0.8] }
    );
    Object.values(featureRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_24%,#ffffff_100%)] text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeSchema) }} />

      <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-18 lg:px-8 lg:pb-24 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 10% 10%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 36%), radial-gradient(circle at 85% 12%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Built for detailers</p>
            <div className="space-y-4">
              <h1 className="text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                A simpler CRM for detailers
              </h1>
              <p className="max-w-xl text-lg leading-8 text-gray-600 sm:text-xl">
                Manage bookings, customers, quotes, invoices, and payments in one clean, mobile-friendly system built for modern detailing
                businesses.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[52px] rounded-2xl bg-orange-600 px-7 text-base font-semibold text-white shadow-[0_12px_30px_rgba(234,88,12,0.25)] hover:bg-orange-600"
                )}
                onClick={() => trackEvent("landing_cta_clicked", { placement: "hero", target: "sign_up" })}
              >
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/sign-in" className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">
                Sign in
              </Link>
            </div>
            <p className="text-sm font-medium text-gray-500">30-day free trial • No card required • Founder pricing available</p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[32px] border border-orange-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
              <img
                src="/marketing/strata-ui/weekly-calendar-desktop.png"
                alt="Strata CRM weekly schedule with active appointments."
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
            <div className="absolute -bottom-10 right-4 w-36 rounded-[26px] border border-orange-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:right-8 sm:w-44 lg:w-52">
              <img
                src="/marketing/strata-ui/appointment-details-mobile.png"
                alt="Strata CRM mobile appointment details."
                className="h-full w-full rounded-[26px] object-cover"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col gap-4 text-center lg:mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Product preview</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              See the workflow before you sign up.
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-7 text-gray-600">
              Strata keeps daily operations clear with one connected workflow for scheduling, CRM, and billing.
            </p>
          </div>

          <div className="hidden gap-10 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-5">
              {featureRail.map((feature) => {
                const isActive = feature.id === activeFeatureId;
                return (
                  <div
                    key={feature.id}
                    data-feature-id={feature.id}
                    ref={(node) => {
                      featureRefs.current[feature.id] = node;
                    }}
                    onMouseEnter={() => setActiveFeatureId(feature.id)}
                    onClick={() => setActiveFeatureId(feature.id)}
                    className={cn(
                      "rounded-2xl border px-5 py-4 transition-all",
                      isActive
                        ? "border-orange-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
                        : "border-orange-100 bg-white/70 hover:border-orange-200"
                    )}
                  >
                    <h3 className="text-lg font-semibold text-gray-950">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{feature.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="sticky top-24 h-fit">
              <div className="relative rounded-[28px] border border-orange-100 bg-white/95 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
                <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
                  <img
                    key={activeFeature?.desktopImage}
                    src={activeFeature?.desktopImage}
                    alt={activeFeature?.desktopAlt}
                    className="h-[360px] w-full object-cover transition-opacity duration-300"
                    loading="lazy"
                  />
                </div>
                {activeFeature?.mobileImage ? (
                  <div className="absolute -bottom-6 right-6 w-40 rounded-[22px] border border-orange-100 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
                    <img
                      key={activeFeature?.mobileImage}
                      src={activeFeature?.mobileImage}
                      alt={activeFeature?.mobileAlt ?? "Strata mobile preview"}
                      className="h-full w-full rounded-[22px] object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-3">
              {featureRail.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setActiveFeatureId(feature.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]",
                    feature.id === activeFeatureId
                      ? "border-orange-200 bg-orange-100 text-orange-800"
                      : "border-orange-100 bg-white text-gray-600"
                  )}
                >
                  {feature.title}
                </button>
              ))}
            </div>
            <div className="rounded-[24px] border border-orange-100 bg-white/95 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
                <img
                  key={activeFeature?.desktopImage}
                  src={activeFeature?.desktopImage}
                  alt={activeFeature?.desktopAlt}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
              </div>
              {activeFeature?.mobileImage ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-orange-100 bg-white">
                  <img
                    key={activeFeature?.mobileImage}
                    src={activeFeature?.mobileImage}
                    alt={activeFeature?.mobileAlt ?? "Strata mobile preview"}
                    className="h-56 w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : null}
              <div className="mt-4 space-y-2">
                <h3 className="text-base font-semibold text-gray-950">{activeFeature?.title}</h3>
                <p className="text-sm leading-6 text-gray-600">{activeFeature?.description}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Platform</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Everything a detailing shop needs, in one system.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-gray-600">
              Keep scheduling, CRM, and payments in one connected workflow without stacking separate tools.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformCards.map((card) => (
              <div key={card.title} className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <card.icon className="h-5 w-5 text-orange-600" />
                <h3 className="mt-3 text-base font-semibold text-gray-950">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-5 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-orange-100 bg-white/96 px-6 py-10 shadow-[0_18px_60px_rgba(15,23,42,0.07)] sm:px-10 sm:py-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Pricing</p>
              <h2 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                Simple pricing with a 30-day free trial.
              </h2>
              <p className="text-base leading-7 text-gray-600">No card required to start. Upgrade only when you are ready.</p>
              <div className="flex flex-wrap gap-3 text-sm font-semibold text-gray-700">
                <span className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2">Founder pricing $29/mo</span>
                <span className="rounded-full border border-slate-200 bg-white px-4 py-2">Public pricing $79/mo</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[52px] rounded-2xl bg-orange-600 px-7 text-base font-semibold text-white shadow-[0_12px_30px_rgba(234,88,12,0.25)] hover:bg-orange-600"
                )}
                onClick={() => trackEvent("landing_cta_clicked", { placement: "pricing", target: "sign_up" })}
              >
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/sign-in" className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
