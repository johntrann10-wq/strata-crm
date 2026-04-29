import { LegalPageLayout } from "@/components/public/LegalPageLayout";

const title = "Terms and Conditions | Strata CRM";
const description =
  "Review the terms that apply when businesses access and use Strata CRM, including account, billing, payments, and platform responsibilities.";
const effectiveDate = "April 29, 2026";

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
            "Strata CRM is business management software designed for automotive service businesses to help manage scheduling, customers, vehicles, leads, quotes, invoices, deposits, payments, notifications, and related workflows. You may use the service only for lawful business purposes and only in accordance with these Terms.",
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
            "Paid Strata subscriptions, if applicable, are billed according to the pricing, trial, renewal, and plan terms shown at signup, checkout, account settings, or another authorized billing surface.",
            "If a free trial or promotional period converts to a paid subscription, the applicable price, renewal timing, cancellation method, and any required payment-method terms should be reviewed before starting the paid subscription.",
            "You authorize Strata and its payment processors to charge the payment method on file for subscription fees, taxes, and other amounts you agree to pay, unless you cancel before renewal or another written agreement applies.",
            "Payment processing, connected-account onboarding, card payments, payouts, and related financial services may be provided by Stripe or other payment partners.",
            "You are responsible for any taxes, processor fees, refunds, chargebacks, disputes, and payment obligations associated with your own business operations unless a separate written agreement says otherwise.",
          ],
        },
        {
          title: "Cancellation and refunds",
          bullets: [
            "You may cancel a paid Strata subscription through the available account or billing controls, or by contacting support@stratacrm.app if the in-app or web controls are unavailable.",
            "Cancellation stops future subscription renewals after the current billing period unless applicable law, the checkout terms, or a separate written agreement provides otherwise.",
            "Fees already paid are generally non-refundable except where required by law, where stated in the checkout terms, or where Strata chooses to issue a credit or refund in its discretion.",
            "Deleting an account and canceling a subscription are separate actions. If you want to stop future subscription charges, use the available cancellation controls or contact support before the next renewal.",
          ],
        },
        {
          title: "Connected accounts and merchant responsibilities",
          body:
            "If you connect a Stripe or other payment account through Strata, you remain responsible for your own merchant account, business information, payout setup, tax treatment, customer communications, and compliance with the applicable payment provider requirements. Strata is not a bank, money transmitter, or fiduciary for your business unless a separate written agreement states otherwise.",
        },
        {
          title: "Customer payments, invoices, and deposits",
          bullets: [
            "Strata may help you create, send, display, and track quotes, invoices, deposits, appointment confirmations, and payment links, but you are responsible for reviewing those records before sending them to customers.",
            "You are responsible for your own customer refunds, service policies, tax obligations, chargeback responses, dispute handling, and compliance with payment-network and processor rules.",
            "Strata does not guarantee that a customer will pay, that a payment will be authorized, that funds will be available on a specific timeline, or that a payment provider will approve or maintain your connected account.",
          ],
        },
        {
          title: "Customer and business data",
          bullets: [
            "You retain responsibility for the information you upload or collect through Strata, including customer, vehicle, appointment, and billing records.",
            "You represent that you have the rights and permissions needed to use that data in the service.",
            "You must not upload unlawful, infringing, fraudulent, or malicious content or use Strata to violate privacy, consumer-protection, payments, marketing, or other applicable laws.",
            "You are responsible for maintaining any business records, tax records, repair records, customer authorizations, and backups that your business is legally required or operationally expected to keep.",
          ],
        },
        {
          title: "Customer communications",
          body:
            "Strata may provide tools for sending appointment confirmations, quote links, invoice links, customer hub links, reminders, notifications, and related messages. You are responsible for making sure the content, recipients, timing, and use of those communications comply with applicable laws and customer expectations. Strata does not guarantee delivery, open rates, customer response, or error-free notification behavior.",
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
          title: "Availability, backups, and changes",
          body:
            "We work to keep Strata reliable, but the service may be unavailable, delayed, interrupted, limited, or changed because of maintenance, outages, third-party failures, security issues, app store review requirements, legal requirements, or other operational reasons. We may modify, add, or remove features from time to time. You are responsible for reviewing critical records and maintaining any separate backups or records your business needs.",
        },
        {
          title: "No guarantees or professional advice",
          body:
            "Strata is a workflow and business-management tool. We do not guarantee increased revenue, more bookings, fewer missed leads, uninterrupted operations, error-free scheduling, perfect notification delivery, tax compliance, legal compliance, accounting accuracy, or any particular business outcome. Strata does not provide legal, tax, accounting, insurance, employment, or financial advice.",
        },
        {
          title: "Disclaimers",
          body:
            "Strata CRM is provided on an 'as is' and 'as available' basis. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free service.",
        },
        {
          title: "Limitation of liability",
          body:
            "To the fullest extent permitted by law, Strata and its affiliates, officers, employees, and service providers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost revenue, lost goodwill, lost data, missed appointments, duplicate bookings, failed notifications, payment disputes, chargebacks, tax issues, customer disputes, or business interruption arising from or related to your use of the service. To the fullest extent permitted by law, Strata's total liability for claims relating to the service will not exceed the greater of the amount you paid to Strata for the service in the three months before the claim arose or $100.",
        },
        {
          title: "Legal limits",
          body:
            "Some jurisdictions do not allow certain disclaimers, exclusions, or limitations of liability. In those cases, the limits in these Terms apply only to the fullest extent permitted by law. Nothing in these Terms limits rights that cannot legally be waived.",
        },
        {
          title: "Changes to these terms",
          body:
            "We may update these Terms from time to time. When we do, we may update the effective date above and provide additional notice where appropriate. Continued use of the service after updated Terms become effective constitutes acceptance of the revised Terms.",
        },
        {
          title: "Contact us",
          body:
            "Questions about these Terms can be sent to support@stratacrm.app.",
        },
      ]}
    />
  );
}
