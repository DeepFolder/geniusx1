import { Link } from "wouter";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export default function LegalNotice() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Legal notice" summary="Operator information, engineering-use notices, intellectual-property terms, and the policies governing Genius X1.">
      <section>
        <h2>Operator</h2>
        <p><strong>Genius X1</strong> is operated by <strong>DeepFolder</strong>, Switzerland.</p>
        <p className="mt-3">General and statutory inquiries: <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a></p>
      </section>
      <section>
        <h2>Engineering and AI notice</h2>
        <p>Genius X1 is AI-assisted calculation software. It is not a licensed engineer, engineering consultancy, testing laboratory, certification body, notified body, authority having jurisdiction, or substitute for professional services.</p>
        <ul className="mt-4">
          <li>AI-generated methods, equations, assumptions, references, and explanations can be incomplete, outdated, inapplicable, or wrong.</li>
          <li>Calculated values can be affected by incorrect inputs, units, boundary conditions, simplifications, software defects, or omitted load cases.</li>
          <li>Every output must be independently checked against original sources, current standards, manufacturer information, project requirements, and applicable law.</li>
          <li>Only an appropriately qualified and, where required, licensed professional may approve or certify engineering work.</li>
        </ul>
        <p className="mt-4"><strong>Do not rely on Genius X1 as the sole basis for construction, manufacture, procurement, operation, maintenance, regulatory submission, or any safety-critical or life-critical decision.</strong></p>
      </section>
      <section>
        <h2>Policies</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Privacy Policy", "/privacy-policy", "How account, calculation, technical, and AI-service data is handled."],
            ["Terms of Service", "/terms-of-service", "Rules and responsibilities for using the service."],
            ["Cookie Policy", "/cookie-policy", "Necessary cookies and browser storage used by Genius X1."],
            ["About", "/about", "The intended calculation workflow and role of human review."],
          ].map(([title, href, text]) => (
            <Link key={href} href={href} className="rounded-2xl border border-slate-200 p-5 no-underline transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:border-blue-800 dark:hover:bg-blue-950/20">
              <span className="block font-semibold text-slate-950 dark:text-white">{title}</span>
              <span className="mt-2 block text-sm font-normal text-slate-600 dark:text-slate-300">{text}</span>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2>Intellectual property and third-party material</h2>
        <p>Genius X1 software, interface, text, and branding are protected by applicable intellectual-property laws. Users retain rights in content they submit, subject to the limited processing permission needed to provide the service. References, standards, manufacturer data, and other third-party materials remain subject to their owners’ rights and terms.</p>
      </section>
      <section>
        <h2>Copyright and content reports</h2>
        <p>To report allegedly infringing, unlawful, or unsafe content, email <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a> with the affected location, the basis of the report, your contact information, and supporting evidence. Do not include confidential information unless necessary and authorized.</p>
      </section>
      <section>
        <h2>Governing documents</h2>
        <p>If this notice conflicts with a signed customer agreement, the signed agreement controls to the extent of the conflict. Mandatory consumer, data-protection, product-safety, and professional-responsibility laws remain unaffected.</p>
      </section>
    </LegalPageLayout>
  );
}
