import { buyerPages } from "@/lib/growthContent";
import { GrowthPage, growthMetadata } from "@/components/GrowthPage";

const content = buyerPages.find(page => page.path === "/for-wallets")!;
export const metadata = growthMetadata(content);
export default function Page() { return <GrowthPage page={content} />; }
