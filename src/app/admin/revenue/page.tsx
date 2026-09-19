import type { Metadata } from "next";
import RevenueDashboard from "./RevenueDashboard";

export const metadata: Metadata = {
  title: "Revenue", robots: { index: false, follow: false },
  alternates: { canonical: "/admin/revenue" }
};

export default function RevenuePage() { return <RevenueDashboard />; }
