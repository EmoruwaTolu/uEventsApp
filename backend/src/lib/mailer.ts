/**
 * mailer.ts — one place to send transactional email.
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider is chosen from the environment, so switching later is just an env
 * change — no code edits:
 *
 *   • Gmail SMTP (current):  set GMAIL_USER + GMAIL_APP_PASSWORD
 *   • Resend (later):        set RESEND_API_KEY  (and a verified FROM_EMAIL)
 *
 * If Gmail creds are present they win; otherwise Resend is used if configured;
 * otherwise sending is a no-op (tokens are still created, so dev/demo works
 * without any email set up). Every outcome is logged so failures are visible in
 * the server logs rather than silently swallowed.
 *
 * Gmail App Password: with 2-Step Verification on your Google account, go to
 * https://myaccount.google.com/apppasswords, generate a 16-character password,
 * and set GMAIL_APP_PASSWORD to it (spaces optional). Gmail SMTP sends from your
 * own address with no domain to verify — ~500 recipients/day.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ""); // app passwords are shown with spaces
const RESEND_API_KEY = process.env.RESEND_API_KEY;

type Provider = "gmail" | "resend" | "none";

function activeProvider(): Provider {
    if (GMAIL_USER && GMAIL_APP_PASSWORD) return "gmail";
    if (RESEND_API_KEY) return "resend";
    return "none";
}

// The "from" line. Gmail requires this to be your authenticated address (or a
// configured "send-as" alias), so it defaults to GMAIL_USER; Resend uses your
// verified FROM_EMAIL. EMAIL_FROM_NAME sets the display name.
function fromAddress(): string {
    const name = process.env.EMAIL_FROM_NAME ?? "uEvents";
    const addr =
        activeProvider() === "gmail"
            ? (process.env.FROM_EMAIL ?? GMAIL_USER)
            : (process.env.FROM_EMAIL ?? "noreply@ueventsapp.com");
    return `${name} <${addr}>`;
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
            "[email] No email provider configured — set GMAIL_USER + GMAIL_APP_PASSWORD (or RESEND_API_KEY). " +
            "Emails will be SKIPPED (tokens are still created).",
        );
    } else {
        console.log(`[email] Provider: ${p} (from: ${fromAddress()}).`);
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

    const from = fromAddress();
    try {
        if (provider === "gmail") {
            const info = await getGmailTransport().sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
            console.log(`[email] Gmail accepted "${opts.subject}" for ${opts.to} (id: ${info.messageId}).`);
        } else {
            // Resend returns { data, error } and does NOT throw on API errors
            // (e.g. an unverified sender domain), so read the error explicitly.
            const { data, error } = await getResend().emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
            if (error) console.error(`[email] Resend rejected "${opts.subject}" to ${opts.to} (from ${from}):`, error);
            else console.log(`[email] Resend accepted "${opts.subject}" for ${opts.to} (id: ${data?.id}).`);
        }
    } catch (err) {
        console.error(`[email] Failed to send "${opts.subject}" to ${opts.to} via ${provider}:`, err);
    }
}
