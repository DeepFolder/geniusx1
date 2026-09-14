import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout eyebrow="Privacy" title="Privacy Policy" summary="This notice explains what Genius X1 processes, why it is processed, who may receive it, and the choices available to users.">
      <section>
        <h2>1. Controller and contact</h2>
        <p>Genius X1 is operated by <strong>DeepFolder</strong>, Switzerland. For privacy inquiries or requests, contact <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a>.</p>
      </section>
      <section>
        <h2>2. Scope</h2>
        <p>This Policy applies to the public website, user accounts, engineering calculation workspace, attachments, support interactions, and related service logs at geniusx1.com. It does not govern third-party websites reached through links.</p>
      </section>
      <section>
        <h2>3. Information we process</h2>
        <ul>
          <li><strong>Account data:</strong> name, email address, password hash, role, approval status, account settings, and authentication records.</li>
          <li><strong>Calculation content:</strong> prompts, inputs, assumptions, equations, computed steps, results, comments, versions, references, and titles.</li>
          <li><strong>Files:</strong> images and PDFs you choose to upload, their metadata, extracted text, and generated outputs.</li>
          <li><strong>AI interaction data:</strong> prompts and relevant context sent to the configured AI provider, plus provider responses and operational metadata.</li>
          <li><strong>Technical and security data:</strong> IP address, browser and device information, request times, error logs, security events, and cookie or local-storage identifiers.</li>
          <li><strong>Communications:</strong> messages and information you send when requesting support, exercising rights, or reporting an issue.</li>
        </ul>
      </section>
      <section>
        <h2>4. Purposes and legal bases</h2>
        <ul>
          <li>Provide accounts, calculations, saving, version history, attachments, and support as necessary to perform the service contract.</li>
          <li>Protect accounts, prevent abuse, diagnose faults, and maintain service integrity based on legitimate interests and legal obligations.</li>
          <li>Process optional features or communications based on consent where consent is required; consent can be withdrawn prospectively.</li>
          <li>Comply with lawful requests, enforce terms, establish or defend legal claims, and meet applicable regulatory duties.</li>
        </ul>
        <p className="mt-4">Where another legal basis is required in a user’s jurisdiction, processing is limited accordingly.</p>
      </section>
      <section>
        <h2>5. AI processing and confidential information</h2>
        <p>When an AI feature is used, Genius X1 may send the prompt, selected calculation context, extracted file content, and related instructions to the configured AI service provider. AI responses may be retained with the calculation so the service can display history and support later review.</p>
        <p className="mt-4"><strong>Do not submit personal data, trade secrets, export-controlled data, classified information, health data, or other restricted content unless you are authorized to do so and have assessed the provider and contractual safeguards.</strong></p>
      </section>
      <section>
        <h2>6. Recipients and processors</h2>
        <p>Information is disclosed only as needed to operate the service, follow user instructions, protect rights and safety, or comply with law. Current categories include:</p>
        <ul className="mt-4">
          <li><strong>Hosting and infrastructure:</strong> Hostinger and related infrastructure providers.</li>
          <li><strong>AI services:</strong> OpenAI when AI generation, reasoning, embedding, or related features are used.</li>
          <li><strong>Professional services:</strong> security, legal, accounting, and support providers where necessary and subject to appropriate duties.</li>
          <li><strong>Authorities or counterparties:</strong> only when legally required or reasonably necessary to protect legal rights and safety.</li>
        </ul>
        <p className="mt-4">Genius X1 does not sell personal information or share it for cross-context behavioral advertising.</p>
      </section>
      <section>
        <h2>7. International transfers</h2>
        <p>Providers may process data outside your country. Where required, transfers rely on an adequacy decision, contractual safeguards such as approved standard contractual clauses, or another lawful transfer mechanism. Contact us for information relevant to a specific service arrangement.</p>
      </section>
      <section>
        <h2>8. Retention</h2>
        <p>Account and calculation data is retained while the account or service relationship remains active and afterward only as needed for backups, security, dispute resolution, legal obligations, or legitimate business records. Retention depends on the data type and applicable requirements. Deleted data may remain in protected backups until the applicable backup cycle expires.</p>
      </section>
      <section>
        <h2>9. Your rights</h2>
        <p>Depending on location and applicable law—including the EU/EEA GDPR, UK GDPR, Swiss FADP, or US state privacy laws—you may have rights to request access, correction, deletion, restriction, portability, or objection; withdraw consent; opt out of certain processing; and appeal or complain to a supervisory authority.</p>
        <p className="mt-4">California residents may also have rights to know, correct, delete, and receive information without discrimination. Because we do not sell personal information or use it for cross-context behavioral advertising, there is currently no sale or advertising-sharing opt-out to exercise.</p>
        <p className="mt-4">Send requests to <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a>. We may need to verify identity and authority. Rights may be limited by exceptions in applicable law.</p>
      </section>
      <section>
        <h2>10. Security</h2>
        <p>We use measures designed to protect data, including HTTPS, access controls, password hashing, restricted server-side credentials, private attachment storage, and backups. No system is completely secure; users should protect credentials and promptly report suspected misuse.</p>
      </section>
      <section>
        <h2>11. Cookies and browser storage</h2>
        <p>Genius X1 currently uses necessary first-party cookies and local storage for authentication, security, preferences, consent records, and calculation continuity. It does not currently use advertising cookies or third-party analytics cookies. See the <a href="/cookie-policy">Cookie Policy</a>.</p>
      </section>
      <section>
        <h2>12. Children</h2>
        <p>The service is intended for professional users aged 18 or older. We do not knowingly collect personal information from children. Contact us if you believe a child has submitted information.</p>
      </section>
      <section>
        <h2>13. Changes</h2>
        <p>We may update this Policy as the service, providers, or laws change. The current version and effective date will be posted here. Material changes will receive additional notice when required.</p>
      </section>
    </LegalPageLayout>
  );
}
