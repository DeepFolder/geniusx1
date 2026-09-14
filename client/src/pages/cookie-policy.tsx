import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export default function CookiePolicy() {
  return (
    <LegalPageLayout eyebrow="Cookies" title="Cookie Policy" summary="Genius X1 currently uses only first-party storage needed to secure accounts and preserve user choices.">
      <section>
        <h2>1. What this policy covers</h2>
        <p>Cookies are small data records stored by a browser. Similar technologies, such as local storage, can remember information without sending it automatically with every request. This Policy describes both.</p>
      </section>
      <section>
        <h2>2. Necessary cookies</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-300 dark:border-slate-700"><th className="py-3 pr-5">Name</th><th className="py-3 pr-5">Purpose</th><th className="py-3">Typical duration</th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <tr><td className="py-4 pr-5 font-mono text-xs">token</td><td className="py-4 pr-5">Secure, HTTP-only sign-in token used to authenticate account requests.</td><td className="py-4">Up to 7 days</td></tr>
              <tr><td className="py-4 pr-5 font-mono text-xs">connect.sid</td><td className="py-4 pr-5">Secure, HTTP-only server session used where session state is required.</td><td className="py-4">Up to 24 hours</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4">These cookies are used only when needed for the requested service. Blocking them can prevent sign-in or authenticated features from working.</p>
      </section>
      <section>
        <h2>3. Necessary local storage</h2>
        <p>The browser stores the cookie-notice record, light/dark theme, panel layout, calculation modes, web-search preference, and identifiers needed to reconnect to an active calculation job. These records remain on the device until cleared or replaced. Authentication may also use browser storage in compatibility flows.</p>
      </section>
      <section>
        <h2>4. No advertising or analytics cookies</h2>
        <p>Genius X1 currently does not use advertising cookies, social-media tracking pixels, cross-site behavioral tracking, or third-party analytics cookies. AI requests are made by the Genius X1 server; the AI provider does not set a browser cookie through this site.</p>
      </section>
      <section>
        <h2>5. Consent and choice</h2>
        <p>On a first visit, a compact notice explains the necessary storage and records that the notice was acknowledged. Because the current storage is necessary to provide requested functions and no optional tracking is enabled, there is no optional category to accept. If optional analytics, advertising, or similar technologies are introduced, they must remain disabled until the required choice is obtained.</p>
        <p className="mt-4">You can reopen the notice using “Cookie settings” in the footer. Browser settings can delete or block stored data, but doing so may sign you out, reset preferences, interrupt an active calculation, or cause the notice to reappear.</p>
      </section>
      <section>
        <h2>6. Legal context</h2>
        <p>Where applicable, necessary storage is used to provide a service requested by the user. Swiss users are informed of the processing and their browser controls. Optional technologies, if added later, will be assessed under applicable consent and opt-out requirements, including EU/EEA ePrivacy and GDPR rules and relevant US state laws.</p>
      </section>
      <section>
        <h2>7. Changes and contact</h2>
        <p>We update this Policy when storage practices change. Questions can be sent to <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a>.</p>
      </section>
    </LegalPageLayout>
  );
}
