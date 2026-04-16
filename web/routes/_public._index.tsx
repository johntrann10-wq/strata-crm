import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  ExternalLink,
  FileText,
  Receipt,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const homeTitle = "Automotive Service CRM | Strata";
const homeDescription =
  "Strata is a scheduling-first CRM for automotive service businesses. Manage appointments, customers, vehicles, quotes, invoices, deposits, and payments in one clean system.";

const featureRail = [
  {
    id: "scheduling",
    title: "Scheduling that stays clear",
    description: "Start from the month, drill into the day, and act with the full client and vehicle context.",
    desktopImage: "/marketing/strata-ui/hero-desktop-calendar.png",
    desktopAlt: "Monthly calendar with active appointments and day inspector.",
    mobileImage: "/marketing/strata-ui/hero-mobile-appointment.png",
    mobileAlt: "Mobile appointment detail with client, vehicle, and deposit status.",
  },
  {
    id: "crm",
    title: "Client + vehicle CRM",
    description: "Every customer, vehicle, and service history stays tied to quotes, appointments, and invoices.",
    desktopImage: "/marketing/strata-ui/desktop-customer-crm.png",
    desktopAlt: "Customer CRM list with vehicle context and activity.",
    mobileImage: "/marketing/strata-ui/mobile-client-detail.png",
    mobileAlt: "Mobile customer detail view with vehicles and activity.",
  },
  {
    id: "billing",
    title: "Quotes, invoices, and payments",
    description: "Send client-ready estimates, collect deposits, and track balances without switching tools.",
    desktopImage: "/marketing/strata-ui/desktop-invoice.png",
    desktopAlt: "Invoice workflow with line items, totals, and status.",
    mobileImage: "/marketing/strata-ui/mobile-portal-payment.png",
    mobileAlt: "Customer portal payment view on mobile.",
  },
  {
    id: "team",
    title: "Team access without the chaos",
    description: "Invite staff and control visibility with role-based permissions built for small teams.",
    desktopImage: "/marketing/strata-ui/desktop-team-access.png",
    desktopAlt: "Team access and roles settings.",
    mobileImage: "/marketing/strata-ui/team-access-mobile.png",
    mobileAlt: "Team access and roles on mobile.",
  },
];

type FeaturePreview = (typeof featureRail)[number];

const trustStrip = [
  { icon: Wrench, label: "Built for owner-operated shops" },
  { icon: Smartphone, label: "Mobile-ready pages for daily use" },
  { icon: CreditCard, label: "Stripe-powered deposits and payments" },
  { icon: ShieldCheck, label: "Customer portal + public approvals" },
  { icon: Users, label: "Role-based team access" },
];

