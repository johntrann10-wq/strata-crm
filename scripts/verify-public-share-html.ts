import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPublicShareMetadata, resolvePublicShareMetadata, type PublicShareMetadataPayload } from "../web/lib/publicShareMeta";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const indexHtmlPath = path.join(rootDir, "build", "client", "index.html");

function assertIncludes(haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected rendered HTML to include: ${needle}`);
  }
}

async function main() {
  const indexHtml = await readFile(indexHtmlPath, "utf8");

  const bookingPayload: PublicShareMetadataPayload = {
    businessId: "biz-share",
    businessName: "Coastline Detail Co.",
    title: "Book online in minutes | Coastline Detail Co.",
    description: "Choose a service, share your vehicle, and request the right time without the back-and-forth.",
    canonicalPath: "/book/biz-share",
    imagePath: "/api/businesses/biz-share/public-brand-image",
    imageAlt: "Coastline Detail Co. logo for online booking",
  };

  const bookingHtml = injectPublicShareMetadata(
    indexHtml,
    resolvePublicShareMetadata(bookingPayload, "https://stratacrm.app", "?service=svc-1&utm_source=test")
  );

  assertIncludes(bookingHtml, '<link rel="canonical" href="https://stratacrm.app/book/biz-share?service=svc-1"/>');
  assertIncludes(bookingHtml, '<meta property="og:url" content="https://stratacrm.app/book/biz-share?service=svc-1"/>');
  assertIncludes(bookingHtml, '<meta property="og:image" content="https://stratacrm.app/api/businesses/biz-share/public-brand-image"/>');
  assertIncludes(bookingHtml, '<meta property="og:title" content="Book online in minutes | Coastline Detail Co."/>');

  const leadPayload: PublicShareMetadataPayload = {
    businessId: "biz-lead",
    businessName: "Northline Auto Spa",
    title: "Request service | Northline Auto Spa",
    description: "Share a few details so Northline Auto Spa can review the request and follow up with the right next step.",
    canonicalPath: "/lead/biz-lead",
    imagePath: null,
    imageAlt: "Northline Auto Spa logo for service requests",
  };

  const leadHtml = injectPublicShareMetadata(
    indexHtml,
    resolvePublicShareMetadata(leadPayload, "https://stratacrm.app", "?utm_campaign=spring")
  );

  assertIncludes(leadHtml, '<link rel="canonical" href="https://stratacrm.app/lead/biz-lead"/>');
  assertIncludes(leadHtml, '<meta property="og:url" content="https://stratacrm.app/lead/biz-lead"/>');
  assertIncludes(leadHtml, '<meta property="og:image" content="https://stratacrm.app/social-preview.png?v=20260416c"/>');
  assertIncludes(leadHtml, '<meta property="og:title" content="Request service | Northline Auto Spa"/>');

  console.log("Verified booking and lead share HTML metadata injection.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
