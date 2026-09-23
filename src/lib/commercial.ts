export const COMMERCIAL = Object.freeze({
  demoRequest: "/contact?enquiry=branded-demo",
  pilotRequest: "/contact?enquiry=paid-pilot",
  businessPath: "/business",
  demoPath: "/demo"
});

export function commercialEnquiry(value: unknown): { topic: "general" | "partnership"; message: string } {
  if (value === "branded-demo") return {
    topic: "partnership",
    message: "I would like a branded demo.\n\nOur product and website:\nOur audience and swap use case:\nNetworks we need:\n"
  };
  if (value === "paid-pilot") return {
    topic: "partnership",
    message: "I would like to discuss a paid pilot.\n\nOur product and website:\nDesired scope and networks:\nProvider accounts and operating arrangements:\nBudget range and preferred timeline:\n"
  };
  return { topic: "general", message: "" };
}
