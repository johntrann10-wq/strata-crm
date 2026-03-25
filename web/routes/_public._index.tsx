import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: FileText,
    title: "Quote to job to paid",
    description:
      "Build the estimate, book the work, run the job, and collect payment without bouncing between disconnected tools.",
  },
  {
    icon: Calendar,
    title: "Scheduling that feels obvious",
    description:
      "Start from the month, click into a day, and book work quickly with the right client, vehicle, and service context.",
  },
  {
    icon: Users,
    title: "Customer and vehicle history",
    description:
      "See notes, invoices, quotes, jobs, and vehicle details in one place so staff do not have to guess.",
  },
  {
    icon: CreditCard,
    title: "Invoices and collection",
    description:
      "Clear money workflows, cleaner invoice presentation, and fewer dead ends when it is time to get paid.",
  },
  {
    icon: Layers,
    title: "Built for mixed shop operations",
    description:
      "Detail, tint, wrap, PPF, tires, mechanical, or a hybrid shop setup without forcing separate apps.",
  },
];

const proofPoints = [
  "Built for detailing, tint, wrap, PPF, tire, and mechanical shops",
  "Simple month-to-day scheduling flow for busy front-desk teams",
  "Client, vehicle, job, invoice, and payment history in one place",
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
    <div className="min-h-screen bg-white text-gray-900">
      <section
        id="product"
        className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-white to-white px-6 py-20 sm:py-24"
      >
        <div
          className="pointer-events-none absolute -top-28 -right-24 h-80 w-80 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(249,115,22,0.65) 0%, rgba(249,115,22,0) 72%)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 -left-16 h-64 w-64 rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, rgba(234,88,12,0.7) 0%, rgba(234,88,12,0) 72%)",
          }}
        />

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-4 py-1.5 text-sm font-medium text-orange-700">
              <Sparkles className="h-4 w-4" />
              Strata CRM for modern automotive service shops
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 sm:text-6xl">
                Run the shop without fighting the software.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl">
                Strata is the shop operating system for businesses that need cleaner scheduling, faster intake,
                tighter job flow, and easier billing without the clutter of old-school software.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {proofPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-orange-200 bg-white/90 px-4 py-3 text-sm text-gray-700 shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                to="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-[52px] bg-orange-500 px-8 text-base font-semibold text-white shadow-lg shadow-orange-200/80 hover:bg-orange-600"
                )}
              >
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-[52px] border-gray-300 px-8 text-base font-semibold text-gray-800 hover:bg-gray-50"
                )}
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="w-full max-w-md rounded-3xl border border-orange-200 bg-white/95 p-8 shadow-xl shadow-orange-100/80">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">Simple pricing</p>
            <div className="mt-4">
              <p className="text-5xl font-extrabold tracking-tight text-gray-950">$29</p>
              <p className="mt-1 text-lg text-gray-600">per month, with the first month free</p>
            </div>
            <div className="mt-6 space-y-3 text-sm text-gray-600">
              <p>No hidden tiers.</p>
              <p>No extra charge just to unlock basic workflows.</p>
              <p>Built for early shops that want speed and clarity now.</p>
            </div>
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-8 w-full min-h-[52px] bg-gray-950 text-white hover:bg-gray-800"
              )}
            >
              Create workspace
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Fewer screens. Better flow. Less second-guessing.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Strata keeps the power of a real shop system while making the next step obvious for the person using it.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
              >
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100">
                    <Icon className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-950">{title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600">{description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="border-y border-orange-100 bg-orange-50 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-lg font-medium leading-relaxed text-gray-800">
            Built for shops that care how every customer touchpoint feels, whether you sell appearance work, tires,
            repair, or a mix.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-gray-600">
            {[
              "Auto detailing",
              "Ceramic coating",
              "Tint and PPF",
              "Tire shops",
              "Mobile service",
              "Mechanical service",
              "Mixed operations",
            ].map((type) => (
              <span
                key={type}
                className="rounded-full border border-orange-200 bg-white px-3 py-1.5 font-medium shadow-sm"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-8 py-12 text-center shadow-xl shadow-orange-200/80 sm:px-12 sm:py-16">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready for a tighter, faster operation?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-orange-100">
            Book work faster, reduce admin drag, and give your team a tool that feels clear from the first day.
          </p>
          <Link
            to="/sign-up"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-8 min-h-[52px] bg-white px-10 text-base font-semibold text-orange-600 hover:bg-orange-50"
            )}
          >
            Start free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
