import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";
import { commercialEnquiry } from "@/lib/commercial";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact " + BRAND.name + " about support, privacy, partnerships, or legal questions.",
  alternates: {
    canonical: "/contact"
  },
  openGraph: {
    title: "Contact " + BRAND.name,
    description: "Send " + BRAND.name + " a support, privacy, partnership, or legal message.",
    url: "/contact"
  }
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ enquiry?: string | string[] }> }) {
  const enquiry = commercialEnquiry((await searchParams).enquiry);
  return (
    <main className="contactPage">
      <header className="contactHeader">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <p className="contactEyebrow">Contact {BRAND.name}</p>
        <h1>How can we help?</h1>
        <p>
          Send a support, privacy, partnership, or legal question. You do not
          need to connect or sign in with a wallet.
        </p>
      </header>

      <div className="contactLayout">
        <ContactForm initialTopic={enquiry.topic} initialMessage={enquiry.message} />
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
