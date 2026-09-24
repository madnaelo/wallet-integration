import type { Metadata } from "next";
import Enquiries from "./Enquiries";
export const metadata: Metadata = { title: "Enquiries", robots: { index: false, follow: false }, alternates: { canonical: "/admin/enquiries" } };
export default function EnquiriesPage() { return <Enquiries />; }