const platformCards = [
  {
    title: "Scheduling",
    description: "Month-to-day calendar and appointment flow that stays clear.",
    icon: CalendarDays,
  },
  {
    title: "Client + Vehicle CRM",
    description: "Every customer and vehicle stays tied to the work.",
    icon: Users,
  },
  {
    title: "Quotes",
    description: "Send estimates with public approval and revisions.",
    icon: FileText,
  },
  {
    title: "Invoices",
    description: "Client-ready invoices with clear payment status.",
    icon: Receipt,
  },
  {
    title: "Deposits & Payments",
    description: "Collect deposits and track balances with Stripe.",
    icon: CreditCard,
  },
  {
    title: "Customer Portal",
    description: "Clients view quotes, invoices, and appointments in one hub.",
    icon: ExternalLink,
  },
  {
    title: "Finance Dashboard",
    description: "Track revenue, expenses, and collections health.",
    icon: TrendingUp,
  },
  {
    title: "Team Permissions",
    description: "Role-based access for owners, managers, and techs.",
    icon: UserCheck,
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
    { property: "og:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for automotive service businesses." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: "https://stratacrm.app/" },
    { name: "twitter:title", content: homeTitle },
    { name: "twitter:description", content: homeDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for automotive service businesses." },
  ];
}

type DeviceFrameProps = {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
};

function LaptopScreenshotFrame({ children, className, screenClassName }: DeviceFrameProps) {
  return (
    <div className={cn("relative isolate mx-auto w-full aspect-[495/294]", className)}>
      <div className="absolute inset-x-[11%] top-[4.5%] bottom-[10.8%] rounded-[24px] bg-[linear-gradient(180deg,#1f2937_0%,#0f172a_72%,#111827_100%)] p-[1.2%] shadow-[0_28px_60px_rgba(15,23,42,0.18)]">
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-[20px] bg-slate-50 ring-1 ring-white/10",
            screenClassName
          )}
        >
          {children}
        </div>
      </div>
      <div className="absolute inset-x-[8%] bottom-[10.5%] h-[1.4%] rounded-full bg-white/8" />
      <div className="absolute inset-x-[1.5%] bottom-[3.5%] h-[8.6%] rounded-b-[999px] rounded-t-[28px] bg-[linear-gradient(180deg,#6b7280_0%,#1f2937_24%,#0f172a_65%,#374151_100%)] shadow-[0_16px_30px_rgba(15,23,42,0.14)]" />
      <div className="absolute left-1/2 bottom-[5.9%] h-[1.6%] w-[14%] -translate-x-1/2 rounded-full bg-black/35" />
      <div className="absolute inset-x-[7%] bottom-[2.3%] h-[2.6%] rounded-b-[999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(15,23,42,0))]" />
    </div>
  );
}

function PhoneScreenshotFrame({ children, className, screenClassName }: DeviceFrameProps) {
  return (
    <div className={cn("relative isolate mx-auto w-full aspect-[195/374]", className)}>
      <div className="absolute inset-0 rounded-[18%] bg-[linear-gradient(145deg,#475569_0%,#111827_18%,#020617_44%,#1f2937_70%,#64748b_100%)] shadow-[0_24px_48px_rgba(15,23,42,0.22)]" />
      <div className="absolute inset-[1.5%] rounded-[17%] bg-[linear-gradient(145deg,#0f172a_0%,#1e293b_48%,#111827_100%)]" />
      <div
        className={cn(
          "absolute left-[8.8%] right-[8.8%] top-[4.4%] bottom-[4.4%] overflow-hidden rounded-[14%] bg-slate-50 ring-1 ring-black/5",
          screenClassName
        )}
      >
        {children}
      </div>
      <div className="absolute left-1/2 top-[6.5%] z-10 h-[4.4%] w-[30%] -translate-x-1/2 rounded-full bg-black/90 shadow-[0_1px_2px_rgba(255,255,255,0.08)]" />
      <div className="absolute right-[2.6%] top-[24%] h-[14%] w-[1.8%] rounded-full bg-white/15" />
      <div className="absolute left-[2.7%] top-[19%] h-[10%] w-[1.6%] rounded-full bg-white/10" />
    </div>
  );
}

