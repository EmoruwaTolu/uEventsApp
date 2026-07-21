/**
 * mailer.ts — one place to send transactional email.
 * ─────────────────────────────────────────────────────────────────────────────
 * The provider is chosen from the environment, so switching later is just an env
 * change — no code edits. Priority (first configured wins):
 *
 *   1. Brevo   (current):  set BREVO_API_KEY        — HTTP API, works on Render
 *   2. Gmail   (SMTP):     set GMAIL_USER + GMAIL_APP_PASSWORD
 *   3. Resend:             set RESEND_API_KEY       — HTTP API, needs a verified domain
 *
 * Why Brevo and not Gmail on Render: Render blocks outbound SMTP ports (25/465/
 * 587), so SMTP providers like Gmail time out (ETIMEDOUT). Brevo and Resend send
 * over HTTPS (port 443), which isn't blocked. Brevo also lets you verify a single
 * sender address (e.g. a @gmail.com) without owning a domain.
 *
 * If nothing is configured, sending is a no-op (tokens are still created, so
 * dev/demo works without email). Every outcome is logged so failures are visible.
 *
 * Brevo setup: create a free account, verify your sender under
 * Senders, Domains & Dedicated IPs → Senders (click the link Brevo emails you),
 * then create an API key under SMTP & API → API Keys and set BREVO_API_KEY.
 * Set FROM_EMAIL to the verified sender and EMAIL_FROM_NAME to the display name.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ""); // app passwords are shown with spaces
const RESEND_API_KEY = process.env.RESEND_API_KEY;

type Provider = "brevo" | "gmail" | "resend" | "none";

function activeProvider(): Provider {
    if (BREVO_API_KEY) return "brevo";
    if (GMAIL_USER && GMAIL_APP_PASSWORD) return "gmail";
    if (RESEND_API_KEY) return "resend";
    return "none";
}

// The sender identity. Must be an address the provider has authorized:
// Brevo → a verified sender; Gmail → the authenticated account; Resend → a
// verified-domain address. EMAIL_FROM_NAME sets the display name.
function fromParts(): { name: string; email: string } {
    const name = process.env.EMAIL_FROM_NAME ?? "uEvents";
    const email = process.env.FROM_EMAIL ?? GMAIL_USER ?? "noreply@ueventsapp.com";
    return { name, email };
}
function fromLine(): string {
    const { name, email } = fromParts();
    return `${name} <${email}>`;
}

let gmailTransport: Transporter | null = null;
function getGmailTransport(): Transporter {
    if (!gmailTransport) {
        gmailTransport = nodemailer.createTransport({
            service: "gmail",
            auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        });
    }
    return gmailTransport;
}

let resendClient: Resend | null = null;
function getResend(): Resend {
    if (!resendClient) resendClient = new Resend(RESEND_API_KEY);
    return resendClient;
}

// Announce the active provider once at startup.
{
    const p = activeProvider();
    if (p === "none") {
        console.warn(
            "[email] No email provider configured — set BREVO_API_KEY (or GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY). " +
            "Emails will be SKIPPED (tokens are still created).",
        );
    } else {
        console.log(`[email] Provider: ${p} (from: ${fromLine()}).`);
    }
}

export function emailConfigured(): boolean {
    return activeProvider() !== "none";
}

/**
 * Send one transactional email. Never throws — failures are logged so the
 * calling request (e.g. forgot-password) still returns its normal response.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
    const provider = activeProvider();
    if (provider === "none") {
        console.warn(`[email] Skipped "${opts.subject}" to ${opts.to} — no email provider configured.`);
        return;
    }

    try {
        if (provider === "brevo") {
            const { name, email } = fromParts();
            const res = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "api-key": BREVO_API_KEY!,
                    "content-type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify({
                    sender: { name, email },
                    to: [{ email: opts.to }],
                    subject: opts.subject,
                    htmlContent: opts.html,
                }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                console.error(`[email] Brevo rejected "${opts.subject}" to ${opts.to} (HTTP ${res.status}): ${body}`);
            } else {
                const data: any = await res.json().catch(() => ({}));
                console.log(`[email] Brevo accepted "${opts.subject}" for ${opts.to} (id: ${data?.messageId}).`);
            }
        } else if (provider === "gmail") {
            const info = await getGmailTransport().sendMail({ from: fromLine(), to: opts.to, subject: opts.subject, html: opts.html });
            console.log(`[email] Gmail accepted "${opts.subject}" for ${opts.to} (id: ${info.messageId}).`);
        } else {
            // Resend returns { data, error } and does NOT throw on API errors
            // (e.g. an unverified sender domain), so read the error explicitly.
            const { data, error } = await getResend().emails.send({ from: fromLine(), to: opts.to, subject: opts.subject, html: opts.html });
            if (error) console.error(`[email] Resend rejected "${opts.subject}" to ${opts.to} (from ${fromLine()}):`, error);
            else console.log(`[email] Resend accepted "${opts.subject}" for ${opts.to} (id: ${data?.id}).`);
        }
    } catch (err) {
        console.error(`[email] Failed to send "${opts.subject}" to ${opts.to} via ${provider}:`, err);
    }
}
