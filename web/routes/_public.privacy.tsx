import { LegalPageLayout } from "@/components/public/LegalPageLayout";

const title = "Privacy Policy | Strata CRM";
const description =
  "Read how Strata CRM collects, uses, stores, and protects information for automotive service businesses and their customers.";
const effectiveDate = "April 29, 2026";

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
            "Business records created inside Strata, including client records, vehicle information, appointments, services, quotes, invoices, deposits, payments, notes, booking requests, internal task history, and customer communications.",
            "Customer-facing information submitted through public booking pages, lead forms, customer hubs, quote pages, invoice pages, appointment confirmation pages, and related public links.",
            "Usage, device, and diagnostic information such as browser type, app version, IP address, approximate location from IP, device identifiers provided by the platform, app activity, error logs, and basic analytics needed to operate, troubleshoot, secure, and improve the service.",
            "Payment and billing information processed through Stripe or other payment providers, including subscription status, connected-account status, payment intent/session identifiers, invoice or deposit status, and limited payment metadata. Strata does not intentionally store full card numbers.",
          ],
        },
        {
          title: "How we use information",
          bullets: [
            "To provide, maintain, and improve Strata CRM.",
            "To authenticate users, protect accounts, and prevent fraud, abuse, or unauthorized access.",
            "To send transactional emails such as appointment confirmations, invoices, password resets, onboarding notices, and support communications.",
            "To process subscriptions, connected-account setup, and payment-related workflows.",
            "To show account, workspace, billing, notification, and integration status inside the web app and native app.",
            "To diagnose bugs, investigate failed requests, prevent duplicate records, maintain backups, and improve reliability.",
            "To respond to support requests, enforce our terms, and comply with legal obligations.",
          ],
        },
        {
          title: "How business customer data is handled",
          body:
            "Businesses using Strata control the customer and operational data they enter into the platform. Strata processes that information on the business's behalf to deliver CRM, scheduling, quoting, invoicing, payment, notification, and customer-portal features. Businesses are responsible for the accuracy of the information they upload, the customer communications they send, and their own compliance with privacy, marketing, tax, payment, employment, and consumer-protection laws.",
        },
        {
          title: "How we share information",
          bullets: [
            "With service providers that support hosting, email delivery, authentication, analytics, error monitoring, and payment processing.",
            "With Stripe when a business connects a Stripe account, accepts a payment, or uses subscription billing.",
            "With Apple, Google, or other platform providers when needed to support app sign-in, push notifications, calendar integrations, device delivery, or app security.",
            "With a business account owner or authorized team member when information belongs to that business workspace.",
            "When required by law, court order, legal process, or to protect the rights, safety, and security of Strata, our users, or others.",
            "In connection with a merger, financing, acquisition, or sale of assets, subject to appropriate confidentiality and legal safeguards.",
          ],
        },
        {
          title: "No sale of personal information",
          body:
            "We do not sell personal information for money. We also do not knowingly use customer records entered by a business for cross-context behavioral advertising. If our practices materially change, we will update this policy and provide any required choices.",
        },
        {
          title: "Data retention",
          body:
            "We retain information for as long as needed to provide the service, maintain account and business history, support customer-facing documents, resolve disputes, enforce agreements, prevent fraud or abuse, and comply with legal, tax, accounting, payment, security, and audit obligations. We may keep backup or archived copies for a limited period where reasonably necessary. Some records, such as invoices, payments, audit logs, tax-related records, dispute history, and fraud-prevention records, may need to be retained even after an account deletion request.",
        },
        {
          title: "Security",
          body:
            "We use reasonable administrative, technical, and organizational measures to protect information, but no online system can guarantee absolute security. Businesses should use strong passwords, manage team access carefully, and contact us promptly if they suspect unauthorized activity.",
        },
        {
          title: "Third-party services",
          body:
            "Strata relies on third-party providers for hosting, email, authentication, analytics, diagnostics, payment processing, app distribution, and integrations. Those providers process information according to their own terms and privacy commitments. Stripe handles payment information for connected-account payments and subscription billing, and Apple or Google may process information when users sign in, receive push notifications, or use platform services.",
        },
        {
          title: "Your choices and privacy rights",
          bullets: [
            "Account holders can review and update certain account or business information inside Strata.",
            "If you create an account, you can initiate account deletion in the app from the profile/account area. Deletion may remove or anonymize account information, subject to records we need to retain for legal, billing, tax, security, backup, fraud-prevention, or dispute-resolution purposes.",
            "Businesses may request export, correction, or deletion assistance for business data where technically feasible and legally appropriate.",
            "Customers of businesses using Strata should contact the business directly for requests about appointment, vehicle, invoice, quote, or customer records controlled by that business. We may direct those requests to the applicable business account owner.",
            "California and other U.S. state residents may have additional privacy rights under applicable law, including rights to know, access, delete, correct, or limit certain uses of personal information where required.",
            "You can contact support@stratacrm.app for privacy requests. We may need to verify your identity and authority before completing a request.",
          ],
        },
        {
          title: "Communications and notifications",
          body:
            "Strata may send transactional emails, in-app notices, push notifications, and support messages related to account security, appointments, quotes, invoices, booking requests, payments, and service operation. Businesses are responsible for making sure their own customer communications through Strata are lawful and expected by their customers.",
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
