import {
  ArrowRight,
  BellRing,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { categorySeoPages, comparisonSeoPages, featureSeoPages } from "@/lib/seoPages";
import { cn } from "@/lib/utils";

const featuresTitle = "Strata CRM Features | Scheduling, CRM, Invoicing, and Shop Workflow Software";
const featuresDescription =
  "Explore Strata CRM features for automotive service businesses, including scheduling, calendar workflow, estimates, invoicing, customer management, vehicle management, appointment confirmations, and shop workflow organization.";

const featureSections = [
  {
    icon: Calendar,
    title: "Scheduling software for automotive shops",
    description:
      "Strata is designed around a cleaner month-to-day scheduling workflow so front-desk staff can see the month, drill into the day, and book work without calendar clutter.",
    bullets: ["Month-first calendar flow", "Day drill-down", "Appointments tied to client and vehicle records"],
    links: [
      { to: "/shop-scheduling-software", label: "Explore shop scheduling software" },
      { to: "/best-shop-scheduling-software-for-automotive-businesses", label: "Compare the best shop scheduling software" },
    ],
  },
  {
    icon: LayoutDashboard,
    title: "Calendar workflow organization",
    description:
      "The calendar is not isolated from the rest of the business. Appointments stay connected to CRM records, jobs, follow-up, and billing so the schedule actually supports operations.",
    bullets: ["Cleaner appointment context", "Appointment visibility", "Workflow continuity after scheduling"],
    links: [{ to: "/shop-scheduling-software", label: "See the calendar workflow" }],
  },
  {
    icon: CreditCard,
    title: "Invoicing and payment visibility",
    description:
      "Generate invoices, send them clearly, print them cleanly, and keep payment visibility tied to the actual client and vehicle history instead of scattered tools.",
    bullets: ["Invoice generation", "Print-friendly invoices", "Balance and payment visibility"],
    links: [{ to: "/pricing", label: "See Strata CRM pricing" }],
  },
  {
    icon: FileText,
    title: "Estimates and approvals",
    description:
      "Quotes and estimates stay tied to the scheduling and invoice flow so customers can approve work without the shop losing context or jumping between disconnected systems.",
    bullets: ["Estimate-to-invoice continuity", "Approval visibility", "Cleaner customer handoff"],
    links: [
      { to: "/wrap-ppf-shop-software", label: "See quote-heavy wrap and PPF workflow" },
      { to: "/window-tint-shop-software", label: "See tint quote and scheduling workflow" },
    ],
  },
  {
    icon: Users,
    title: "Customer management software",
    description:
      "Strata CRM keeps clients, history, notes, appointments, quotes, and invoices connected so the customer record becomes the place the shop actually works from.",
    bullets: ["Client history", "Notes and follow-up context", "CRM tied to operations"],
    links: [
      { to: "/detailing-crm", label: "Explore detailing CRM" },
      { to: "/best-crm-for-auto-detailing-shops", label: "Compare the best CRM for detailing shops" },
    ],
  },
  {
    icon: Car,
    title: "Vehicle management software",
    description:
      "Vehicles are first-class records in Strata. Appointments, estimates, jobs, invoices, and service history stay attached to the right car so repeat work gets easier over time.",
    bullets: ["Vehicle-first history", "Service memory", "Customer and vehicle tied together"],
    links: [
      { to: "/mechanic-shop-software", label: "See mechanic shop vehicle workflow" },
      { to: "/auto-detailing-software", label: "See detailing vehicle workflow" },
    ],
  },
  {
    icon: BellRing,
    title: "Appointment confirmations and reminders",
    description:
      "Appointment confirmations and follow-up can be configured so the shop can keep customers informed without losing clarity around the scheduled work.",
    bullets: ["Confirmation sending", "Follow-up workflow support", "Operational context stays attached"],
    links: [{ to: "/shop-scheduling-software", label: "See scheduling and confirmation flow" }],
  },
  {
    icon: Wrench,
    title: "Shop workflow organization",
    description:
      "Strata is built to organize the real workday: customer intake, vehicle context, appointments, jobs, approvals, invoices, follow-up, and the dashboard that ties it all together.",
    bullets: ["Daily command center", "Active work visibility", "One connected operating system"],
    links: [
      { to: "/orbisx-alternative", label: "See the workflow alternative page" },
      { to: "/strata-vs-orbisx", label: "Compare Strata vs OrbisX" },
    ],
  },
];

const featureFaqs = [
  {
    question: "What features does Strata CRM include for automotive shops?",
    answer:
      "Strata CRM includes scheduling, calendar workflow, client and vehicle records, quotes, invoices, payment visibility, appointment confirmations when configured, and daily shop workflow organization.",
  },
  {
    question: "Who is Strata CRM built for?",
    answer:
      "Strata CRM is built for automotive service businesses including detailing, tint, wrap, PPF, mechanic, performance, tire, mobile service, and mixed automotive shops.",
  },
  {
    question: "Why is Strata different from generic business software?",
    answer:
      "Strata keeps scheduling, CRM, vehicle history, quotes, invoices, and job workflow connected in one system instead of forcing shops to stitch together separate admin tools.",
  },
];

const featuresSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://stratacrm.app/features#webpage",
      name: featuresTitle,
      description: featuresDescription,
      url: "https://stratacrm.app/features",
      isPartOf: {
        "@id": "https://stratacrm.app/#website",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://stratacrm.app/features#software",
      name: "Strata CRM",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: featuresDescription,
      provider: {
        "@id": "https://stratacrm.app/#organization",
      },
      brand: {
        "@id": "https://stratacrm.app/#organization",
      },
      featureList: featureSections.map((section) => section.title),
      offers: {
        "@type": "Offer",
        price: "29",
        priceCurrency: "USD",
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
          name: "Features",
          item: "https://stratacrm.app/features",
        },
      ],
    },
    {
      "@type": "ItemList",
      itemListElement: featureSections.map((section, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: section.title,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: featureFaqs.map((item) => ({
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
  const socialImageUrl = "https://stratacrm.app/social-preview.png?v=20260416c";
  return [
    { title: featuresTitle },
    { name: "description", content: featuresDescription },
    { name: "robots", content: "index,follow" },
    { property: "og:site_name", content: "Strata CRM" },
    { property: "og:title", content: featuresTitle },
    { property: "og:description", content: featuresDescription },
    { property: "og:url", content: "https://stratacrm.app/features" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:secure_url", content: socialImageUrl },
    { property: "og:image:alt", content: "Strata CRM features preview for automotive service business software." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: "https://stratacrm.app/features" },
    { name: "twitter:title", content: featuresTitle },
    { name: "twitter:description", content: featuresDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM features preview for automotive service business software." },
  ];
}

export default function FeaturesHubPage() {
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_24%,#ffffff_100%)] text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(featuresSchema) }} />

      <section className="relative max-w-full overflow-x-hidden overflow-y-visible px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-18 lg:px-8 lg:pb-24 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 12% 12%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 34%), radial-gradient(circle at 86% 14%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl max-w-full gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/88 px-3.5 py-1.5 text-sm font-medium text-orange-700 shadow-sm">
              <Wrench className="h-4 w-4" />
              Strata CRM features
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                Features built for real automotive shop workflow, not generic admin software.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
                Explore the Strata CRM feature set around scheduling, calendar, estimates, invoicing, customer management, vehicle management, appointment confirmations, and shop workflow organization.
              </p>
              <p className="max-w-3xl text-base leading-7 text-gray-600">
                This hub is designed for buyers actively searching for software. It organizes the product around the features that drive daily operations in detailing, tint, wrap, mechanic, tire, performance, and mixed automotive businesses.
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
                to="/pricing"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[54px] rounded-2xl border-gray-300 bg-white/85 px-7 text-base font-semibold text-gray-900 hover:bg-white"
                )}
              >
                View pricing
              </Link>
            </div>
            <p className="text-sm text-gray-500">30-day free trial • No card required • Founder pricing $29/mo (public $95/mo)</p>
          </div>

          <div className="rounded-[28px] border border-orange-200/80 bg-white/95 p-5 shadow-[0_20px_70px_rgba(249,115,22,0.12)] sm:p-6">
            <div className="rounded-3xl bg-gray-950 p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">Feature clusters</p>
              <div className="mt-5 space-y-3">
                {["Scheduling and calendar", "CRM and vehicle history", "Quotes, invoices, and confirmations", "Daily workflow organization"].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    <p className="text-sm text-white/88">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Explore next</p>
              <div className="mt-4 flex flex-col gap-2">
                <Link to="/shop-scheduling-software" className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  Shop scheduling software
                </Link>
                <Link to="/detailing-crm" className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  Detailing CRM
                </Link>
                <Link to="/pricing" className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  Strata CRM pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Feature hub</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              High-intent software features organized around the way shops actually work.
            </h2>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {featureSections.map((section) => {
              const Icon = section.icon;
              return (
                <Card
                  key={section.title}
                  className="rounded-[26px] border border-gray-200/90 bg-white/96 shadow-[0_10px_40px_rgba(15,23,42,0.05)]"
                >
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-gray-950">{section.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-gray-600">{section.description}</p>
                    <div className="mt-5 space-y-2.5">
                      {section.bullets.map((bullet) => (
                        <div key={bullet} className="flex items-start gap-2.5 rounded-2xl border border-orange-100/80 bg-orange-50/55 px-3.5 py-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                          <p className="text-sm leading-6 text-gray-700">{bullet}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                      {section.links.map((link) => (
                        <Link key={link.to} to={link.to} className="inline-flex items-center gap-2 text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                          {link.label}
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Feature pages</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Go deeper into the core operating features.</h2>
            <div className="mt-5 flex flex-col gap-2">
              {featureSeoPages.map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
              <Link to="/pricing" className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                Strata CRM pricing
              </Link>
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">By business type</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">See how the features map to your kind of shop.</h2>
            <div className="mt-5 flex flex-col gap-2">
              {categorySeoPages.slice(0, 6).map((page) => (
                <Link key={page.key} to={page.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {page.navLabel}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Comparison paths</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Help buyers compare the workflow against alternatives.</h2>
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

      <section className="max-w-full overflow-x-hidden px-5 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_100%)] p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Quick answers</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Clear answers for buyers comparing automotive shop software.
            </h2>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {featureFaqs.map((item) => (
              <div key={item.question} className="rounded-2xl border border-orange-100 bg-white/90 px-5 py-5">
                <h3 className="text-lg font-semibold tracking-tight text-gray-950">{item.question}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[linear-gradient(135deg,#f97316_0%,#ea580c_100%)] px-6 py-10 text-center text-white shadow-[0_20px_70px_rgba(249,115,22,0.18)] sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-100">Start simple</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Explore the features, then see how fast Strata feels in a real workspace.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-orange-50">
            The goal is not a giant feature checklist. It is a clearer system for scheduling, CRM, billing, and daily shop workflow.
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
              to="/pricing"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-h-[54px] rounded-2xl border-white/35 bg-transparent px-8 text-base font-semibold text-white hover:bg-white/10"
              )}
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
