export const COMMERCIAL = Object.freeze({
  demoRequest: "/contact?enquiry=branded-demo",
  pilotRequest: "/contact?enquiry=paid-pilot",
  businessPath: "/business",
  demoPath: "/demo"
});

export function commercialEnquiry(value: unknown): {
  topic: "general" | "partnership";
  message: string;
  heading: string;
  introduction: string;
} {
  if (value === "branded-demo") return {
    topic: "partnership",
    heading: "Request a branded demo",
    introduction: "Tell us a little about your product and the swap journey you want to evaluate. Our first response reviews fit and scope by email; a call is optional. No wallet connection is needed.",
    message: "I would like a branded demo.\n\nOur product and website:\nOur audience and swap use case:\nNetworks we need:\n"
  };
  if (value === "paid-pilot") return {
    topic: "partnership",
    heading: "Discuss a paid pilot",
    introduction: "Outline the integration you have in mind and what your team needs to evaluate. Our first response reviews fit and scope by email, before any proposal or commitment; a call is optional. No wallet connection is needed.",
    message: "I would like to discuss a paid pilot.\n\nOur product and website:\nDesired scope and networks:\nProvider accounts and operating arrangements:\nBudget range and preferred timeline:\n"
  };
  return {
    topic: "general", message: "",
    heading: "How can we help?",
    introduction: "Send a support, privacy, partnership, or legal question. You do not need to connect or sign in with a wallet."
  };
}
