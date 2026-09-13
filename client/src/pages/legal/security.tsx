import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Eye, Clock, AlertTriangle, CheckCircle } from "lucide-react";

const sections = [
  {
    icon: Lock,
    title: "Encryption",
    items: [
      { label: "At rest", detail: "All data stored in Neon PostgreSQL and Google Cloud Storage is encrypted using AES-256. Encryption is managed at the infrastructure level by the respective cloud provider." },
      { label: "In transit", detail: "All connections between clients and DeepFolder servers, and between DeepFolder and its sub-processors, use TLS 1.2 or higher. TLS 1.3 is preferred and enforced where supported." },
      { label: "Passwords", detail: "User passwords are hashed with bcrypt (cost factor ≥ 12) before storage. Plaintext passwords are never persisted." },
    ],
  },
  {
    icon: Eye,
    title: "Access Controls",
    items: [
      { label: "Role-based access", detail: "The platform enforces four distinct roles: Public, Company Member, Company Admin, and Platform Admin. Each role has strictly scoped permissions. Role changes require admin action." },
      { label: "Session management", detail: "Sessions are stored server-side using httpOnly, SameSite=Lax cookies. Session tokens are regenerated on privilege escalation. Inactive sessions expire after 24 hours." },
      { label: "Internal access", detail: "DeepFolder staff access to production data is restricted to authorised personnel. Access is logged and reviewed periodically." },
      { label: "Approval gate", detail: "New user registrations are not activated until explicitly approved by a platform administrator, preventing unauthorised access from the start." },
    ],
  },
  {
    icon: Clock,
    title: "Audit Logging",
    items: [
      { label: "User activity", detail: "Key user actions (searches, downloads, company views, admin operations) are recorded in the user_activity table with timestamps and metadata." },
      { label: "Admin actions", detail: "Administrative operations — including user suspension, role changes, and data deletion — are logged with the acting administrator's identity." },
      { label: "Search usage", detail: "AI search queries and results are logged in the hybrid_search_usage table for analytics and abuse monitoring. Logs include anonymised metadata." },
    ],
  },
  {
    icon: Shield,
    title: "Backup and Recovery",
    items: [
      { label: "Database backups", detail: "Neon PostgreSQL provides continuous write-ahead logging with point-in-time recovery (PITR) up to 7 days. Backups are replicated across availability zones." },
      { label: "File storage backups", detail: "Google Cloud Storage objects are stored with default geographic redundancy. Object versioning is enabled to allow recovery from accidental deletion." },
      { label: "Recovery objective", detail: "Target Recovery Point Objective (RPO): 1 hour. Target Recovery Time Objective (RTO): 4 hours for critical systems." },
    ],
  },
  {
    icon: AlertTriangle,
    title: "Incident Response",
    items: [
      { label: "Detection", detail: "Anomalous activity, elevated error rates, and authentication failures trigger internal alerts monitored by the engineering team." },
      { label: "Containment", detail: "Suspected compromised accounts or systems are isolated within 1 hour of confirmed incident detection." },
      { label: "Notification", detail: "In the event of a personal data breach, affected customers will be notified within 72 hours in accordance with GDPR Art. 33 and our Data Processing Agreement." },
      { label: "Post-incident review", detail: "All significant incidents undergo a root-cause analysis. Findings are used to update controls and prevent recurrence." },
    ],
  },
  {
    icon: CheckCircle,
    title: "Certifications Roadmap",
    items: [
      { label: "ISO 27001", detail: "DeepFolder is working towards ISO 27001 certification. Gap analysis is underway; target certification date is Q4 2026." },
      { label: "SOC 2 Type II", detail: "SOC 2 Type II audit is planned to follow ISO 27001 certification, covering availability, security, and confidentiality trust service criteria." },
      { label: "GDPR compliance", detail: "DeepFolder maintains internal data mapping, processes DSAR requests, and has appointed an internal data protection contact. DPA available at /legal/dpa." },
    ],
  },
];

export default function SecurityWhitepaper() {
  return (
    <div className="relative min-h-screen modern-4k-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Security Whitepaper</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last updated: June 13, 2026</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Version 1.0</p>
          </CardHeader>
          <CardContent className="space-y-8">
            <p className="text-gray-700 dark:text-gray-300">
              This document outlines the security controls, practices, and roadmap employed by DeepFolder to protect customer data. We are committed to transparency and continuous improvement of our security posture.
            </p>

            {sections.map(({ icon: Icon, title, items }) => (
              <section key={title}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold">{title}</h2>
                </div>
                <div className="space-y-4 pl-2">
                  {items.map(({ label, detail }) => (
                    <div key={label} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{label}</p>
                      <p className="text-gray-700 dark:text-gray-300 text-sm">{detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section>
              <h2 className="text-2xl font-bold mt-4 mb-4">Responsible Disclosure</h2>
              <p className="text-gray-700 dark:text-gray-300">
                If you discover a security vulnerability in the DeepFolder platform, please report it to <a href="mailto:security@deepfolder.com" className="text-blue-600 hover:underline">security@deepfolder.com</a>. We ask that you give us a reasonable opportunity to remediate the issue before public disclosure. We do not pursue legal action against researchers who act in good faith.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mt-4 mb-4">Contact</h2>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>DeepFolder Security Team</strong><br />
                Email: security@deepfolder.com<br />
                General privacy enquiries: privacy@deepfolder.com
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
