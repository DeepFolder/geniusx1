import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const subprocessors = [
  {
    name: "OpenAI",
    country: "USA",
    dataCategory: "AI inference — search queries, product descriptions, user-submitted text",
    purpose: "AI-powered search, recommendations, and content analysis",
    dpaLink: "https://openai.com/policies/data-processing-addendum",
  },
  {
    name: "Hostinger",
    country: "Deployment-specific server location",
    dataCategory: "Application runtime, account and calculation data, and uploaded files",
    purpose: "VPS hosting for the application, its PostgreSQL database, and private file storage",
    dpaLink: "https://www.hostinger.com/legal/privacy-policy",
  },
  {
    name: "Email provider (SMTP / transactional)",
    country: "EU / USA (provider-dependent)",
    dataCategory: "Transactional email content — admin alert notifications, system emails; no end-user marketing data",
    purpose: "Sending system notification emails (e.g. copyright complaint alerts to the legal team)",
    dpaLink: "https://gdpr.eu/email-encryption/",
  },
];

export default function SubprocessorList() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Sub-Processor List</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last updated: September 14, 2026</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-700 dark:text-gray-300">
              DeepFolder ("DeepFolder") engages the following third-party sub-processors to deliver its platform services. Each sub-processor has been evaluated for compliance with applicable data protection requirements, and DeepFolder has entered into appropriate data processing agreements with each of them.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              This list is maintained in accordance with DeepFolder's obligations under Art. 28(2) GDPR and the <a href="/legal/dpa" className="text-blue-600 hover:underline">Data Processing Agreement</a>. Customers will be notified at least 30 days before any new sub-processor is added.
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700 rounded-lg">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-semibold">Sub-Processor</th>
                    <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-semibold">Country</th>
                    <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-semibold">Data Category</th>
                    <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-semibold">Purpose</th>
                    <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-semibold">Privacy / DPA</th>
                  </tr>
                </thead>
                <tbody>
                  {subprocessors.map((sp, i) => (
                    <tr key={sp.name} className={i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-medium">{sp.name}</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm">{sp.country}</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm">{sp.dataCategory}</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm">{sp.purpose}</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm">
                        <a
                          href={sp.dpaLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Changelog</h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li><strong>September 14, 2026</strong> — Hosting, database, and file storage use the application's own Hostinger VPS deployment.</li>
              </ul>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Questions? Contact us at <a href="mailto:privacy@deepfolder.com" className="text-blue-600 hover:underline">privacy@deepfolder.com</a>.
            </p>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                © DeepFolder. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
