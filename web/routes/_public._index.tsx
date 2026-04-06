import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { categorySeoPages, comparisonSeoPages, featureSeoPages, seoPageList } from "@/lib/seoPages";
import { cn } from "@/lib/utils";

const homeTitle = "Automotive Service Business Software | Strata CRM";
const homeDescription =
  "Strata CRM is modern software for automotive service businesses. Manage scheduling, clients, vehicles, jobs, quotes, invoices, deposits, team access, and connected Stripe payments in one clear system.";

const featureCards = [
  {
    icon: Calendar,
    title: "Schedule from a clear monthly view",
    description:
      "Start from the month, open the day, and book work fast without getting lost in a cluttered shop calendar.",
  },
  {
    icon: Users,
    title: "Keep clients, vehicles, and team access connected",
    description:
      "Customer records, vehicle history, appointments, jobs, and role-based team access stay tied together so staff only see what they need.",
  },
  {
    icon: FileText,
    title: "Send cleaner customer-facing documents",
    description:
      "Quotes, invoices, and appointment confirmations now feel client-ready for email, printing, approvals, and payment follow-through.",
  },
  {
    icon: Wrench,
    title: "Run real shop operations",
    description:
      "Track scheduling, job progress, technician handoff, deposits, and billing without stitching together generic CRM tools.",
  },
  {
    icon: CreditCard,
    title: "Collect invoices and deposits through connected Stripe",
    description:
      "Businesses connect their own Stripe account so customer invoice and deposit payments route to the right place with clearer status tracking.",
  },
  {
    icon: Layers,
    title: "Fit mixed automotive service businesses",
    description:
      "Use one operating system across detailing, tint, wrap, PPF, tires, mobile service, or mechanical work.",
  },
];

const trustPoints = [
  "Built for automotive service businesses, not generic agencies or sales teams",
  "Month-to-day scheduling flow designed for front-desk speed",
  "Client, vehicle, quote, appointment, deposit, invoice, and payment history in one place",
  "Role-based team permissions so staff only see the pages they should",
];

const switchReasons = [
  {
    title: "Stop stitching together calendar, notes, and invoices",
    description:
      "Replace the patchwork of separate booking tools, spreadsheets, texts, and invoice apps with one connected operating flow.",
  },
  {
    title: "Make the front desk faster under real shop pressure",
    description:
      "See the schedule, customer, vehicle, and next action quickly enough to answer the phone, book work, and keep the day moving.",
  },
  {
    title: "Keep your team aligned when work gets busy",
    description:
      "Service history, job status, approvals, invoices, payments, and page-level access stay tied together so staff do not lose context between handoffs.",
  },
];

const audienceTags = [
  "Auto detailing",
  "Tint and PPF",
  "Wrap shops",
  "Mobile service",
  "Tire shops",
  "Mechanical service",
  "Mixed operations",
];

const workflowSteps = [
  {
    step: "01",
    title: "Take in the client",
    description: "Create the customer, add the vehicle, and keep notes where your team can actually find them.",
  },
  {
    step: "02",
    title: "Book the right day",
    description: "Use the calendar and schedule board to place work quickly with the right service, vehicle, and deposit context.",
  },
  {
    step: "03",
    title: "Run the job and get paid",
    description: "Move from appointment to job to quote, invoice, deposit, and connected Stripe payment with fewer dead ends.",
  },
];

const productProof = [
  {
    eyebrow: "Scheduling",
    title: "See the month. Open the day. Book the work.",
    description:
      "The calendar is built to help a front-desk user understand availability and move into the exact day view that matters.",
    bullets: ["Monthly overview first", "Clean day drill-down", "Client + vehicle context attached"],
  },
  {
    eyebrow: "Operations",
    title: "Keep customer, vehicle, and job context where the team actually needs it.",
    description:
      "Clients, vehicles, notes, quotes, appointments, jobs, deposits, invoices, and payments stay connected instead of living in separate tools.",
    bullets: ["Vehicle history tied to the customer", "Quick next actions from records", "Less back-and-forth between screens"],
  },
  {
    eyebrow: "Billing",
    title: "Make approvals, invoicing, deposits, and collection less messy.",
    description:
      "Move from estimate to invoice with clearer states, public-facing documents, connected Stripe payments, and cleaner deposit handling.",
    bullets: ["Quote to invoice handoff", "Cleaner payment visibility", "Customer-ready documents and payment pages"],
  },
];

const proofStats = [
  { value: "1 system", label: "for scheduling, CRM, jobs, and billing" },
  { value: "Team-safe", label: "with role-based page permissions" },
  { value: "$29/mo", label: "with the first month free" },
];

