import { buyerPages } from "@/lib/growthContent";
import { GrowthPage, growthMetadata } from "@/components/GrowthPage";

const content = buyerPages.find(page => page.path === "/white-label-crypto-swap")!;
export const metadata = growthMetadata(content);
export default function Page() { return <GrowthPage page={content} />; }
