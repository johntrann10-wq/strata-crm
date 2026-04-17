import { ArrowRight, CheckCircle2, ChevronRight, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { categorySeoPages, comparisonSeoPages, featureSeoPages } from "@/lib/seoPages";
import { cn } from "@/lib/utils";

const pricingTitle = "Strata CRM Pricing | Affordable Automotive Shop Software";
const pricingDescription =
  "See Strata CRM pricing for automotive service businesses. Founder pricing is $29/month with a 30-day free trial and no card required. Public pricing will move to $79/month.";

const pricingSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://stratacrm.app/pricing#webpage",
      name: pricingTitle,
      description: pricingDescription,
      url: "https://stratacrm.app/pricing",
      isPartOf: {
        "@id": "https://stratacrm.app/#website",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://stratacrm.app/pricing#software",
      name: "Strata CRM",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: pricingDescription,
      provider: {
        "@id": "https://stratacrm.app/#organization",
      },
      brand: {
        "@id": "https://stratacrm.app/#organization",
      },
      offers: {
        "@type": "Offer",
        price: "29",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: "https://stratacrm.app/pricing",
      },
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
        {
          "@type": "ListItem",
          position: 2,
          name: "Pricing",
          item: "https://stratacrm.app/pricing",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How much does Strata CRM cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Founder pricing is $29 per month with a 30-day free trial and no card required. Public pricing will move to $79 per month.",
          },
        },
        {
          "@type": "Question",
          name: "Who is Strata CRM pricing built for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Strata CRM pricing is designed for automotive service businesses such as auto detailing, mobile detailing, tint, wrap and PPF, mechanic, performance, tire, and exhaust shops.",
          },
        },
      ],
    },
  ],
};

const included = [
  "Appointment scheduling with a cleaner month-to-day flow",
  "Client and vehicle CRM in one connected system",
  "Quotes, invoices, payment visibility, and print-ready documents",
  "Business-type onboarding defaults and operational setup guidance",
  "Dashboard visibility, daily workflow support, and operational follow-through",
];

const pricingAssurances = [
  "30-day free trial with no card required to see the workflow in action",
  "Founder pricing at $29 per month with a clear path to public pricing at $79",
  "One plan instead of feature tiers that hold back core operations",
];

const buyerReasons = [
  {
    title: "Affordable automotive shop software",
    body: "Strata is priced for small and growing shops that need real operational software without paying for bloated legacy systems.",
  },
  {
    title: "Detailing CRM pricing that stays simple",
    body: "Solo detailers and growing detailing businesses can start fast without navigating enterprise-style tiers just to book work and send invoices.",
  },
  {
    title: "Shop scheduling software pricing with CRM and billing included",
    body: "You are not buying a disconnected calendar. The price covers the connected workflow around appointments, customers, vehicles, and invoices.",
  },
];

const faqs = [
  {
    question: "Is Strata priced for small automotive businesses?",
    answer:
      "Yes. The pricing is built to stay approachable for detailers, tint shops, wrap shops, mobile operators, independent mechanics, and other small-to-medium automotive businesses.",
  },
  {
    question: "Does the pricing include scheduling, CRM, and invoices?",
    answer:
      "Yes. The goal is one clear system for scheduling, clients, vehicles, quotes, invoices, and daily workflow visibility.",
  },
  {
    question: "Can I start with a simple setup and grow into it?",
    answer:
      "Yes. The product is designed to feel simple for a first-time operator while still preserving enough operational depth for a growing shop.",
  },
];

const switchComparison = [
  {
    label: "What you leave behind",
    points: ["Booking in one tool", "Customer and vehicle notes in another", "Quotes and invoices disconnected from the schedule"],
  },
  {
    label: "What you get in Strata",
    points: ["One connected workflow", "Shared client and vehicle context", "Scheduling to invoice continuity"],
  },
];

