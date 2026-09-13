interface SendEmailOptions {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn(`⚠️ [Mailer] SMTP not configured — skipping email to ${opts.to} (subject: "${opts.subject}")`);
    return;
  }

  // Resolve from: explicit caller override → SMTP_FROM env → SMTP_USER (always a real mailbox)
  const resolvedFrom = opts.from
    ?? process.env.SMTP_FROM
    ?? `"DeepFolder" <${smtpUser}>`;

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: resolvedFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  console.log(`✅ [Mailer] Email sent to ${opts.to} (subject: "${opts.subject}")`);
}
