import { Link, useParams } from "react-router";
import { SeoLandingPage, buildSeoMeta } from "@/components/public/SeoLandingPage";
import { seoPageList } from "@/lib/seoPages";

function getPageBySlug(slug?: string) {
  return seoPageList.find((entry) => entry.path.slice(1) === slug);
}

export function meta({ params }: { params: { slug?: string } }) {
  const page = getPageBySlug(params.slug);
  return page ? buildSeoMeta(page) : [{ title: "Strata CRM" }];
}

export default function PublicSeoPage() {
  const { slug } = useParams();
  const page = getPageBySlug(slug);

  if (!page) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-950">Page not found</h1>
        <p className="mt-4 text-base leading-7 text-gray-600">
          The page you were looking for does not exist. Head back to the main site and explore the Strata pages from there.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex min-h-[48px] items-center rounded-2xl bg-orange-500 px-6 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Back to Strata
        </Link>
      </div>
    );
  }

  const relatedPages = seoPageList.filter((entry) => page.related.includes(entry.key));
  return <SeoLandingPage page={page} relatedPages={relatedPages} />;
}
