import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfService() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Last updated: November 8, 2025
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version 1.0
            </p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing or using DeepFolder ("Platform," "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, you may not access or use the Platform.
              </p>
              <p className="mt-4">
                <strong>Operator:</strong> DeepFolder, [ADDRESS], [POSTCODE CITY], Switzerland<br />
                <strong>Company ID (CHE):</strong> [CHE-NUMBER]<br />
                <strong>Contact:</strong> legal@deepfolder.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. Eligibility</h2>
              <p>
                The Platform is intended for professional and business use only. You must be at least 18 years old and have the authority to represent your company or employer.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Description of Service</h2>
              <p>
                DeepFolder is a B2B product discovery platform that enables companies to showcase products, connect with partners, and discover business opportunities. Features include:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Company profiles and product catalogs</li>
                <li>AI-powered search and recommendations</li>
                <li>3D product visualization</li>
                <li>Document sharing and downloads</li>
                <li>Business networking and communication tools</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. User Accounts</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">4.1 Registration</h3>
              <p>
                To access certain features, you must create an account and agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Provide accurate and complete registration data</li>
                <li>Maintain the confidentiality of your password</li>
                <li>Notify us of any unauthorized access</li>
                <li>Remain responsible for all activity under your account</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">4.2 Account Types</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Public Users:</strong> Browse and search the platform</li>
                <li><strong>Company Admins:</strong> Manage company profiles and content</li>
                <li><strong>Platform Admins:</strong> Administrative access</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">4.3 Account Suspension</h3>
              <p>
                We reserve the right to suspend or terminate accounts that violate these Terms or engage in prohibited activity.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. User Content and Uploads</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Your Content</h3>
              <p>
                You retain ownership of all content you upload ("User Content"), including company data, products, 3D models, documents, and communications.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">5.2 License Grant</h3>
              <p>
                By uploading User Content, you grant DeepFolder a worldwide, non-exclusive, royalty-free license to host, display, and process your content solely for operating and improving the Platform. You may revoke this license by deleting your content or account, except where data retention is required by law.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">5.3 Representations and Warranties</h3>
              <p>You confirm that:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>You own or have rights to upload the content</li>
                <li>It does not infringe third-party rights or laws</li>
                <li>Product data is accurate and lawful to publish</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">5.4 Restrictions</h3>
              <p>You may not upload content that:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Contains malware or harmful code</li>
                <li>Infringes intellectual property rights</li>
                <li>Is false, misleading, or illegal</li>
                <li>Violates data protection or confidentiality obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. Intellectual Property</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">6.1 Platform Ownership</h3>
              <p>
                All DeepFolder software, design, and branding are the property of DeepFolder and protected by law. You may not reproduce or distribute platform materials without prior written consent.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">6.2 Trademarks</h3>
              <p>
                "DeepFolder" and the DeepFolder logo are trademarks of DeepFolder. Unauthorized use is prohibited.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">6.3 3D Models and CAD Files</h3>
              <p>
                Uploaded 3D models remain the property of the submitting company. Downloads are governed by the terms defined by the uploader.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">7. Prohibited Activities</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Use the Platform for unlawful purposes</li>
                <li>Attempt to gain unauthorized access</li>
                <li>Interfere with operation or security</li>
                <li>Scrape, crawl, or harvest data</li>
                <li>Impersonate others or misrepresent affiliation</li>
                <li>Upload harmful, infringing, or confidential content</li>
                <li>Engage in spam, phishing, or fraudulent behavior</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">8. AI Features and Limitations</h2>
              <p>
                DeepFolder uses AI technology (OpenAI GPT-4o) for search, recommendations, and product intelligence. You acknowledge that:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>AI responses may not always be accurate or complete</li>
                <li>AI does not replace professional judgment</li>
                <li>You must verify technical data from original sources</li>
                <li>DeepFolder discloses AI use transparently and maintains human oversight as required by EU AI Act Article 52</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">9. Disclaimer of Warranties</h2>
              <p>
                THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE." WE MAKE NO WARRANTIES, EXPRESS OR IMPLIED, THAT:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>The Platform will operate without interruption or errors</li>
                <li>Defects will be corrected</li>
                <li>The Platform is free of viruses or vulnerabilities</li>
                <li>Information is accurate, complete, or reliable</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, DEEPFOLDER SHALL NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Indirect, incidental, or consequential damages</li>
                <li>Loss of profits, data, or business opportunities</li>
                <li>Damages arising from use of or inability to use the Platform</li>
                <li>Unauthorized access or alteration of your data</li>
              </ul>
              <p className="mt-4">
                IN ANY CASE, OUR TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID BY YOU IN THE PAST 12 MONTHS. Nothing in these Terms limits liability for gross negligence, willful misconduct, or mandatory statutory obligations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">11. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless DeepFolder from any claims, damages, or losses arising from:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Your use of the Platform</li>
                <li>Your User Content</li>
                <li>Your violation of these Terms or third-party rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">12. Data Protection</h2>
              <p>
                Your use of the Platform is governed by our <a href="/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</a>. By using the Platform, you consent to our data collection and use practices as described therein.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">13. Modifications to Service</h2>
              <p>
                We may modify, suspend, or discontinue features at any time. Where feasible, advance notice will be given for material changes affecting paid subscriptions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">14. Changes to Terms</h2>
              <p>
                We may update these Terms periodically. Material updates will be communicated via the Platform or by email. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">15. Termination</h2>
              <p>
                We may suspend or terminate access immediately for breach of these Terms. Upon termination, your right to use the Platform ceases immediately, and related data may be deleted.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">16. Governing Law and Jurisdiction</h2>
              <p>
                These Terms are governed by Swiss law, excluding conflict-of-law principles. All disputes shall be subject to the exclusive jurisdiction of the courts of Zug, Switzerland.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">17. Severability</h2>
              <p>
                If any provision of these Terms is held invalid, the remaining provisions remain in full effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">18. Force Majeure</h2>
              <p>
                DeepFolder shall not be liable for any failure or delay caused by events beyond its reasonable control, including natural disasters, network outages, or government restrictions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">19. Contact</h2>
              <p>
                <strong>DeepFolder Legal Department</strong><br />
                Email: legal@deepfolder.com<br />
                Address: [ADDRESS], [POSTCODE CITY], Switzerland
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Version 1.0 — Published November 8 2025<br />
                © DeepFolder. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
