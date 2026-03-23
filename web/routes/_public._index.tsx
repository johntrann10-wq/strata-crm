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

/** Focused capabilities — fewer modules, each aligned with premium detailing workflows (see PRODUCT.md). */
const features = [
  {
    icon: FileText,
    title: "Quote → deposit → booking",
    description:
      "Move leads from estimate to paid deposit to scheduled job without friction—built for high-ticket, reputation-sensitive sales.",
  },
  {
    icon: Calendar,
    title: "Scheduling that fits the bay",
    description:
      "Appointment-based calendar that matches how real detail, tint, and PPF shops run—not generic block booking.",
  },
  {
    icon: Users,
    title: "Client & vehicle CRM",
    description:
      "Full history, vehicles, and service notes—so every touchpoint feels premium, not transactional.",
  },
  {
    icon: CreditCard,
    title: "Invoices & payments",
    description:
      "Get paid fast with flows that look as professional as the work you deliver.",
  },
  {
    icon: Layers,
    title: "Services & packages",
    description:
      "Coatings, correction, tint, PPF, add-ons—priced, repeatable, and easy to quote.",
  },
];

export default function LandingPage() {
  const location = useLocation();

  // React Router updates the URL for /#section but does not always scroll; fix in-page anchors.
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
            CRM for premium detailing, tint &amp; PPF
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-tight text-gray-900">
            Close faster.
            <br />
            <span className="text-orange-500">Admin less.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl leading-relaxed">
            Strata is built for owner-operated detail shops—ceramic coating, paint correction, tint, and PPF.
            Mobile-first, fast, and designed for high-ticket work—not generic “shop management” bloat.
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
              Fewer modules. Each one excellent.
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Speed, premium UX, and a frictionless quote-to-deposit-to-booking flow—so you spend
              less time in software and more time closing premium work.
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
            Built for premium detail studios, ceramic coating, paint correction, tint, PPF, and
            wrap shops that care how every client touchpoint feels.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-gray-500">
            {[
              "Premium Detail",
              "Ceramic Coating",
              "Paint Correction",
              "Window Tint",
              "PPF",
              "Wrap Studios",
              "Mobile Detailing",
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
              Ready for a tighter, more premium operation?
            </h2>
            <p className="text-orange-100 text-lg max-w-md">
              Less admin, cleaner workflows, and a client experience that matches a high-ticket
              brand.
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