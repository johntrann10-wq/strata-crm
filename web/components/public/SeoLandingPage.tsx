import { ArrowRight, CheckCircle2, ChevronRight, Layers, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { comparisonSeoPages, featureSeoPages, type SeoPageConfig } from "@/lib/seoPages";

type SeoLandingPageProps = {
  page: SeoPageConfig;
  relatedPages: SeoPageConfig[];
};

export function buildSeoMeta(page: SeoPageConfig) {
  const url = `https://stratacrm.app${page.path}`;
  const socialImageUrl = "https://stratacrm.app/social-preview.png?v=20260404a";
  return [
    { title: page.seoTitle },
    { name: "description", content: page.seoDescription },
    { name: "robots", content: "index,follow" },
    { property: "og:site_name", content: "Strata CRM" },
    { property: "og:title", content: page.seoTitle },
    { property: "og:description", content: page.seoDescription },
    { property: "og:url", content: url },
    { property: "og:type", content: "article" },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:secure_url", content: socialImageUrl },
    { property: "og:image:alt", content: "Strata CRM marketing preview for automotive service business software." },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:url", content: url },
    { name: "twitter:title", content: page.seoTitle },
    { name: "twitter:description", content: page.seoDescription },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:image:alt", content: "Strata CRM marketing preview for automotive service business software." },
  ];
}

export function SeoLandingPage({ page, relatedPages }: SeoLandingPageProps) {
  const adjacentFeaturePages = featureSeoPages.filter((entry) => entry.path !== page.path);
  const adjacentComparisonPages = comparisonSeoPages.filter((entry) => entry.path !== page.path).slice(0, 3);
  const answerFaqs = [
    {
      question: `What is ${page.navLabel.toLowerCase()} in Strata CRM?`,
      answer: `${page.navLabel} in Strata CRM is software for ${page.audience.toLowerCase()} that keeps scheduling, customer records, vehicle history, quotes, invoices, and daily workflow in one system.`,
    },
    {
      question: `Who is ${page.navLabel.toLowerCase()} best for?`,
      answer: page.audience,
    },
    {
      question: `What problem does ${page.navLabel.toLowerCase()} solve?`,
      answer: page.pains[0],
    },
  ];
  const pageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `https://stratacrm.app${page.path}#webpage`,
        name: page.seoTitle,
        description: page.seoDescription,
        url: `https://stratacrm.app${page.path}`,
        isPartOf: {
          "@id": "https://stratacrm.app/#website",
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `https://stratacrm.app${page.path}#software`,
        name: "Strata CRM",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: page.seoDescription,
        provider: {
          "@id": "https://stratacrm.app/#organization",
        },
        brand: {
          "@id": "https://stratacrm.app/#organization",
        },
        audience: {
          "@type": "Audience",
          audienceType: page.audience,
        },
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
            name: page.navLabel,
            item: `https://stratacrm.app${page.path}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: answerFaqs.map((item) => ({
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

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_24%,#ffffff_100%)] text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <section className="relative max-w-full overflow-x-hidden overflow-y-visible px-5 pb-14 pt-14 sm:px-6 sm:pb-18 lg:px-8 lg:pb-24 lg:pt-20">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-90"
          style={{
            background:
              "radial-gradient(circle at 12% 12%, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 34%), radial-gradient(circle at 86% 18%, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 max-w-full lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/88 px-3.5 py-1.5 text-sm font-medium text-orange-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              {page.eyebrow}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                {page.h1}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">{page.intro}</p>
              <p className="max-w-3xl text-sm leading-7 text-gray-500 sm:text-base">{page.audience}</p>
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
          </div>

          <div className="rounded-[28px] border border-orange-200/80 bg-white/95 p-5 shadow-[0_20px_70px_rgba(249,115,22,0.12)] sm:p-6">
            <div className="rounded-3xl bg-gray-950 p-5 text-white sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">What Strata helps with</p>
              <div className="mt-5 space-y-3">
                {page.benefits.map((benefit) => (
                  <div key={benefit.title} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5">
                    <p className="text-sm font-semibold text-white">{benefit.title}</p>
                    <p className="mt-1 text-sm leading-6 text-white/72">{benefit.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Best fit</p>
              <div className="mt-4 space-y-2.5">
                {page.fitPoints.map((point) => (
                  <div key={point} className="flex items-start gap-2.5 rounded-2xl border border-orange-100/80 bg-white/85 px-3.5 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <p className="text-sm leading-6 text-gray-700">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-[28px] border border-orange-100 bg-gray-950 px-5 py-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-300">Search intent match</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">Why shops search for this category</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {page.pains.map((pain) => (
              <div key={pain} className="rounded-2xl border border-orange-100 bg-white/92 px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                <p className="text-sm leading-6 text-gray-700">{pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[28px] border border-orange-100 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_100%)] p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Quick answers</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {answerFaqs.map((item) => (
                <div key={item.question} className="rounded-2xl border border-orange-100 bg-white/90 px-5 py-5">
                  <h2 className="text-lg font-semibold tracking-tight text-gray-950">{item.question}</h2>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">How the workflow improves</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Software that helps the shop move from intake to payment with less friction.
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              This page is designed for buyers actively evaluating software, so the focus stays on day-to-day workflow fit, not generic feature fluff.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {page.workflowSteps.map((step, index) => (
              <Card key={step.title} className="rounded-[24px] border border-gray-200/90 bg-white/96 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-sm font-semibold text-orange-600 shadow-sm">
                    {index + 1}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-orange-100 bg-white/94 p-6 shadow-[0_12px_50px_rgba(15,23,42,0.05)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Why it converts better</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                Clearer operations make the product easier to trust.
              </h2>
              <p className="mt-4 text-lg leading-8 text-gray-600">
                Strata is positioning around a simpler, more premium operating flow for automotive service businesses that still need real depth.
              </p>
            </div>
            <div className="grid gap-4">
              {page.benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-2xl border border-orange-100 bg-orange-50/55 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-950">{benefit.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{benefit.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Related pages</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">Explore related search intents</h2>
            </div>
            <Link to="/" className="hidden text-sm font-medium text-orange-700 transition-colors hover:text-orange-800 sm:inline-flex sm:items-center sm:gap-2">
              Back to main landing page
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {relatedPages.map((relatedPage) => (
              <Link
                key={relatedPage.key}
                to={relatedPage.path}
                className="rounded-[24px] border border-orange-100 bg-white/94 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_50px_rgba(249,115,22,0.10)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">{relatedPage.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-gray-950">{relatedPage.navLabel}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{relatedPage.seoDescription}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-orange-700">
                  Explore page
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Explore adjacent workflows</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Compare the feature pages that shape daily operations.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Buyers researching {page.navLabel.toLowerCase()} often also compare automotive shop scheduling software, CRM depth, and pricing fit before starting a trial.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {adjacentFeaturePages.map((featurePage) => (
                <Link
                  key={featurePage.key}
                  to={featurePage.path}
                  className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
                >
                  {featurePage.navLabel}
                </Link>
              ))}
              <Link
                to="/pricing"
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
              >
                Strata CRM pricing
              </Link>
            </div>
          </div>

          <div className="rounded-[26px] border border-orange-100 bg-white/94 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Compare alternatives</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-950">Move naturally from category pages to comparison pages.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Once a buyer understands the workflow fit, the next step is usually to compare Strata against outdated alternatives and other software categories.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {adjacentComparisonPages.map((comparisonPage) => (
                <Link key={comparisonPage.key} to={comparisonPage.path} className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
                  {comparisonPage.navLabel}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-full overflow-x-hidden px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[linear-gradient(135deg,#f97316_0%,#ea580c_100%)] px-6 py-10 text-center text-white shadow-[0_20px_70px_rgba(249,115,22,0.18)] sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-100">Start simple</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{page.ctaTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-orange-50">{page.ctaBody}</p>
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