export function meta() {
  const socialImageUrl = "https://stratacrm.app/social-preview.png?v=20260416b";
  return [
    { title: pricingTitle },
    { name: "description", content: pricingDescription },
    { name: "robots", content: "index,follow" },
    { property: "og:site_name", content: "Strata CRM" },
    { property: "og:title", content: pricingTitle },
    { property: "og:description", content: pricingDescription },
    { property: "og:url", content: "https://stratacrm.app/pricing" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:secure_url", content: socialImageUrl },
    { property: "og:image:alt", content: "Strata CRM pricing preview for automotive service business software." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: "https://stratacrm.app/pricing" },
    { name: "twitter:title", content: pricingTitle },
    { name: "twitter:description", content: pricingDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM pricing preview for automotive service business software." },
  ];
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_24%,#ffffff_100%)] text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }} />

      <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-18 lg:px-8 lg:pb-24 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 12% 12%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 34%), radial-gradient(circle at 86% 14%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/88 px-3.5 py-1.5 text-sm font-medium text-orange-700 shadow-sm">
              <CreditCard className="h-4 w-4" />
              Strata CRM pricing
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                Affordable automotive shop software pricing that stays clear.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
                Strata CRM is priced for automotive service businesses that need scheduling, clients, vehicles, jobs, quotes, invoices, and daily workflow visibility in one modern system.
              </p>
              <p className="max-w-3xl text-base leading-7 text-gray-600">
                If you are searching for affordable automotive shop software, detailing CRM pricing, or shop scheduling software pricing, this page gives you the simple answer: one plan, a 30-day free trial, and no confusing tier maze.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[54px] rounded-2xl bg-orange-500 px-7 text-base font-semibold text-white shadow-lg shadow-orange-200/70 hover:bg-orange-600"
                )}
              >
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-gray-300 bg-white/85 px-7 text-base font-semibold text-gray-900 hover:bg-white"
                )}
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-orange-200/80 bg-white/95 p-5 shadow-[0_20px_70px_rgba(249,115,22,0.12)] sm:p-6">
            <div className="rounded-3xl bg-gray-950 p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">One clear plan</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-6xl font-extrabold tracking-tight">$29</span>
                <span className="pb-2 text-base text-white/72">per month</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/72">
                Founder pricing. Public pricing moves to $79/month. Start with a 30-day free trial and no card required.
              </p>
              <div className="mt-6 space-y-3">
                {included.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    <p className="text-sm text-white/88">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Best fit</p>
              <div className="mt-4 space-y-2">
                {["Auto detailing", "Mobile detailing", "Tint, wrap, and PPF", "Mechanic, performance, tire, and exhaust"].map((item) => (
                  <div key={item} className="rounded-2xl border border-orange-100/80 bg-white/85 px-3.5 py-3 text-sm text-gray-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="rounded-[28px] border border-orange-100 bg-gray-950 p-6 text-white shadow-[0_16px_60px_rgba(15,23,42,0.12)] sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">Why this pricing converts better</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Buyers do not have to decode tiers just to know if Strata fits.
            </h2>
            <div className="mt-5 space-y-3">
              {pricingAssurances.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                  <p className="text-sm leading-6 text-white/82">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {switchComparison.map((column) => (
              <div
                key={column.label}
                className="rounded-[28px] border border-orange-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f3_100%)] p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">{column.label}</p>
                <div className="mt-4 space-y-3">
                  {column.points.map((point) => (
                    <div key={point} className="rounded-2xl border border-orange-100/80 bg-white/85 px-4 py-3 text-sm leading-6 text-gray-700">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
          {buyerReasons.map((item) => (
            <Card key={item.title} className="rounded-[24px] border border-gray-200/90 bg-white/96 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold tracking-tight text-gray-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-white/94 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">What is included</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                Pricing that covers the workflows automotive shops actually care about.
              </h2>
              <p className="mt-4 text-lg leading-8 text-gray-600">
                Strata is positioned as modern software for automotive service businesses, so the price is tied to the full operational workflow, not a stripped-down calendar.
              </p>
            </div>
            <div className="grid gap-3">
              {included.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/55 px-4 py-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="text-sm leading-6 text-gray-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Feature pricing intent</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">See what the product handles.</h2>
            <div className="mt-5 flex flex-col gap-2">
              {featureSeoPages.map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">By shop type</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Match pricing to your business model.</h2>
            <div className="mt-5 flex flex-col gap-2">
              {categorySeoPages.slice(0, 5).map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Compare alternatives</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Evaluate pricing against the alternatives.</h2>
            <div className="mt-5 flex flex-col gap-2">
              {comparisonSeoPages.slice(0, 4).map((page) => (
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
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Pricing FAQ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Questions buyers ask before starting.
            </h2>
          </div>
          <div className="mt-10 grid gap-4">
            {faqs.map((item) => (
              <div key={item.question} className="rounded-2xl border border-orange-100 bg-orange-50/45 px-5 py-5">
                <h3 className="text-lg font-semibold tracking-tight text-gray-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[linear-gradient(135deg,#f97316_0%,#ea580c_100%)] px-6 py-10 text-center text-white shadow-[0_20px_70px_rgba(249,115,22,0.18)] sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-100">Start simple</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Get modern automotive shop software without the pricing clutter.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-orange-50">
            Start with a 30-day free trial, set up your shop type, and see whether Strata feels better in real daily use.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[54px] rounded-2xl bg-white px-8 text-base font-semibold text-orange-600 hover:bg-orange-50"
              )}
            >
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-h-[54px] rounded-2xl border-white/35 bg-transparent px-8 text-base font-semibold text-white hover:bg-white/10"
              )}
            >
              Back to homepage
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
