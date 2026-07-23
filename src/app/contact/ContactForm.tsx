"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  BackendClientError,
  submitContact,
  type ContactSubmissionRequest
} from "@/lib/backendClient";
import { envPublic } from "@/lib/envPublic";

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const request: ContactSubmissionRequest = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      topic: String(data.get("topic") ?? "general") as ContactSubmissionRequest["topic"],
      message: String(data.get("message") ?? ""),
      website: String(data.get("website") ?? "")
    };

    setFormState("submitting");
    setMessage("");
    try {
      await submitContact(envPublic.BACKEND_BASE_URL, request);
      form.reset();
      setFormState("success");
      setMessage("Thanks. Your message has been received.");
    } catch (error) {
      setFormState("error");
      setMessage(contactErrorMessage(error));
    }
  }

  return (
    <section className="contactFormSection" aria-labelledby="contact-form-title">
      <h2 id="contact-form-title">Send a message</h2>
      <p className="contactFormIntro">
        Fields marked with an asterisk are required. We will reply using the
        email address you provide.
      </p>

      <form className="contactForm" onSubmit={handleSubmit}>
        <div className="contactWebsiteTrap" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="contactField">
          <label htmlFor="contact-name">Name <span>(optional)</span></label>
          <input
            className="contactInput"
            id="contact-name"
            name="name"
            type="text"
            maxLength={80}
            autoComplete="name"
          />
        </div>

        <div className="contactField">
          <label htmlFor="contact-email">Email address *</label>
          <input
            className="contactInput"
            id="contact-email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            required
          />
        </div>

        <div className="contactField">
          <label htmlFor="contact-topic">Topic *</label>
          <select className="contactInput" id="contact-topic" name="topic" defaultValue="general" required>
            <option value="general">General question</option>
            <option value="technical">Technical problem</option>
            <option value="privacy">Privacy request</option>
            <option value="partnership">Partnership</option>
            <option value="legal">Legal or regulatory</option>
          </select>
        </div>

        <div className="contactField">
          <label htmlFor="contact-message">Message *</label>
          <textarea
            className="contactInput contactTextarea"
            id="contact-message"
            name="message"
            minLength={10}
            maxLength={3000}
            rows={7}
            required
          />
          <small>10 to 3,000 characters.</small>
        </div>

        <label className="contactConsent">
          <input name="privacyAccepted" type="checkbox" required />
          <span>
            I understand that my details will be stored so Swap Assistant can
            review and respond to this message, as described in the{" "}
            <Link href="/privacy">Privacy Notice</Link>.
          </span>
        </label>

        <div className="contactActions">
          <button className="btn btnPrimary contactSubmit" type="submit" disabled={formState === "submitting"}>
            {formState === "submitting" ? (
              <>
                <span className="contactSpinner" aria-hidden="true" />
                Sending
              </>
            ) : (
              "Send message"
            )}
          </button>
          <div
            className={formState === "error" ? "contactStatus contactStatusError" : "contactStatus"}
            role={formState === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {message}
          </div>
        </div>
      </form>
    </section>
  );
}

function contactErrorMessage(error: unknown): string {
  if (error instanceof BackendClientError && error.status === 429) {
    return "You have sent several messages recently. Please wait before trying again.";
  }
  if (error instanceof BackendClientError && error.status >= 400 && error.status < 500) {
    return "Please check the form and try again.";
  }
  return "Your message could not be sent right now. Please try again shortly.";
}
