import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Calendar,
  FileText,
  Users,
  Layers,
  CreditCard,
  ArrowRight,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useEffect } from "react";

/** Capabilities — universal auto shop; flexible services (see PRODUCT.md). */
const features = [
  {
    icon: Zap,
    title: "Built for speed",
    description:
      "Quote and schedule in seconds—not minutes. Fewer taps, less admin, more time on the floor.",
  },
  {
    icon: FileText,
    title: "Quotes & jobs",
    description:
      "Turn estimates into scheduled work with a clear path from quote to invoice to paid.",
  },
  {
    icon: Calendar,
    title: "Scheduling",
    description:
      "Calendar and appointments that match how real shops run—mobile-friendly for owners on the move.",
  },
  {
    icon: Users,
    title: "Clients & vehicles",
    description:
      "Keep customers and vehicles in one place—history and notes without spreadsheet chaos.",
  },
  {
    icon: CreditCard,
    title: "Invoices & payments",
    description:
      "Professional invoices and payment flows that match a serious shop—not toy software.",
  },
  {
    icon: Layers,
    title: "Flexible services",
    description:
      "You define services and pricing—detail, tint, tires, mechanical, mobile routes, or mixed. No niche lock-in.",
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
    <div className="bg-white text-gray-900 min-h-screen">
      <section
        id="product"
        className="relative overflow-hidden bg-gradient-to-b from-orange-50 to-white py-20 sm:py-24 px-4 sm:px-6"
      >
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

        <div className="relative z-10 mx-auto max-w-4xl text-center flex flex-col items-center gap-6 sm:gap-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-300 bg-orange-100 text-orange-700 text-sm font-medium">
            <Zap className="w-4 h-4" />
            CRM for any auto service shop
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight text-gray-900 px-2">
            Run the shop from your phone.
            <br />
            <span className="text-orange-500">Less clutter. Less admin.</span>
          </h1>

          <p className="text-base sm:text-lg text-gray-600 max-w-2xl leading-relaxed px-2">
            Strata is for owner-operated shops—detail, tint, PPF, tires, light mechanical, mobile
            routes, or mixed. Simple pricing, no upsell traps, and UX that stays out of your way.
          </p>

          <div className="rounded-xl border border-orange-200 bg-white/80 px-6 py-3 text-center">
            <p className="text-gray-700 font-semibold">
              <span className="text-2xl text-orange-600">$29</span>
              <span className="text-gray-500 font-normal">/month</span>
              <span className="ml-2 text-green-600 font-medium">· First month free</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Straightforward pricing—no surprise tiers.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-2 w-full max-w-md sm:max-w-none justify-center">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[48px] bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-base font-semibold shadow-md shadow-orange-200",
                "[&_svg]:pointer-events-auto"
              )}
            >
              Get started free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <Link
              to="/sign-in"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-h-[48px] border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3 text-base font-semibold"
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Clean UX. No broken states.
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
              Fewer screens, obvious actions, and flows that work on a phone—so you are not fighting
              the tool between bays and customers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="bg-white border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all duration-300 group"
              >
                <CardContent className="p-5 sm:p-6 flex flex-col gap-3 sm:gap-4">
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

      <section id="industries" className="py-12 sm:py-14 px-4 sm:px-6 bg-orange-50 border-y border-orange-100">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-gray-700 text-base sm:text-lg font-medium leading-relaxed">
            One product for many shop types—use the same flexible service catalog whether you are
            focused on appearance, tires, light repair, or a mix.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-500">
            {[
              "Detail & coating",
              "Tint & PPF",
              "Tire shops",
              "Mobile service",
              "Light mechanical",
              "Mixed operations",
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

      <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-8 sm:p-16 flex flex-col items-center text-center gap-5 sm:gap-6 shadow-xl shadow-orange-200">
            <h2 className="text-2xl sm:text-4xl font-bold text-white">Ready to move faster?</h2>
            <p className="text-orange-100 text-base sm:text-lg max-w-md">
              Simple monthly pricing—no upsell maze. Try it free for the first month.
            </p>
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[48px] bg-white text-orange-600 hover:bg-orange-50 px-10 py-3 text-base font-semibold shadow-md mt-2",
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
