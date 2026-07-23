import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Swap Assistant about support, privacy, partnerships, or legal questions.",
  alternates: {
    canonical: "/contact"
  },
  openGraph: {
    title: "Contact Swap Assistant",
    description: "Send Swap Assistant a support, privacy, partnership, or legal message.",
    url: "/contact"
  }
};

export default function ContactPage() {
  return (
    <main className="contactPage">
      <header className="contactHeader">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <p className="contactEyebrow">Contact Swap Assistant</p>
        <h1>How can we help?</h1>
        <p>
          Send a support, privacy, partnership, or legal question. You do not
          need to connect or sign in with a wallet.
        </p>
      </header>

      <div className="contactLayout">
        <ContactForm />
        <aside className="contactAside" aria-labelledby="contact-safety-title">
          <h2 id="contact-safety-title">Before you send</h2>
          <ul>
            <li>Never include a seed phrase, private key, password, or one-time code.</li>
            <li>For a swap problem, include the network and public transaction hash when available.</li>
            <li>Contact messages are normally retained for up to 365 days.</li>
          </ul>
          <p>
            Details are used to review and respond to your message. Read the{" "}
            <Link href="/privacy">Privacy Notice</Link> for more information.
          </p>
        </aside>
      </div>
    </main>
  );
}
