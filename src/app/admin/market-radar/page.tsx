import type { Metadata } from "next";
import PrivateRadar from "./PrivateRadar";

export const metadata: Metadata = {
  title: "Private Market Radar",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/market-radar" },
};
export default function PrivateRadarPage() {
  return <PrivateRadar />;
}
