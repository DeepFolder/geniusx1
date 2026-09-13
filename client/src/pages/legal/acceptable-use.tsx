import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AcceptableUsePolicy() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Acceptable Use Policy</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last updated: June 13, 2026</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Version 1.0</p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. Purpose</h2>
              <p>
                This Acceptable Use Policy ("AUP") sets out the rules that apply to all users of the DeepFolder platform ("Platform"), operated by DeepFolder ("DeepFolder", "we", "us"). This AUP supplements and is incorporated into the <a href="/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. Eligibility</h2>
              <p>
                The Platform is intended exclusively for professional and business use. You must be at least <strong>18 years of age</strong> and have the legal authority to act on behalf of the company or organisation you represent. By using the Platform, you confirm that you meet these requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Prohibited Uses</h2>
              <p>You must not use the Platform, or permit others to use it, for any of the following purposes:</p>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.1 Illegal Activity</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violating any applicable local, national, or international law or regulation;</li>
                <li>Facilitating money laundering, tax evasion, or any form of financial crime;</li>
                <li>Engaging in activity that breaches export control laws or evades sanctions imposed by the EU, UK, US, Switzerland, or UN.</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.2 Harmful Content</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Uploading, transmitting, or distributing malware, spyware, ransomware, viruses, or other malicious code;</li>
                <li>Publishing or distributing content that is defamatory, obscene, hateful, or discriminatory;</li>
                <li>Harassing, threatening, or abusing other users or third parties.</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.3 Intellectual Property Infringement</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Uploading or sharing content that infringes any copyright, trademark, patent, trade secret, or other intellectual property right;</li>
                <li>Using the Platform to reverse-engineer or copy proprietary technology or data of other users.</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.4 Fraud and Misrepresentation</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Impersonating another person, company, or entity;</li>
                <li>Providing false or misleading product information, certifications, or business credentials;</li>
                <li>Engaging in phishing, social engineering, or other deceptive practices.</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.5 Platform Abuse</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Scraping, crawling, or harvesting data from the Platform in an automated manner without prior written consent;</li>
                <li>Attempting to gain unauthorised access to any part of the Platform, other accounts, or connected systems;</li>
                <li>Introducing automated bots, scripts, or tools that place an unreasonable load on Platform infrastructure;</li>
                <li>Interfering with the security, integrity, or availability of the Platform or its services;</li>
                <li>Circumventing or disabling access controls, authentication, or rate-limiting mechanisms.</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.6 Spam and Unsolicited Communications</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Sending unsolicited commercial communications (spam) to other users;</li>
                <li>Using Platform messaging features for bulk advertising or lead generation without consent.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. Enforcement</h2>
              <p>DeepFolder reserves the right to investigate any suspected violation of this AUP. Upon identifying a violation, we may, at our sole discretion and without prior notice:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Issue a warning to the account holder;</li>
                <li>Suspend or restrict access to some or all Platform features;</li>
                <li>Permanently terminate the account and all associated data;</li>
                <li>Remove or disable any content that violates this AUP;</li>
                <li>Notify and cooperate with law enforcement authorities.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. Reporting Violations</h2>
              <p>
                If you become aware of any use of the Platform that violates this AUP, please contact us immediately at <a href="mailto:legal@deepfolder.com" className="text-blue-600 hover:underline">legal@deepfolder.com</a>. We will investigate all reports in good faith.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. Liability</h2>
              <p>
                You are solely responsible for your use of the Platform and for any content you upload or transmit. You agree to indemnify DeepFolder against any claims, losses, or damages arising from your violation of this AUP or applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">7. Changes to This Policy</h2>
              <p>
                We may update this AUP from time to time. We will provide at least 14 days' notice of material changes via the Platform or by email. Continued use after the effective date constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">8. Contact</h2>
              <p>
                <strong>DeepFolder Legal Department</strong><br />
                Email: legal@deepfolder.com<br />
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
