import { LegalPageLayout } from "@/components/public/LegalPageLayout";

const title = "Privacy Policy | Strata CRM";
const description =
  "Read how Strata CRM collects, uses, stores, and protects information for automotive service businesses and their customers.";
const effectiveDate = "April 3, 2026";

export function meta() {
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index,follow" },
  ];
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This Privacy Policy explains how Strata CRM collects, uses, stores, and shares information when businesses use the Strata platform, website, customer-facing documents, and payment features."
      effectiveDate={effectiveDate}
      sections={[
        {
          title: "Information we collect",
          bullets: [
            "Account information such as names, email addresses, phone numbers, business details, and login credentials.",
            "Business records created inside Strata, including clients, vehicles, appointments, services, quotes, invoices, payments, notes, and communications.",
            "Usage and device information such as browser type, IP address, app activity, and basic analytics needed to operate and secure the service.",
            "Payment and billing information processed through Stripe and other service providers that help us run subscriptions or connected-account payments.",
          ],
        },
        {
          title: "How we use information",
          bullets: [
            "To provide, maintain, and improve Strata CRM.",
            "To authenticate users, protect accounts, and prevent fraud, abuse, or unauthorized access.",
            "To send transactional emails such as appointment confirmations, invoices, password resets, onboarding notices, and support communications.",
            "To process subscriptions, connected-account setup, and payment-related workflows.",
            "To respond to support requests, enforce our terms, and comply with legal obligations.",
          ],
        },
        {
          title: "How business customer data is handled",
          body:
            "Businesses using Strata control the customer and operational data they enter into the platform. Strata processes that information on the business's behalf to deliver CRM, scheduling, quoting, invoicing, and payment-related features. Businesses are responsible for the accuracy of the information they upload and for using Strata in a lawful way.",
        },
        {
          title: "How we share information",
          bullets: [
            "With service providers that support hosting, email delivery, authentication, analytics, error monitoring, and payment processing.",
            "With Stripe when a business connects a Stripe account, accepts a payment, or uses subscription billing.",
            "When required by law, court order, legal process, or to protect the rights, safety, and security of Strata, our users, or others.",
            "In connection with a merger, financing, acquisition, or sale of assets, subject to appropriate confidentiality and legal safeguards.",
          ],
        },
        {
          title: "Data retention",
          body:
            "We retain information for as long as needed to provide the service, maintain account history, resolve disputes, enforce agreements, and comply with legal, tax, accounting, and security obligations. We may keep backup or archived copies for a limited period where reasonably necessary.",
        },
        {
          title: "Security",
          body:
            "We use reasonable administrative, technical, and organizational measures to protect information, but no online system can guarantee absolute security. Businesses should use strong passwords, manage team access carefully, and contact us promptly if they suspect unauthorized activity.",
        },
        {
          title: "Your choices and privacy rights",
          bullets: [
            "Account holders can review and update certain account or business information inside Strata.",
            "Businesses may request deletion of their account and associated data, subject to records we need to retain for legal, billing, tax, security, or dispute-resolution purposes.",
            "California users may have additional privacy rights under applicable law, including rights to know, delete, correct, or limit certain uses of personal information where required.",
          ],
        },
        {
          title: "Children",
          body:
            "Strata CRM is intended for business use and is not directed to children under 13. We do not knowingly collect personal information directly from children under 13.",
        },
        {
          title: "Changes to this policy",
          body:
            "We may update this Privacy Policy from time to time. If we make material changes, we may update the effective date above and provide additional notice where appropriate.",
        },
        {
          title: "Contact us",
          body:
            "For privacy questions or requests, contact Strata CRM at support@stratacrm.app.",
        },
      ]}
    />
  );
}