const riskReversal = [
  "Start with the first month free before committing long term",
  "Use one clear plan instead of decoding feature tiers",
  "Set up clients, vehicles, services, scheduling, and billing defaults in one workspace",
];

const buyerTriggers = [
  "Your scheduler, notes, and invoices all live in different tools",
  "Staff keep asking where the last quote, vehicle note, or payment update went",
  "Booking work feels slower than it should because context, deposits, and follow-up are scattered",
];

const objections = [
  {
    question: "Will this feel too complicated for my staff?",
    answer:
      "The product is built around obvious next steps: create the client, add the vehicle, book the work, run the job, and get paid. The goal is less training overhead, not more.",
  },
  {
    question: "Is this only for one type of shop?",
    answer:
      "No. Strata is designed for mixed automotive service businesses, including detailing, tint, wrap, PPF, mobile service, tires, and mechanical work.",
  },
  {
    question: "Do I need multiple tools to handle scheduling, CRM, and billing?",
    answer:
      "No. The point of Strata is to reduce tool sprawl by keeping customer records, scheduling, jobs, invoices, deposits, and payments in one operating system.",
  },
];

const previewAppointments = [
  { time: "8:00 AM", title: "Full interior + exterior detail", customer: "Alex R. | 2022 Tesla Model 3 | Deposit paid", status: "Confirmed" },
  { time: "10:30 AM", title: "Front two windows tint", customer: "Monica S. | 2021 Honda Accord | Waiting on approval", status: "Scheduled" },
  { time: "1:00 PM", title: "Brake pad and rotor replacement", customer: "Chris M. | 2018 F-150 | Invoice balance due", status: "In progress" },
];

const featureCategories = [
  {
    icon: Calendar,
    eyebrow: "Scheduling",
    title: "Front-desk scheduling and job flow",
    description: "Book work fast from a clear calendar and keep the appointment tied to the actual job, vehicle, deposit, and next action.",
    items: [
      "Month-to-day calendar flow",
      "Appointment confirmations and reminders",
      "Multi-day job timing and pickup-ready tracking",
      "Manual booking and schedule control",
    ],
  },
  {
    icon: Users,
    eyebrow: "CRM",
    title: "Clients, vehicles, and team access",
    description: "Keep customer history, vehicle context, and page-level team permissions inside the same operating system instead of spread across tools.",
    items: [
      "Client and vehicle records that stay connected",
      "Role-based team permissions",
      "Customer, vehicle, quote, invoice, and payment history in one place",
      "Mobile-friendly admin workflows",
    ],
  },
  {
    icon: CreditCard,
    eyebrow: "Billing",
    title: "Quotes, invoices, deposits, and payments",
    description: "Move cleanly from estimate to invoice with customer-facing pages, connected Stripe collection, and clearer approval and balance tracking.",
    items: [
      "Quotes and invoices",
      "Deposit collection and invoice payments",
      "Public customer-facing documents",
      "Cleaner billing visibility for the team",
    ],
  },
  {
    icon: FileText,
    eyebrow: "Self-service",
    title: "Customer hub and document actions",
    description: "Customers can review the work, pay, approve estimates, request changes, and request appointment updates from a single secure flow.",
    items: [
      "Customer hub from quote, invoice, and appointment links",
      "Approve or decline estimates",
      "Request estimate revisions",
      "Request appointment changes and pay deposits",
    ],
  },
  {
    icon: BellRing,
    eyebrow: "Follow-up",
    title: "Automations, notifications, and outreach",
    description: "Automate the repetitive follow-up while keeping the sends traceable and controllable from Settings.",
    items: [
      "Lead auto-response and uncontacted lead alerts",
      "Appointment reminders",
      "Abandoned quote follow-up",
      "Review requests and lapsed-client outreach",
    ],
  },
  {
    icon: Layers,
    eyebrow: "Connected tools",
    title: "Payments, SMS, calendar, and integrations",
    description: "Use Strata as the daily operating layer while still connecting the shop’s payment, messaging, calendar, and outbound systems.",
    items: [
      "Connected Stripe payments",
      "Twilio SMS workflows",
      "Google Calendar sync foundation",
      "Signed outbound webhooks and integration jobs",
    ],
  },
];

const calendarPreviewDays = ["Mon 24", "Tue 25", "Wed 26", "Thu 27", "Fri 28"];

const homeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://stratacrm.app/#organization",
      name: "Strata CRM",
      url: "https://stratacrm.app",
      logo: "https://stratacrm.app/social-preview.png?v=20260404a",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://stratacrm.app/#website",
      url: "https://stratacrm.app/",
      name: "Strata CRM",
      publisher: {
        "@id": "https://stratacrm.app/#organization",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://stratacrm.app/#software",
      name: "Strata CRM",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "29",
        priceCurrency: "USD",
      },
      description: homeDescription,
      url: "https://stratacrm.app/",
      provider: {
        "@id": "https://stratacrm.app/#organization",
      },
      brand: {
        "@id": "https://stratacrm.app/#organization",
      },
      audience: {
        "@type": "Audience",
        audienceType: "Automotive service businesses",
      },
      featureList: [
        "Appointment scheduling",
        "Client and vehicle CRM",
        "Role-based team access",
        "Quotes and estimates",
        "Invoices, deposits, and payment tracking",
        "Job workflow visibility",
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://stratacrm.app/",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: objections.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
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
    { property: "og:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for automotive shops." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: "https://stratacrm.app/" },
    { name: "twitter:title", content: homeTitle },
    { name: "twitter:description", content: homeDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM preview showing scheduling, CRM, and invoicing for automotive shops." },
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
      <section id="product" className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-18 lg:px-8 lg:pb-24 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 12% 12%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 34%), radial-gradient(circle at 86% 14%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,360px)] lg:items-start">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/88 px-3.5 py-1.5 text-sm font-medium text-orange-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              Strata CRM for automotive service businesses
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                Automotive shop software that keeps scheduling, team access, and billing moving in one clear daily flow.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
                Strata CRM helps automotive service businesses manage appointments, clients, vehicles, jobs, quotes, invoices,
                deposits, and connected Stripe payments without the clutter, guesswork, and broken flow of outdated shop software.
              </p>
              <p className="max-w-3xl text-base leading-7 text-gray-600">
                If your shop is juggling a booking calendar, customer notes, vehicle history, team permissions, quotes, invoices, and deposits across too many places,
                Strata is designed to bring that work back into one faster, easier system.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[54px] rounded-2xl bg-orange-500 px-7 text-base font-semibold text-white shadow-lg shadow-orange-200/70 hover:bg-orange-600"
                )}
                onClick={() => trackEvent("landing_cta_clicked", { placement: "hero_primary", target: "sign_up" })}
              >
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-gray-300 bg-white/85 px-7 text-base font-semibold text-gray-900 hover:bg-white"
                )}
                onClick={() => trackEvent("marketing_login_clicked", { placement: "hero_secondary" })}
              >
                Sign in
              </Link>
              <Link
                to="/pricing"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-gray-300 bg-white/85 px-7 text-base font-semibold text-gray-900 hover:bg-white"
                )}
                onClick={() => trackEvent("pricing_viewed", { placement: "hero_tertiary" })}
              >
                View pricing
              </Link>
              <Link
                to="/features"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-gray-300 bg-white/85 px-7 text-base font-semibold text-gray-900 hover:bg-white"
                )}
              >
                Explore features
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <p className="text-sm leading-6 text-gray-700">{point}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

            <div className="mt-4 rounded-3xl border border-orange-100 bg-white/92 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Founder pricing</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-extrabold tracking-tight text-gray-950">$29</span>
                    <span className="pb-1 text-base text-gray-600">per month</span>
                  </div>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-gray-600">
                    Early shops can lock in founder pricing at $29/mo. Public pricing will move to $99/mo.
                  </p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500">
                    First month free. One plan for the actual core workflows instead of hiding them behind feature tiers.
                  </p>
                </div>
                <Link
                  to="/pricing"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "min-h-[52px] rounded-2xl bg-gray-950 px-6 text-white hover:bg-gray-800"
                  )}
                >
                  View pricing
                </Link>
              </div>
            </div>
        </div>
      </section>

      <section className="px-5 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="rounded-[28px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Why buyers start looking</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              Most shops do not need more software. They need less fragmentation.
            </h2>
            <div className="mt-5 space-y-3">
              {buyerTriggers.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/55 px-4 py-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="text-sm leading-6 text-gray-700">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {switchReasons.map((item) => (
              <div
                key={item.title}
                className="rounded-[28px] border border-orange-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f3_100%)] p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]"
              >
                <h3 className="text-lg font-semibold tracking-tight text-gray-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 rounded-[28px] border border-orange-100 bg-orange-50/80 px-5 py-5 shadow-[0_10px_40px_rgba(249,115,22,0.08)] sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">See the flow clearly</p>
            <p className="mt-1 max-w-2xl text-base leading-7 text-gray-700">
              Strata is modern shop management software for detailing, tint, wrap, PPF, tire, performance, and mechanic businesses that need one clearer operating flow from intake to payment.
            </p>
          </div>
          <Link
            to="/pricing"
            className={cn(
              buttonVariants({ size: "lg" }),
              "min-h-[50px] rounded-2xl bg-gray-950 px-6 text-sm font-semibold text-white hover:bg-gray-800"
            )}
          >
            View pricing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Feature categories</p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {featureCategories.map(({ icon: Icon, eyebrow, title, description, items }) => (
              <div
                key={title}
                className="rounded-[28px] border border-orange-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f3_100%)] p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">{eyebrow}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-gray-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
                <div className="mt-5 space-y-2.5">
                  {items.map((item) => (
                    <div key={item} className="flex items-start gap-2.5 rounded-2xl border border-orange-100/80 bg-white/90 px-3.5 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      <p className="text-sm leading-6 text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-white/92 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">How it works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                What Strata CRM handles for an automotive service business.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
                Strata is designed so a first-time user can understand the next step quickly, while still giving a growing shop the scheduling, CRM, and billing depth it needs.
              </p>
            </div>

            <div className="grid gap-4">
              {workflowSteps.map((item) => (
                <div key={item.step} className="rounded-2xl border border-orange-100 bg-orange-50/55 px-4 py-4 sm:px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-orange-600 shadow-sm">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-950">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[30px] border border-orange-100 bg-white/96 p-5 shadow-[0_16px_60px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-orange-100 pb-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Product preview</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950">A calmer daily schedule view</h2>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700">
                March 25
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {previewAppointments.map((item) => (
                <div
                  key={`${item.time}-${item.title}`}
                  className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-[linear-gradient(180deg,#fffdfb_0%,#fff7f1_100%)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-gray-950 shadow-sm">
                      {item.time}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-950">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-600">{item.customer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full border border-orange-200 bg-white px-3 py-1.5 font-medium text-orange-700">
                      {item.status}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-orange-100 bg-gray-950 p-5 text-white shadow-[0_16px_60px_rgba(15,23,42,0.12)] sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">What that means in practice</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-lg font-semibold">Less hunting</p>
                  <p className="mt-1 text-sm leading-6 text-white/72">
                    Front-desk staff can see the day, the customer, the vehicle, and the job type without bouncing between views.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-lg font-semibold">Less payment confusion</p>
                  <p className="mt-1 text-sm leading-6 text-white/72">
                    Deposits, invoice balances, and customer-facing payment pages stay closer to the work instead of living in a separate system.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-lg font-semibold">Less second-guessing</p>
                  <p className="mt-1 text-sm leading-6 text-white/72">
                    Client, vehicle, schedule, billing, and page-level team access stay connected so the workflow feels more obvious.
                  </p>
                </div>
              </div>
            </div>
        </div>
      </section>

      <section className="px-5 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-3 rounded-[28px] border border-orange-100 bg-gray-950 px-5 py-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:grid-cols-3 sm:px-6 sm:py-6">
          {proofStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-2xl font-semibold tracking-tight text-white">{stat.value}</p>
              <p className="mt-1 text-sm leading-6 text-white/72">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className="rounded-[30px] border border-orange-100 bg-white/94 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Why it feels lower risk</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              A simpler buying decision for shops that want operational clarity fast.
            </h2>
            <div className="mt-6 grid gap-3">
              {riskReversal.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/55 px-4 py-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="text-sm leading-6 text-gray-700">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-orange-100 bg-gray-950 p-6 text-white shadow-[0_16px_60px_rgba(15,23,42,0.12)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">Best fit</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Strongest for owners who already know generic tools are slowing the shop down.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/72">
              Strata is a stronger fit when your team is past the point of “just use a calendar and figure the rest out,” but you still want software that stays clean and fast to use.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[54px] rounded-2xl bg-white text-base font-semibold text-gray-950 hover:bg-orange-50"
                )}
                onClick={() => trackEvent("landing_cta_clicked", { placement: "best_fit_card", target: "sign_up" })}
              >
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-white/20 bg-transparent text-base font-semibold text-white hover:bg-white/10"
                )}
                onClick={() => trackEvent("pricing_viewed", { placement: "best_fit_card" })}
              >
                See pricing and fit
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Product highlights</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Better than outdated shop software that feels heavier than the work itself.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              The goal is not more screens. It is faster scheduling, easier intake, stronger customer and vehicle history, better job handoff, and cleaner billing.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="rounded-[24px] border border-gray-200/90 bg-white/96 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_50px_rgba(249,115,22,0.10)]"
              >
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold tracking-tight text-gray-950">{title}</h3>
                    <p className="text-sm leading-6 text-gray-600">{description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link
              to="/shop-scheduling-software"
              className="rounded-full border border-orange-200 bg-white px-4 py-2 font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              Explore shop scheduling software
            </Link>
            <Link
              to="/detailing-crm"
              className="rounded-full border border-orange-200 bg-white px-4 py-2 font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              Explore detailing CRM software
            </Link>
            <Link
              to="/pricing"
              className="rounded-full border border-orange-200 bg-white px-4 py-2 font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              See Strata CRM pricing
            </Link>
            <Link
              to="/features"
              className="rounded-full border border-orange-200 bg-white px-4 py-2 font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              Explore Strata CRM features
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">What shop owners actually care about</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Why modern automotive service businesses switch to Strata.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              The product is designed around the moments that actually slow shops down: intake, scheduling, team handoff, approvals, invoicing, deposits, and getting paid.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {productProof.map((item) => (
              <div
                key={item.eyebrow}
                className="rounded-[26px] border border-orange-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f3_100%)] p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">{item.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-gray-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
                <div className="mt-5 space-y-2.5">
                  {item.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2.5 rounded-2xl border border-orange-100/80 bg-white/85 px-3.5 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      <p className="text-sm leading-6 text-gray-700">{bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="border-y border-orange-100 bg-[linear-gradient(180deg,#fff8f1_0%,#fffefc_100%)] px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Built for the way automotive shops actually work</p>
          <p className="mt-4 text-xl font-medium leading-8 text-gray-800 sm:text-2xl">
            Use one system across detailing, tint, wrap, PPF, tires, mobile service, mechanical work, or a hybrid shop model.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-gray-700">
            {audienceTags.map((type) => (
              <span
                key={type}
                className="rounded-full border border-orange-200 bg-white px-4 py-2 font-medium shadow-sm"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-white/94 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Compare use cases and alternatives</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Research the exact software category or comparison that matches your search.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              If you are comparing software by business type, workflow, or alternative, start with the pages below and then move into the route that best matches your shop.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3 text-sm">
            {comparisonSeoPages.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
              >
                {item.navLabel}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Software by shop type</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Explore the exact Strata workflow for your kind of shop.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              These pages are built around high-intent searches from real operators comparing software for their category, workflow, and growth stage.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {seoPageList.map((page) => (
              <Link
                key={page.key}
                to={page.path}
                className="rounded-[24px] border border-orange-100 bg-white/94 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_50px_rgba(249,115,22,0.10)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">{page.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-gray-950">{page.navLabel}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{page.seoDescription}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-700">
                  Explore page
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Browse by feature</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Start from the workflow you care about.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              If you are evaluating scheduling, CRM depth, or daily software fit, move into the feature pages below.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {featureSeoPages.map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Browse by business type</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">See software for your kind of shop.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Compare the exact Strata workflow for detailing, tint, wrap, mechanic, performance, tire, and exhaust businesses.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {categorySeoPages.slice(0, 5).map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Browse comparisons</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Research alternatives and best-fit pages.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              If you are actively comparing software, start with the pages built around competitor and category-intent searches.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {comparisonSeoPages.slice(0, 5).map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[30px] border border-orange-100 bg-white/94 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Common concerns</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Clear enough for a first-time user. Strong enough for a real shop.
            </h2>
          </div>

          <div className="mt-10 grid gap-4">
            {objections.map((item) => (
              <div key={item.question} className="rounded-2xl border border-orange-100 bg-orange-50/45 px-5 py-5">
                <h3 className="text-lg font-semibold tracking-tight text-gray-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[linear-gradient(135deg,#f97316_0%,#ea580c_100%)] px-6 py-10 text-center text-white shadow-[0_20px_70px_rgba(249,115,22,0.18)] sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-100">Start simple</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Replace admin chaos with a clearer operating flow.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-orange-50">
            Strata helps your team book faster, stay organized, and keep work moving without the clutter of heavier legacy systems.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-orange-100/90">
            Start with the first month free, get your workspace set up, and see whether the day-to-day flow feels better for your team.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[54px] rounded-2xl bg-white px-8 text-base font-semibold text-orange-600 hover:bg-orange-50"
              )}
              onClick={() => trackEvent("landing_cta_clicked", { placement: "pricing_footer", target: "sign_up" })}
            >
              Start free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/sign-in"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-h-[54px] rounded-2xl border-white/35 bg-transparent px-8 text-base font-semibold text-white hover:bg-white/10"
              )}
              onClick={() => trackEvent("marketing_login_clicked", { placement: "pricing_footer" })}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
