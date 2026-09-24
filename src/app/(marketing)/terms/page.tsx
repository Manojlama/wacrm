import { branding } from "@/lib/branding";

export const metadata = { title: "Terms of service" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">
        Terms of service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: September 2026
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="1. The service">
          <p>
            {branding.name} (&quot;the Service&quot;) provides a subscription-based
            CRM for the WhatsApp Business Platform. By creating an account
            or using the Service, you agree to these terms. If you are
            using the Service on behalf of an organisation, you confirm
            that you have authority to bind that organisation.
          </p>
        </Section>

        <Section title="2. Accounts and responsibility">
          <p>
            You are responsible for maintaining the confidentiality of
            your credentials and for all activity under your account. You
            must not allow access to your WhatsApp Business number to
            anyone not authorised by you, and you must comply with the
            WhatsApp Business Platform and Meta policies in all usage.
          </p>
        </Section>

        <Section title="3. Subscriptions and payments">
          <p>
            Paid plans are billed monthly or yearly in advance through our
            payment provider. Pricing and plan limits (agents, contacts,
            broadcasts, automations, and WhatsApp numbers) are shown on
            the pricing page. If a payment fails, the workspace may become
            restricted; your data is never deleted.
          </p>
        </Section>

        <Section title="4. Cancellation and refunds">
          <p>
            You can cancel at any time from the billing settings. After
            cancellation you continue to have access until the end of the
            paid period. There are no partial refunds for unused portions
            of a billing period unless required by applicable law.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>
            You may not use the Service to send spam, unlawful or
            deceptive messages, or content that violates Meta&apos;s WhatsApp
            policies or the laws of your jurisdiction. You are responsible
            for all content you send through the Service, including
            obtaining consent where required.
          </p>
        </Section>

        <Section title="6. Your data">
          <p>
            You own the data you enter into the Service. We process it
            only to operate and secure the Service. On cancellation or
            expiry, your data is retained and you retain the ability to
            reactivate; you may request export or deletion via{" "}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {branding.supportEmail}
            </a>
            .
          </p>
        </Section>

        <Section title="7. No warranty and limitation of liability">
          <p>
            The Service is provided &quot;as is&quot; without warranties of any
            kind. To the maximum extent permitted by law, we are not
            liable for indirect, incidental, special, or consequential
            damages arising from your use of the Service. Our total
            aggregate liability in connection with the Service will not
            exceed the amounts you paid in the twelve months before the
            claim.
          </p>
        </Section>

        <Section title="8. Changes">
          <p>
            We may update these terms from time to time. Material changes
            will be announced via the email on your account. Continued use
            of the Service after changes take effect constitutes
            acceptance of the updated terms.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Questions about these terms? Reach us at{" "}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {branding.supportEmail}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}