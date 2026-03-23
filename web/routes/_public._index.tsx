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
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useEffect } from "react";

/** Product pillars — speed, clarity, any shop (see PRODUCT.md). */
const features = [
  {
    icon: FileText,
    title: "Quote → job → paid",
    description:
      "Move from estimate to scheduled work and invoice without friction—built for shops that live on appointments, not spreadsheets.",
  },
  {
    icon: Calendar,
    title: "Scheduling that fits the bay",
    description:
      "Calendar and jobs that match how real shops run—fast on mobile when you are on the floor.",
  },
  {
    icon: Users,
    title: "Clients & vehicles",
    description:
      "History, vehicles, and notes in one place—so every touchpoint feels intentional, not chaotic.",
  },
  {
    icon: CreditCard,
    title: "Invoices & payments",
    description:
      "Professional money flows that match a serious shop—simple pricing on our side, no upsell maze.",
  },
  {
    icon: Layers,
    title: "Flexible services",
    description:
      "You define what you sell—detail, tint, tires, mechanical, mobile, or mixed. No niche lock-in.",
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
        className="relative overflow-hidden bg-gradient-to-b from-orange-50 to-white py-24 px-6"
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

        <div className="relative z-10 mx-auto max-w-4xl text-center flex flex-col items-center gap-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-300 bg-orange-100 text-orange-700 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            CRM built for speed—works for any auto service shop
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] text-gray-900">
            Close faster.
            <br />
            <span className="text-orange-500">Admin less.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl leading-relaxed">
            Strata is for owner-operated shops that refuse slow software—detail, tint, PPF, tires,
            mechanical, or mobile. Mobile-first, honest pricing, UX that stays out of your way.
          </p>

          <div className="rounded-xl border border-orange-200 bg-white/90 backdrop-blur-sm px-6 py-4 text-center shadow-sm">
            <p className="text-gray-800 font-semibold">
              <span className="text-3xl text-orange-600">$29</span>
              <span className="text-gray-500 font-normal">/month</span>
              <span className="ml-2 text-green-600 font-medium">— First month free</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">One simple price. No surprise tiers.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[52px] bg-orange-500 hover:bg-orange-600 text-white px-10 py-3.5 text-base font-semibold shadow-lg shadow-orange-200/80",
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
                "min-h-[52px] border-gray-300 text-gray-800 hover:bg-gray-50 px-10 py-3.5 text-base font-semibold"
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Fewer screens. Each one excellent.
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Speed, clarity, and flows that work on a phone—so you are selling and scheduling, not
              fighting the tool.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <Card
                key={title}
                className="bg-white border border-gray-200 hover:border-orange-400 hover:shadow-lg transition-all duration-300 group"
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

      <section id="industries" className="py-16 px-6 bg-orange-50 border-y border-orange-100">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-gray-800 text-lg font-medium leading-relaxed">
            Built for shops that care how every client touchpoint feels—whether you are appearance,
            tires, light repair, or a mix.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-gray-600">
            {[
              "Premium detail",
              "Ceramic coating",
              "Tint & PPF",
              "Tire shops",
              "Mobile service",
              "Light mechanical",
              "Mixed ops",
            ].map((type) => (
              <span
                key={type}
                className="px-3 py-1.5 rounded-full bg-white border border-orange-200 font-medium shadow-sm"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-10 sm:p-16 flex flex-col items-center text-center gap-6 shadow-xl shadow-orange-200/80">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Ready for a tighter, faster operation?
            </h2>
            <p className="text-orange-100 text-lg max-w-md">
              Less admin, cleaner workflows, and pricing that does not punish you for growing.
            </p>
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-[52px] bg-white text-orange-600 hover:bg-orange-50 px-10 py-3.5 text-base font-semibold shadow-md mt-2",
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
