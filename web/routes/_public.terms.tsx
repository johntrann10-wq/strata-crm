import { LegalPageLayout } from "@/components/public/LegalPageLayout";

const title = "Terms and Conditions | Strata CRM";
const description =
  "Review the terms that apply when businesses access and use Strata CRM, including account, billing, payments, and platform responsibilities.";
const effectiveDate = "April 3, 2026";

export function meta() {
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index,follow" },
  ];
}

export default function TermsPage() {
  return (
    <LegalPageLayout
      eyebrow="Terms"
      title="Terms and Conditions"
      description="These Terms and Conditions govern access to and use of Strata CRM by businesses, team members, and authorized users. By using Strata, you agree to these terms."
      effectiveDate={effectiveDate}
      sections={[
        {
          title: "Use of the service",
          body:
            "Strata CRM is business software designed for automotive service businesses. You may use the service only for lawful business purposes and only in accordance with these Terms.",
        },
        {
          title: "Accounts and access",
          bullets: [
            "You are responsible for maintaining the confidentiality of login credentials and for all activity that occurs under your account.",
            "You must provide accurate account and business information and keep it reasonably current.",
            "You are responsible for managing team-member permissions and limiting access to authorized users only.",
          ],
        },
        {
          title: "Subscriptions, billing, and payments",
          bullets: [
            "Paid Strata subscriptions, if applicable, are billed according to the pricing and plan terms shown at signup or in the app.",
            "Payment processing, connected-account onboarding, card payments, payouts, and related financial services may be provided by Stripe or other payment partners.",
            "You are responsible for any taxes, processor fees, refunds, chargebacks, disputes, and payment obligations associated with your own business operations unless a separate written agreement says otherwise.",
          ],
        },
        {
          title: "Connected accounts and merchant responsibilities",
          body:
            "If you connect a Stripe or other payment account through Strata, you remain responsible for your own merchant account, business information, payout setup, tax treatment, customer communications, and compliance with the applicable payment provider requirements. Strata is not a bank, money transmitter, or fiduciary for your business unless a separate written agreement states otherwise.",
        },
        {
          title: "Customer and business data",
          bullets: [
            "You retain responsibility for the information you upload or collect through Strata, including customer, vehicle, appointment, and billing records.",
            "You represent that you have the rights and permissions needed to use that data in the service.",
            "You must not upload unlawful, infringing, fraudulent, or malicious content or use Strata to violate privacy, consumer-protection, payments, marketing, or other applicable laws.",
          ],
        },
        {
          title: "Acceptable use",
          bullets: [
            "Do not attempt to interfere with the service, gain unauthorized access, scrape data, reverse engineer protected systems, distribute malware, or misuse the platform.",
            "Do not use Strata to send deceptive, abusive, spam, or unlawful communications.",
            "Do not use Strata in a way that could harm the security, availability, or integrity of the service or the data of other users.",
          ],
        },
        {
          title: "Intellectual property",
          body:
            "Strata CRM, including the software, design, branding, text, graphics, and underlying technology, is owned by Strata or its licensors and is protected by applicable intellectual-property laws. We grant you a limited, non-exclusive, non-transferable right to use the service during your active subscription or authorized use period.",
        },
        {
          title: "Termination and suspension",
          body:
            "We may suspend or terminate access if you violate these Terms, fail to pay required fees, create legal or security risk, or use the service in a way that could harm Strata or others. You may stop using the service at any time, subject to any outstanding payment obligations and any retention obligations described in our Privacy Policy.",
        },
        {
          title: "Disclaimers",
          body:
            "Strata CRM is provided on an 'as is' and 'as available' basis. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free service.",
        },
        {
          title: "Limitation of liability",
          body:
            "To the fullest extent permitted by law, Strata and its affiliates, officers, employees, and service providers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, goodwill, data, or business interruption arising from or related to your use of the service.",
        },
        {
          title: "Changes to these terms",
          body:
            "We may update these Terms from time to time. When we do, we may update the effective date above and provide additional notice where appropriate. Continued use of the service after updated Terms become effective constitutes acceptance of the revised Terms.",
        },
        {
          title: "Contact us",
          body:
            "Questions about these Terms can be sent to support@stratacrm.com.",
        },
      ]}
    />
  );
}
