import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
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
import { cn } from "@/lib/utils";

const featureCards = [
  {
    icon: Calendar,
    title: "Schedule from a clear monthly view",
    description:
      "Start from the month, click into a day, and book work fast without getting lost in a complicated calendar.",
  },
  {
    icon: Users,
    title: "Keep clients and vehicles connected",
    description:
      "Customer notes, vehicle history, quotes, appointments, jobs, and invoices stay tied together so staff always have context.",
  },
  {
    icon: FileText,
    title: "Move from estimate to paid invoice",
    description:
      "Create the quote, book the work, run the job, send the invoice, and collect payment from one system.",
  },
  {
    icon: Wrench,
    title: "Run real shop operations",
    description:
      "Track scheduling, job progress, technician handoff, and billing without stitching together generic CRM tools.",
  },
  {
    icon: CreditCard,
    title: "Make billing easier to understand",
    description:
      "Cleaner invoice workflows, clearer balance visibility, and a proper print view that feels client-ready.",
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
  "Client, vehicle, quote, appointment, job, invoice, and payment history in one place",
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
    description: "Use the calendar and schedule board to place work quickly with the right service and vehicle context.",
  },
  {
    step: "03",
    title: "Run the job and get paid",
    description: "Move from appointment to job to invoice with fewer dead ends and less admin drag.",
  },
];

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
      <section id="product" className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-18 lg:px-8 lg:pb-24 lg:pt-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 12% 12%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 34%), radial-gradient(circle at 86% 14%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)] lg:items-start">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/88 px-3.5 py-1.5 text-sm font-medium text-orange-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              Strata CRM for automotive service businesses
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                The shop operating system that feels clear from the first day.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
                Strata helps service shops book work, manage clients and vehicles, run jobs, and get paid without the clutter,
                guesswork, and broken flow of old shop software.
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
                Start free
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

          <div className="rounded-[28px] border border-orange-200/80 bg-white/95 p-5 shadow-[0_20px_70px_rgba(249,115,22,0.12)] sm:p-6">
            <div className="rounded-3xl bg-gray-950 p-5 text-white sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Why shops switch</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Less admin drag</h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-orange-300">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  "Clear month-to-day scheduling",
                  "Client and vehicle history that stays connected",
                  "Quote to invoice flow built for real shop work",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-orange-300" />
                    <span className="text-sm text-white/88">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Simple pricing</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-extrabold tracking-tight text-gray-950">$29</span>
                <span className="pb-1 text-base text-gray-600">per month</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600">First month free. No confusing feature tiers just to unlock core workflows.</p>
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "mt-6 w-full min-h-[52px] rounded-2xl bg-gray-950 text-white hover:bg-gray-800"
                )}
              >
                Create your workspace
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-white/92 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">How it works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                Simpler day-to-day shop operations.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
                Strata is designed so a first-time user can understand the next step quickly, while still giving an experienced shop owner the depth they need.
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

      <section id="features" className="px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Product highlights</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Powerful enough for real operations. Clear enough to use under pressure.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              The goal is not more screens. It is faster scheduling, easier intake, better job handoff, and cleaner billing.
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

      <section id="pricing" className="px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[linear-gradient(135deg,#f97316_0%,#ea580c_100%)] px-6 py-10 text-center text-white shadow-[0_20px_70px_rgba(249,115,22,0.18)] sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-100">Start simple</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Replace admin chaos with a clearer operating flow.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-orange-50">
            Strata helps your team book faster, stay organized, and keep work moving without the clutter of heavier legacy systems.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[54px] rounded-2xl bg-white px-8 text-base font-semibold text-orange-600 hover:bg-orange-50"
              )}
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
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
