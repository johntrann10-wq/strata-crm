import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const homeTitle = "Automotive Service Business Software | Strata CRM";
const homeDescription =
  "Strata CRM is a simpler CRM for detailers and small automotive service businesses. Manage bookings, customers, quotes, invoices, and payments in one clean system.";

const productProof = [
  {
    key: "calendar",
    title: "Scheduling that stays clear under pressure.",
    description: "Start from the month, open the day, and book without losing context.",
    image: "/marketing/strata-ui/hero-desktop-calendar.png",
    alt: "Strata calendar and scheduling view with a full week of appointments.",
    objectPosition: "left top",
  },
  {
    key: "billing",
    title: "Quotes and invoices that feel professional.",
    description: "Move from approval to payment without stitching together extra tools.",
    image: "/marketing/strata-ui/desktop-invoice-or-quote.png",
    alt: "Strata invoice workflow with line items and totals.",
    objectPosition: "right top",
  },
  {
    key: "mobile",
    title: "Mobile workflows that keep crews moving.",
    description: "Run the day from the bay or the driveway with a clean mobile UI.",
    image: "/marketing/strata-ui/mobile-payment-or-estimate.png",
    alt: "Strata mobile payment and estimate experience.",
    objectPosition: "center top",
  },
];

const outcomes = [
  {
    title: "Stay on top of bookings.",
    description: "A calendar built for quick day decisions and less backtracking.",
  },
  {
    title: "Keep customers and vehicles organized.",
    description: "Everything tied to the client and vehicle so your team never loses context.",
  },
  {
    title: "Send cleaner quotes and invoices.",
    description: "Customer-ready documents with clear status and approvals.",
  },
  {
    title: "Collect deposits and payments online.",
    description: "Connected Stripe payments with cleaner visibility for staff and customers.",
  },
  {
    title: "Manage work on desktop and mobile.",
    description: "A consistent workflow that works at the desk or on the go.",
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

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [location.pathname, location.hash]);

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
                src="/marketing/strata-ui/hero-desktop-calendar.png"
                alt="Strata CRM calendar view with active scheduling."
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
            <div className="absolute -bottom-10 right-4 w-36 rounded-[26px] border border-orange-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:right-8 sm:w-44 lg:w-52">
              <img
                src="/marketing/strata-ui/hero-mobile-appointment.png"
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
          <div className="grid gap-6 lg:grid-cols-3">
            {productProof.map((item) => (
              <div
                key={item.key}
                className="rounded-[26px] border border-orange-100 bg-white/95 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.05)]"
              >
                <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="h-44 w-full object-cover sm:h-48"
                    style={{ objectPosition: item.objectPosition }}
                    loading="lazy"
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-gray-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Outcomes</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              The daily outcomes detailers care about.
            </h2>
            <p className="text-base leading-7 text-gray-600">
              Strata keeps scheduling, customer context, and billing in one flow so your team moves faster without losing details.
            </p>
          </div>
          <div className="grid gap-4">
            {outcomes.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-2xl border border-orange-100 bg-white/95 p-4">
                <CheckCircle2 className="mt-1 h-5 w-5 text-orange-600" />
                <div>
                  <h3 className="text-base font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{item.description}</p>
                </div>
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
