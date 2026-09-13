import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Last updated: November 8, 2025
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version 1.1
            </p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. Controller</h2>
              <p>
                <strong>DeepFolder</strong> ("DeepFolder", "we", "our", "us")
              </p>
              <p className="mt-2">
                Registered address: [ADDRESS], [POSTCODE CITY], Switzerland<br />
                Company ID (CHE): [CHE-NUMBER]<br />
                Email: privacy@deepfolder.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. Introduction</h2>
              <p>
                We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our B2B product-discovery platform. By using DeepFolder, you agree to this Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">3.1 Personal Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account data:</strong> Name, email, password, company affiliation, position, phone number</li>
                <li><strong>Profile data:</strong> Photo, bio, headline, LinkedIn URL, skills, experience, education</li>
                <li><strong>Communications:</strong> Messages, support tickets, and inquiries</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.2 Company Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Company profiles:</strong> Name, description, industry, location, contact info, certifications</li>
                <li><strong>Products:</strong> Names, descriptions, specifications, datasheets</li>
                <li><strong>3D Models:</strong> CAD/STEP files and related uploads</li>
                <li><strong>Documents:</strong> Catalogs, brochures, certificates, and business materials</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.3 Usage Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Activity:</strong> Pages viewed, search queries, downloads, follows</li>
                <li><strong>Interactions:</strong> Likes, favorites, comments, shares</li>
                <li><strong>AI Interactions:</strong> Questions asked and AI responses</li>
                <li><strong>Analytics:</strong> Time on platform, navigation patterns</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3.4 Technical Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Device information:</strong> IP, browser, OS, device type</li>
                <li><strong>Cookies:</strong> For authentication and preferences (see Cookie Policy)</li>
                <li><strong>Log data:</strong> Access times, error and performance logs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Platform operation and maintenance</li>
                <li>AI features (search, chat, recommendations via OpenAI services)</li>
                <li>Personalization and recommendations</li>
                <li>Communication and support</li>
                <li>Analytics and product improvement</li>
                <li>Security and fraud prevention</li>
                <li>Legal compliance and enforcement</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. Legal Bases for Processing</h2>
              <p>We process personal data based on:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Contract performance:</strong> To operate your account and deliver services</li>
                <li><strong>Legitimate interests:</strong> To improve functionality and ensure security</li>
                <li><strong>Consent:</strong> For marketing emails and AI personalization</li>
                <li><strong>Legal obligations:</strong> To comply with Swiss and EU law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. AI Features and Third-Party Processing</h2>
              <p>
                DeepFolder uses OpenAI GPT-4o to enable:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Semantic product search</li>
                <li>AI chat assistant for technical questions</li>
                <li>Automatic specification extraction from datasheets</li>
                <li>Recommendation and matching features</li>
              </ul>
              <p className="mt-4">
                Your queries and context (product or company data) may be processed by OpenAI to generate responses. We do not share personal user data beyond what is necessary. See <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI Privacy Policy</a> for details.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">7. Data Sharing and Disclosure</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">7.1 Public Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Company profiles and product pages are publicly visible</li>
                <li>Professional user profiles (if set to public)</li>
                <li>Posts and updates published by companies</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">7.2 With Your Consent</h3>
              <p>We share data with third parties only with your explicit consent.</p>

              <h3 className="text-xl font-semibold mt-6 mb-3">7.3 Service Providers</h3>
              <p>We use trusted processors for:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Hosting (Replit) and database (Neon Database)</li>
                <li>AI services (OpenAI)</li>
                <li>Email and support communication</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">7.4 Legal Requirements</h3>
              <p>We may disclose information when required by law or to protect rights and safety.</p>

              <h3 className="text-xl font-semibold mt-6 mb-3">7.5 Sub-Processors</h3>
              <p>A list of current sub-processors is available at /legal/subprocessors.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">8. Data Storage and Security</h2>
              <p>
                We implement appropriate technical and organizational measures:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>TLS/HTTPS encryption</li>
                <li>Secure password hashing (bcrypt)</li>
                <li>Session-based authentication with httpOnly cookies</li>
                <li>Access controls and role-based permissions</li>
                <li>Regular security audits and incident logging</li>
              </ul>
              <p className="mt-4">
                Data is stored on secure servers within the EU and Switzerland. When data is transferred outside these regions (e.g. to OpenAI in the US), we rely on Standard Contractual Clauses (Art. 46 GDPR) to ensure adequate protection.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">9. Your Data Rights</h2>
              <p>You may exercise the following rights under GDPR and nFADP:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Access:</strong> Receive a copy of your data</li>
                <li><strong>Correction:</strong> Fix inaccurate information</li>
                <li><strong>Deletion:</strong> Request account and data erasure</li>
                <li><strong>Restriction:</strong> Limit certain processing</li>
                <li><strong>Objection:</strong> Object to processing based on legitimate interest</li>
                <li><strong>Portability:</strong> Export your data (JSON format)</li>
              </ul>
              <p className="mt-4">
                Contact us or use your account settings to exercise these rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">10. Data Retention</h2>
              <p>
                Personal data is retained while your account is active or as required by law. Upon account deletion, we erase personal data within 30 days, except where legal retention is required.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">11. Children's Privacy</h2>
              <p>
                DeepFolder is intended for business professionals. We do not knowingly collect data from individuals under 18.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">12. International Data Transfers</h2>
              <p>
                Data may be processed in countries other than your own. We apply appropriate safeguards to maintain equivalent data protection standards.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">13. Changes to This Policy</h2>
              <p>
                We may update this Policy as needed. Material changes will be announced on our platform or by email. Continued use after such changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">14. Jurisdiction</h2>
              <p>
                This Privacy Policy is governed by Swiss law. All disputes are subject to the exclusive jurisdiction of the courts of Zug, Switzerland.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">15. Contact</h2>
              <p>
                <strong>DeepFolder Privacy Team</strong><br />
                Email: privacy@deepfolder.com<br />
                Address: [ADDRESS], [POSTCODE CITY], Switzerland
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Version 1.1 — Published November 8 2025<br />
                © DeepFolder. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
