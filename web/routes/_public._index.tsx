import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Calendar,
  FileText,
  Users,
  Package,
  Wrench,
  BarChart2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";

const features = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description:
      "Book appointments, assign staff, and track your full day with a real-time calendar.",
  },
  {
    icon: FileText,
    title: "Invoicing & Payments",
    description:
      "Create invoices, record payments, and track outstanding balances in seconds.",
  },
  {
    icon: Users,
    title: "Client & Vehicle CRM",
    description:
      "Store full client history, vehicle details, and service records all in one place.",
  },
  {
    icon: Package,
    title: "Inventory Tracking",
    description:
      "Know exactly what's in stock and get alerts before you run out.",
  },
  {
    icon: Wrench,
    title: "Service Catalog",
    description:
      "Build your menu of services with pricing, duration, and category.",
  },
  {
    icon: BarChart2,
    title: "Business Dashboard",
    description:
      "See today's schedule, revenue, and activity at a glance.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-gray-900 min-h-screen">
      {/* ── Hero ── */}
      <section
        id="product"
        className="relative overflow-hidden bg-gradient-to-b from-orange-50 to-white py-24 px-6"
      >
        {/* Subtle decorative blobs */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(249,115,22,0.6) 0%, rgba(249,115,22,0) 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 -left-24 w-72 h-72 rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, rgba(234,88,12,0.7) 0%, rgba(234,88,12,0) 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl text-center flex flex-col items-center gap-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-300 bg-orange-100 text-orange-700 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Built for automotive professionals
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-tight text-gray-900">
            Run your shop.
            <br />
            <span className="text-orange-500">Not your spreadsheets.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl leading-relaxed">
            Strata is the all-in-one shop management platform built for auto detailers, tinters,
            wrappers, and mechanics.
          </p>

          {/* Pricing highlight */}
          <div className="rounded-xl border border-orange-200 bg-white/80 px-6 py-3 text-center">
            <p className="text-gray-700 font-semibold">
              <span className="text-2xl text-orange-600">$29</span>
              <span className="text-gray-500 font-normal">/month</span>
              <span className="ml-2 text-green-600 font-medium">— First month free</span>
            </p>
          </div>

          {/* CTAs — Link + buttonVariants (Button import removed; avoids undefined Button at runtime) */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-base font-semibold shadow-md shadow-orange-200",
                "[&_svg]:pointer-events-auto"
              )}
            >
              Get Started Free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <Link
              to="/sign-in"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3 text-base font-semibold"
              )}
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything your shop needs
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Powerful tools designed around how automotive shops actually work — not generic
              business software.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="bg-white border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all duration-300 group"
              >
                <CardContent className="p-6 flex flex-col gap-4">
                  <div className="w-11 h-11 rounded-lg bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                    <Icon className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="text-gray-900 font-semibold text-lg">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof Strip ── */}
      <section id="industries" className="py-14 px-6 bg-orange-50 border-y border-orange-100">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-gray-700 text-lg font-medium leading-relaxed">
            Trusted by auto shops, detailers, tinters, wrap studios, and mechanics across the
            country.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-gray-500">
            {[
              "Auto Detailers",
              "Window Tinters",
              "Wrap Studios",
              "PPF Installers",
              "Tire Shops",
              "Mechanics",
              "Body Shops",
              "Mobile Services",
            ].map((type) => (
              <span
                key={type}
                className="px-3 py-1.5 rounded-full bg-white border border-orange-200 text-gray-600 font-medium"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA / Pricing ── */}
      <section id="pricing" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-10 sm:p-16 flex flex-col items-center text-center gap-6 shadow-xl shadow-orange-200">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Ready to grow your shop?
            </h2>
            <p className="text-orange-100 text-lg max-w-md">
              Join automotive professionals already using Strata to save time and increase revenue.
            </p>
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-white text-orange-600 hover:bg-orange-50 px-10 py-3 text-base font-semibold shadow-md mt-2",
                "[&_svg]:pointer-events-auto"
              )}
            >
              Start for free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}