export default function LandingPage() {
  const location = useLocation();
  const [activeFeatureId, setActiveFeatureId] = useState(featureRail[0]?.id ?? "scheduling");
  const featureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [displayedFeature, setDisplayedFeature] = useState<FeaturePreview>(featureRail[0]);
  const [queuedFeature, setQueuedFeature] = useState<FeaturePreview | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const loadedImages = useRef(new Set<string>());
  const transitionTimer = useRef<number | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const activeFeature = useMemo(
    () => featureRail.find((feature) => feature.id === activeFeatureId) ?? featureRail[0],
    [activeFeatureId]
  );
  const isFeatureLoaded = (feature: FeaturePreview | null) => {
    if (!feature) return true;
    return [feature.desktopImage, feature.mobileImage]
      .filter((src): src is string => Boolean(src))
      .every((src) => loadedImages.current.has(src));
  };
  const handleImageLoad = (src?: string) => {
    if (!src) return;
    if (loadedImages.current.has(src)) return;
    loadedImages.current.add(src);
    setLoadedVersion((value) => value + 1);
  };
  const markInteraction = () => {
    lastInteractionRef.current = Date.now();
  };

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    if ("addEventListener" in media) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    if ("addEventListener" in media) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;
    const sources = new Set<string>();
    featureRail.forEach((feature) => {
      sources.add(feature.desktopImage);
      if (feature.mobileImage) sources.add(feature.mobileImage);
    });
    sources.forEach((src) => {
      const img = new Image();
      img.src = src;
      const markLoaded = () => {
        if (!isMounted) return;
        if (loadedImages.current.has(src)) return;
        loadedImages.current.add(src);
        setLoadedVersion((value) => value + 1);
      };
      if (img.complete) {
        markLoaded();
      } else {
        img.onload = markLoaded;
        img.onerror = markLoaded;
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const next = featureRail.find((feature) => feature.id === activeFeatureId);
    if (!next || next.id === displayedFeature.id) return;
    if (transitionTimer.current) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
    setIsTransitioning(false);
    setQueuedFeature(next);
  }, [activeFeatureId, displayedFeature.id]);

  useEffect(() => {
    if (!queuedFeature) return;
    if (prefersReducedMotion) {
      setDisplayedFeature(queuedFeature);
      setQueuedFeature(null);
      return;
    }
    if (!isFeatureLoaded(queuedFeature)) return;
    setIsTransitioning(true);
    transitionTimer.current = window.setTimeout(() => {
      setDisplayedFeature(queuedFeature);
      setQueuedFeature(null);
      setIsTransitioning(false);
      transitionTimer.current = null;
    }, 700);
    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
    };
  }, [queuedFeature, loadedVersion, prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion || isDesktop) return;
    const interval = window.setInterval(() => {
      if (queuedFeature || isTransitioning) return;
      if (Date.now() - lastInteractionRef.current < 5000) return;
      const currentIndex = featureRail.findIndex((feature) => feature.id === activeFeatureId);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % featureRail.length;
      setActiveFeatureId(featureRail[nextIndex].id);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeFeatureId, isDesktop, prefersReducedMotion, queuedFeature, isTransitioning]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_24%,#ffffff_100%)] text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeSchema) }} />

      <section className="relative overflow-hidden px-5 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-18 lg:px-8 lg:pb-20 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 10% 10%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 36%), radial-gradient(circle at 85% 12%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
              Built for owner-operated automotive service businesses
            </p>
            <div className="space-y-4">
              <h1 className="text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                A cleaner CRM for automotive service businesses
              </h1>
              <p className="max-w-xl text-lg leading-8 text-gray-600 sm:text-xl">
                Schedule work, track customers and vehicles, send estimates and invoices, and collect deposits and payments in one modern system
                built for the day-to-day shop flow.
              </p>
              <p className="text-sm font-medium text-gray-500">
                Detailers, tint and wrap shops, mobile service operators, and small teams.
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
            </div>
            <p className="text-sm font-medium text-gray-500">30-day free trial | No card required | Founder pricing $29/mo</p>
          </div>

          <div className="relative px-2 pb-16 sm:px-4 sm:pb-20">
            <div className="rounded-[36px] border border-orange-100/80 bg-[radial-gradient(circle_at_top,#fff7ed_0%,#ffffff_52%,#fff1e8_100%)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
              <LaptopScreenshotFrame className="max-w-[44rem]">
                <img
                  src="/marketing/strata-ui/hero-desktop-calendar.png"
                  alt="Strata calendar with month overview and active appointments."
                  className="h-full w-full object-cover object-left-top"
                  loading="eager"
                />
              </LaptopScreenshotFrame>
            </div>
            <PhoneScreenshotFrame className="absolute -bottom-1 right-0 w-28 sm:right-4 sm:w-36 lg:w-40">
              <img
                src="/marketing/strata-ui/hero-mobile-appointment.png"
                alt="Strata mobile appointment details."
                className="h-full w-full object-cover object-top"
                loading="eager"
              />
            </PhoneScreenshotFrame>
          </div>
        </div>
      </section>

      <section className="px-5 pb-12 sm:px-6 sm:pb-14 lg:px-8 lg:pb-16">
        <div className="mx-auto grid max-w-6xl gap-3 rounded-[28px] border border-orange-100 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-5">
          {trustStrip.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-orange-100/70 bg-white px-3 py-3">
              <item.icon className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col gap-4 text-center lg:mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Workflow preview</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              See how Strata runs the day-to-day shop flow.
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-7 text-gray-600">
              Every view is built around scheduling clarity, customer context, and billing follow-through.
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
                    onMouseEnter={() => {
                      markInteraction();
                      setActiveFeatureId(feature.id);
                    }}
                    onClick={() => {
                      markInteraction();
                      setActiveFeatureId(feature.id);
                    }}
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
              <div className="relative overflow-visible rounded-[36px] border border-orange-100/80 bg-[radial-gradient(circle_at_top,#fff7ed_0%,#ffffff_52%,#fff1e8_100%)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="relative pr-12 pb-10">
                  <LaptopScreenshotFrame>
                    <div className="relative h-full w-full">
                      <img
                        src={displayedFeature.desktopImage}
                        alt={displayedFeature.desktopAlt}
                        className="absolute inset-0 h-full w-full object-cover"
                        onLoad={() => handleImageLoad(displayedFeature.desktopImage)}
                        loading="lazy"
                      />
                      {queuedFeature ? (
                        <div
                          className={cn(
                            "absolute inset-0 transform-gpu transition-all duration-650 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none",
                            isTransitioning ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.99]"
                          )}
                        >
                          <img
                            src={queuedFeature.desktopImage}
                            alt={queuedFeature.desktopAlt}
                            className="absolute inset-0 h-full w-full object-cover"
                            onLoad={() => handleImageLoad(queuedFeature.desktopImage)}
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                    </div>
                  </LaptopScreenshotFrame>
                  {displayedFeature.mobileImage || queuedFeature?.mobileImage ? (
                    <PhoneScreenshotFrame className="absolute -bottom-1 right-0 w-36 lg:w-40">
                      <div className="relative h-full w-full">
                        {displayedFeature.mobileImage ? (
                          <img
                            src={displayedFeature.mobileImage}
                            alt={displayedFeature.mobileAlt ?? "Strata mobile preview"}
                            className="absolute inset-0 h-full w-full object-cover"
                            onLoad={() => handleImageLoad(displayedFeature.mobileImage)}
                            loading="lazy"
                          />
                        ) : null}
                        {queuedFeature?.mobileImage ? (
                          <div
                            className={cn(
                              "absolute inset-0 transform-gpu transition-all duration-650 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none",
                              isTransitioning ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.99]"
                            )}
                          >
                            <img
                              src={queuedFeature.mobileImage}
                              alt={queuedFeature.mobileAlt ?? "Strata mobile preview"}
                              className="absolute inset-0 h-full w-full object-cover"
                              onLoad={() => handleImageLoad(queuedFeature.mobileImage)}
                              loading="lazy"
                            />
                          </div>
                        ) : null}
                      </div>
                    </PhoneScreenshotFrame>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <div className="grid grid-cols-2 gap-2 pb-3">
              {featureRail.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                    onClick={() => {
                      markInteraction();
                      setActiveFeatureId(feature.id);
                    }}
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]",
                    feature.id === activeFeatureId
                      ? "border-orange-200 bg-orange-100 text-orange-800"
                      : "border-orange-100 bg-white text-gray-600"
                  )}
                >
                  {feature.title}
                </button>
              ))}
            </div>
            <div className="rounded-[32px] border border-orange-100 bg-white/95 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.08)]">
              <div className="relative overflow-visible px-1 pb-10">
                <LaptopScreenshotFrame>
                  <div className="relative h-full w-full">
                    <img
                      src={displayedFeature.desktopImage}
                      alt={displayedFeature.desktopAlt}
                      className="absolute inset-0 h-full w-full object-cover"
                      onLoad={() => handleImageLoad(displayedFeature.desktopImage)}
                      loading="lazy"
                    />
                    {queuedFeature ? (
                      <div
                        className={cn(
                          "absolute inset-0 transform-gpu transition-all duration-650 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none",
                          isTransitioning ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.99]"
                        )}
                      >
                        <img
                          src={queuedFeature.desktopImage}
                          alt={queuedFeature.desktopAlt}
                          className="absolute inset-0 h-full w-full object-cover"
                          onLoad={() => handleImageLoad(queuedFeature.desktopImage)}
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </div>
                </LaptopScreenshotFrame>
                {displayedFeature.mobileImage || queuedFeature?.mobileImage ? (
                  <PhoneScreenshotFrame className="absolute -bottom-2 right-1 w-24 sm:w-28">
                    <div className="relative h-full w-full">
                      {displayedFeature.mobileImage ? (
                        <img
                          src={displayedFeature.mobileImage}
                          alt={displayedFeature.mobileAlt ?? "Strata mobile preview"}
                          className="absolute inset-0 h-full w-full object-cover"
                          onLoad={() => handleImageLoad(displayedFeature.mobileImage)}
                          loading="lazy"
                        />
                      ) : null}
                      {queuedFeature?.mobileImage ? (
                        <div
                          className={cn(
                            "absolute inset-0 transform-gpu transition-all duration-650 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none",
                            isTransitioning ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.99]"
                          )}
                        >
                          <img
                            src={queuedFeature.mobileImage}
                            alt={queuedFeature.mobileAlt ?? "Strata mobile preview"}
                            className="absolute inset-0 h-full w-full object-cover"
                            onLoad={() => handleImageLoad(queuedFeature.mobileImage)}
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                    </div>
                  </PhoneScreenshotFrame>
                ) : null}
              </div>
              <div className="space-y-2 px-2 pb-2 pt-4">
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
              Everything a modern automotive service business needs, in one system.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-gray-600">
              Keep scheduling, CRM, and billing connected without stacking separate tools.
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
              <p className="text-base leading-7 text-gray-600">No card required to start. Lock in founder pricing while spots remain.</p>
              <div className="flex flex-wrap gap-3 text-sm font-semibold text-gray-700">
                <span className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2">Founder pricing $29/mo</span>
                <span className="rounded-full border border-slate-200 bg-white px-4 py-2">Public pricing $79/mo</span>
                <span className="rounded-full border border-orange-200 bg-white px-4 py-2 text-orange-800">
                  Founder pricing: 25 spots · 23 left
                </span>
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

      <section className="px-5 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-orange-100 bg-white/90 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="mb-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Built for real workflows</p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              The product depth you need, without the overhead.
            </h2>
            <p className="text-sm leading-6 text-gray-600">
              Strata focuses on the workflows that keep appointments, customer context, and billing moving without clutter.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            <AccordionItem value="scheduling" className="rounded-2xl border border-orange-100 bg-white px-4">
              <AccordionTrigger className="py-4 text-left text-sm font-semibold">
                Scheduling clarity from month to day
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm text-gray-600">
                Month view, day drill-down, and appointment detail panels keep the schedule readable while the full client and vehicle context stays attached.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="billing" className="rounded-2xl border border-orange-100 bg-white px-4">
              <AccordionTrigger className="py-4 text-left text-sm font-semibold">
                Client-ready quotes, invoices, and payments
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm text-gray-600">
                Send estimates and invoices with public approval links, collect deposits, and let clients pay through the customer portal.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="automation" className="rounded-2xl border border-orange-100 bg-white px-4">
              <AccordionTrigger className="py-4 text-left text-sm font-semibold">
                Follow-ups and reminders when you want them
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm text-gray-600">
                Automations cover appointment reminders, review requests, abandoned quotes, and lapsed client outreach with configurable timing.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </div>
  );
}
