import { LegalPageLayout } from "@/components/legal/legal-page-layout";

export default function TermsOfService() {
  return (
    <LegalPageLayout eyebrow="Terms" title="Terms of Service" summary="These terms govern access to Genius X1 and allocate responsibility for AI-assisted engineering calculations.">
      <section>
        <h2>1. Agreement and operator</h2>
        <p>These Terms form an agreement between the user and <strong>DeepFolder</strong>, Switzerland, the operator of Genius X1. By creating an account or using the service, you agree to these Terms and the incorporated <a href="/privacy-policy">Privacy Policy</a>, <a href="/cookie-policy">Cookie Policy</a>, and <a href="/legal">Legal Notice</a>. If you use the service for an organization, you confirm you are authorized to bind it.</p>
      </section>
      <section>
        <h2>2. Eligibility and accounts</h2>
        <p>You must be at least 18 and legally able to enter this agreement. Provide accurate information, protect credentials, use only accounts you are authorized to use, and notify us promptly of suspected compromise. Access may require approval and may be suspended to protect the service or enforce these Terms.</p>
      </section>
      <section>
        <h2>3. The service</h2>
        <p>Genius X1 helps users organize AI-assisted engineering calculations into editable worksheets with inputs, assumptions, equations, steps, results, references, attachments, comments, and versions. Features, providers, limits, and availability may change. Beta or experimental functions may be incomplete.</p>
      </section>
      <section>
        <h2>4. Engineering responsibility</h2>
        <p><strong>Genius X1 is a calculation aid, not a professional engineering service or design approval.</strong> AI output is probabilistic and may be inaccurate, fabricated, outdated, incomplete, or unsuitable. Deterministic arithmetic reduces—but does not eliminate—risk from incorrect formulas, units, assumptions, inputs, software, or omitted conditions.</p>
        <p className="mt-4">Before using an output, you must:</p>
        <ul className="mt-4">
          <li>independently reproduce and verify calculations, dimensions, unit conversions, assumptions, tolerances, safety factors, and boundary conditions;</li>
          <li>check citations against original, current, authoritative sources and applicable standards;</li>
          <li>consider all relevant load cases, failure modes, environmental conditions, manufacturer limits, and local laws;</li>
          <li>obtain review and approval from appropriately qualified and, where required, licensed professionals and authorities.</li>
        </ul>
        <p className="mt-4">You must not use Genius X1 as the sole basis for safety-critical or life-critical systems, structural approval, medical treatment or devices, aviation, automotive safety, nuclear systems, hazardous processes, regulatory certification, or any decision where an error could cause injury, death, environmental harm, or major property loss.</p>
      </section>
      <section>
        <h2>5. User content and confidentiality</h2>
        <p>You retain rights in content you submit. You grant DeepFolder a limited, non-exclusive permission to host, copy, transform, transmit, and process that content only as needed to provide, secure, support, and lawfully operate the service. You confirm you have the necessary rights and authority.</p>
        <p className="mt-4">Do not upload unlawful, infringing, malicious, personal, confidential, controlled, or restricted information unless you are authorized and the service arrangement is suitable. AI features may send relevant content to third-party AI providers as described in the Privacy Policy.</p>
      </section>
      <section>
        <h2>6. Acceptable use</h2>
        <p>You may not misuse the service, bypass access controls or limits, disrupt infrastructure, introduce malicious code, probe for vulnerabilities without written authorization, scrape or reverse engineer where prohibited by law, impersonate another person, violate intellectual-property or privacy rights, or use outputs to facilitate unlawful or harmful activity.</p>
      </section>
      <section>
        <h2>7. Intellectual property</h2>
        <p>DeepFolder and its licensors retain rights in the service, software, interface, and branding. These Terms grant only a limited, revocable, non-transferable right to use the service as intended. Third-party standards, references, models, and materials remain subject to their own rights and licenses.</p>
      </section>
      <section>
        <h2>8. Availability and changes</h2>
        <p>The service may be interrupted, changed, limited, or discontinued. We do not promise uninterrupted operation, preservation of every feature, or compatibility with every device, file, standard, provider, or jurisdiction. Keep independent copies of information needed for professional records.</p>
      </section>
      <section>
        <h2>9. Warranties</h2>
        <p>To the maximum extent permitted by law, the service and outputs are provided “as is” and “as available,” without express or implied warranties of accuracy, completeness, merchantability, fitness for a particular purpose, non-infringement, regulatory acceptance, or professional adequacy. Mandatory statutory rights remain unaffected.</p>
      </section>
      <section>
        <h2>10. Liability</h2>
        <p>To the maximum extent permitted by applicable law, DeepFolder is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, production, opportunity, or business interruption arising from the service or outputs. Any aggregate liability is limited to amounts paid for the service during the 12 months before the event giving rise to the claim.</p>
        <p className="mt-4">Nothing excludes liability that cannot legally be excluded, including liability arising from willful misconduct, gross negligence, death or personal injury where applicable, or mandatory consumer rights.</p>
      </section>
      <section>
        <h2>11. Suspension and termination</h2>
        <p>You may stop using the service at any time. We may suspend or terminate access for breach, security risk, legal requirements, nonpayment, or material harm to the service or others. Data handling after termination follows the Privacy Policy and any applicable agreement.</p>
      </section>
      <section>
        <h2>12. Governing law and disputes</h2>
        <p>These Terms are governed by Swiss law, excluding conflict-of-law rules. Courts at the operator’s Swiss place of establishment have jurisdiction, unless mandatory law grants another venue or right. Consumer and privacy rights that cannot be waived remain in force.</p>
      </section>
      <section>
        <h2>13. General terms</h2>
        <p>If a provision is unenforceable, the remaining provisions continue. Failure to enforce a provision is not a waiver. Signed customer terms prevail over these online Terms where they conflict. We may update these Terms prospectively and will provide notice where legally required.</p>
      </section>
      <section>
        <h2>14. Contact</h2>
        <p>Questions about these Terms: <a href="mailto:info@deepfolder.ai">info@deepfolder.ai</a>.</p>
      </section>
    </LegalPageLayout>
  );
}
