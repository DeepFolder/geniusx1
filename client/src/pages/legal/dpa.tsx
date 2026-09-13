import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DataProcessingAgreement() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Data Processing Agreement</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last updated: June 13, 2026</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Version 1.0</p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. Introduction</h2>
              <p>
                This Data Processing Agreement ("DPA") supplements the DeepFolder Terms of Service and applies where DeepFolder ("Processor") processes personal data on behalf of a customer ("Controller") in connection with the DeepFolder platform.
              </p>
              <p className="mt-4">
                This DPA is intended to comply with Article 28 of Regulation (EU) 2016/679 (GDPR), the UK GDPR, and the Swiss Federal Act on Data Protection (nFADP / FADP).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. Definitions</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Personal Data</strong> — any information relating to an identified or identifiable natural person, as defined in Art. 4(1) GDPR.</li>
                <li><strong>Processing</strong> — any operation performed on Personal Data, including collection, storage, use, disclosure, and erasure.</li>
                <li><strong>Sub-Processor</strong> — any third party engaged by DeepFolder to process Personal Data on the Controller's behalf.</li>
                <li><strong>Data Subject</strong> — the natural person to whom Personal Data relates.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Data Ownership</h2>
              <p>
                The Controller retains full ownership of all Personal Data and business data uploaded to or processed through the DeepFolder platform. DeepFolder holds only a limited processing license — strictly necessary to deliver, maintain, and improve the contracted services.
              </p>
              <p className="mt-4">
                DeepFolder shall not sell, rent, or otherwise commercialise Controller data. DeepFolder shall not use Controller data to train its own AI models without explicit written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. Scope of Processing</h2>
              <p>DeepFolder processes Personal Data only:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>On documented instructions from the Controller;</li>
                <li>To the extent necessary for service delivery;</li>
                <li>In compliance with applicable data protection law.</li>
              </ul>
              <p className="mt-4">
                The categories of Data Subjects and types of Personal Data processed depend on the Controller's use of the platform and may include: company employees, procurement contacts, and end-users whose data the Controller uploads.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. Technical and Organisational Measures</h2>
              <p>DeepFolder implements appropriate security measures including:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Encryption at rest (AES-256) and in transit (TLS 1.3);</li>
                <li>Role-based access controls limiting staff access to Personal Data;</li>
                <li>Pseudonymisation and minimisation practices where feasible;</li>
                <li>Regular security reviews and incident response procedures;</li>
                <li>Audit logging of privileged operations.</li>
              </ul>
              <p className="mt-4">
                Full details are provided in the <a href="/legal/security" className="text-blue-600 hover:underline">Security Whitepaper</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. Sub-Processors</h2>
              <p>
                DeepFolder uses the Sub-Processors listed at <a href="/legal/subprocessors" className="text-blue-600 hover:underline">/legal/subprocessors</a>. The Controller grants general authorisation for DeepFolder to engage these Sub-Processors, subject to the conditions below.
              </p>
              <p className="mt-4">
                DeepFolder will provide at least 30 days' advance notice of any intended change to its Sub-Processor list. The Controller may object within that period; where a resolution cannot be found, the Controller may terminate the agreement.
              </p>
              <p className="mt-4">
                DeepFolder imposes data protection obligations on all Sub-Processors equivalent to those in this DPA.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">7. International Data Transfers</h2>
              <p>
                Some Sub-Processors operate outside the EEA or Switzerland (e.g. OpenAI in the USA). All such transfers are covered by appropriate safeguards, specifically:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>European Commission Standard Contractual Clauses (SCCs) under Art. 46(2)(c) GDPR;</li>
                <li>UK International Data Transfer Agreements (IDTAs) where applicable;</li>
                <li>Swiss adequacy decisions or SCCs adapted for nFADP compliance.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">8. Data Subject Rights</h2>
              <p>
                DeepFolder will, to the extent technically feasible, assist the Controller in responding to Data Subject requests (access, correction, deletion, portability, objection) within the timeframes required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">9. Data Breach Notification</h2>
              <p>
                DeepFolder will notify the Controller without undue delay — and no later than 72 hours after becoming aware — of any Personal Data breach affecting Controller data. The notification will include: the nature of the breach, categories and approximate number of Data Subjects and records affected, likely consequences, and measures taken or proposed.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">10. Audits</h2>
              <p>
                DeepFolder will make available all information reasonably necessary to demonstrate compliance with this DPA and will allow for and contribute to audits conducted by the Controller or a mandated auditor, subject to reasonable notice (minimum 30 days) and confidentiality obligations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">11. Data Retention and Deletion</h2>
              <p>
                Upon termination of the underlying service agreement, DeepFolder will, at the Controller's choice, delete or return all Personal Data within 30 days, unless retention is required by applicable law. Backups containing Personal Data are purged within 90 days of termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">12. Governing Law</h2>
              <p>
                This DPA is governed by Swiss law. Any disputes arising from or in connection with this DPA are subject to the exclusive jurisdiction of the courts of Zug, Switzerland. Where the GDPR or UK GDPR mandatorily applies, the relevant national law supplements this DPA to the extent required.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">13. Contact</h2>
              <p>
                <strong>DeepFolder Data Protection</strong><br />
                Email: privacy@deepfolder.com<br />
                Address: DeepFolder, Switzerland
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Version 1.0 — Published June 13 2026<br />
                © DeepFolder. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
