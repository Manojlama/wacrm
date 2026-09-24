import { branding } from "@/lib/branding";

export const metadata = { title: "Privacy policy" };

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

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: September 2026
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="What this policy covers">
          <p>
            This policy describes how {branding.name} (the &quot;Service&quot;)
            collects, uses, and protects information when you use the
            Service. By using the Service you consent to this processing.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            We store the information you enter into the Service: account
            details, contact records, conversations, message history,
            deals, automation configuration, and billing records. We also
            collect basic technical information (IP address, browser, and
            usage logs) to run and secure the Service.
          </p>
        </Section>

        <Section title="How we use data">
          <p>
            Your data is used solely to provide the Service: to deliver
            messages through the WhatsApp Business Platform, to show you
            analytics, to process billing, and to send you transactional
            emails (invitations, receipts, trial reminders). We do not
            sell your data.
          </p>
        </Section>

        <Section title="WhatsApp data">
          <p>
            When you connect a WhatsApp Business number, messages flow
            through Meta&apos;s WhatsApp Business Platform under Meta&apos;s
            terms and privacy policy. Consent for contacting customers
            is your responsibility, and session-window and template
            policies are enforced by Meta.
          </p>
        </Section>

        <Section title="Credentials and API keys">
          <p>
            WhatsApp credentials, encryption keys, and any AI-provider
            keys you add are stored encrypted and are used only to make
            the API calls you request. Payment details are processed by
            our payment provider and never stored on our servers.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Data is retained for the life of your account and kept after
            cancellation or expiry so you can reactivate. You can request
            export or permanent deletion at any time by emailing{" "}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {branding.supportEmail}
            </a>{" "}
            — deletion is completed within 30 days of verification.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is stored in a tenant-isolated database, credentials are
            encrypted at rest, and access is role-limited on both the
            application and database layer. No method of transmission or
            storage is fully secure, and we cannot guarantee absolute
            security.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use browser local storage for your session, theme, and mode
            preferences. We do not use third-party advertising trackers.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For privacy questions or data requests, email{" "}
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