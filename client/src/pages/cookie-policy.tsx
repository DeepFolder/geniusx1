import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CookiePolicy() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Cookie Policy</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Last updated: November 8, 2025
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version 1.0
            </p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">1. What Are Cookies</h2>
              <p>
                Cookies are small text files stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and enabling essential features.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">2. How We Use Cookies</h2>
              <p>
                DeepFolder uses cookies for the following purposes:
              </p>
            </section>

            <section>
              <h3 className="text-xl font-semibold mt-6 mb-3">2.1 Essential Cookies</h3>
              <p>
                These cookies are necessary for the Platform to function properly. They cannot be disabled.
              </p>
              <div className="mt-4">
                <table className="min-w-full border border-gray-300 dark:border-gray-700">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Cookie Name</th>
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Purpose</th>
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">connect.sid</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Session authentication - keeps you logged in</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Session (expires when you close browser or 7 days)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="text-xl font-semibold mt-6 mb-3">2.2 Functional Cookies</h3>
              <p>
                These cookies remember your preferences and choices to provide you with a personalized experience.
              </p>
              <div className="mt-4">
                <table className="min-w-full border border-gray-300 dark:border-gray-700">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Purpose</th>
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Examples</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Theme Preferences</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Dark mode/light mode selection</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Language Preferences</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Selected language</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">3. Third-Party Cookies</h2>
              <p>
                AI requests are processed by a server-side service:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>OpenAI:</strong> For AI-powered features (does not set cookies directly through our platform)</li>
              </ul>
              <p className="mt-4">
                These third parties have their own privacy policies governing their use of cookies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">4. What We Do NOT Use</h2>
              <p>
                DeepFolder does not use:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Advertising cookies:</strong> We do not track you for advertising purposes</li>
                <li><strong>Analytics cookies:</strong> We do not use third-party analytics tools like Google Analytics</li>
                <li><strong>Social media cookies:</strong> We do not integrate social media tracking pixels</li>
                <li><strong>Cross-site tracking:</strong> We do not track you across other websites</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">5. Managing Cookies</h2>
              
              <h3 className="text-xl font-semibold mt-6 mb-3">5.1 Browser Settings</h3>
              <p>
                Most browsers allow you to control cookies through their settings. You can:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Block all cookies</li>
                <li>Block third-party cookies only</li>
                <li>Delete cookies after each session</li>
                <li>Allow cookies from specific websites</li>
              </ul>
              <p className="mt-4">
                Please note that blocking essential cookies will prevent you from using key features of the Platform, including logging in.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">5.2 Browser-Specific Instructions</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
                <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
                <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
                <li><strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">6. Cookie Lifespan</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Session cookies:</strong> Deleted when you close your browser</li>
                <li><strong>Persistent cookies:</strong> Remain on your device for a set period (up to 7 days for authentication)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">7. Updates to This Policy</h2>
              <p>
                We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. Please review this page periodically for updates.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-8 mb-4">8. Contact Us</h2>
              <p>
                If you have questions about our use of cookies, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> privacy@deepfolder.com<br />
                <strong>Address:</strong> DeepFolder Privacy Team
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
