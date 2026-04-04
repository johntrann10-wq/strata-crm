import type { ReactNode } from "react";
import { Link } from "react-router";

type LegalSection = {
  title: string;
  body?: string;
  bullets?: string[];
};

export function LegalPageLayout({
  eyebrow,
  title,
  description,
  effectiveDate,
  updatedDate,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  updatedDate?: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8f2_0%,#fffdfb_20%,#ffffff_100%)] text-slate-950">
      <section className="border-b border-slate-200/80 px-5 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/"
            className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800"
          >
            Back to Strata CRM
          </Link>
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-8 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
            <div className="mt-6 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:gap-6">
              <span>Effective: {effectiveDate}</span>
              {updatedDate ? <span>Last updated: {updatedDate}</span> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.3)] sm:p-10">
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.title} className="space-y-3 border-b border-slate-200/80 pb-8 last:border-b-0 last:pb-0">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{section.title}</h2>
                {section.body ? <p className="text-sm leading-7 text-slate-600 sm:text-[15px]">{section.body}</p> : null}
                {section.bullets?.length ? (
                  <ul className="space-y-2 text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
