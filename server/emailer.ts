import nodemailer from 'nodemailer'

// Mirrors the VAPID pattern in pushRepo.ts: works out of the box in dev
// (logs the email to the console instead of sending it, so the reset link
// is still usable while testing), and sends for real in production once
// SMTP_HOST/PORT/USER/PASS are set as env vars — any provider that speaks
// SMTP works (Resend, Mailgun, Postmark, even Gmail for low volume).
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

const FROM = process.env.SMTP_FROM ?? 'Prompt <no-reply@example.com>'

// Best-effort, like notifyAccount in pushRepo.ts — a mail failure should
// never surface as a 500 to whoever triggered it (a password-reset request
// still returns success either way, so as not to leak whether an email
// address has an account — see authRoutes.ts).
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.log(`[dev email — SMTP not configured] To: ${to}\nSubject: ${subject}\n\n${text}`)
    return
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, text })
  } catch (err) {
    console.error('email send failed', err)
  }
}
