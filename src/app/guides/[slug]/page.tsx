import { notFound } from "next/navigation";
import { guidePages } from "@/lib/growthContent";
import { GrowthPage, growthMetadata } from "@/components/GrowthPage";
export const dynamicParams = false;
export function generateStaticParams() { return guidePages.map(page => ({ slug: page.path.split("/").at(-1)! })); }
async function content(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return guidePages.find(page => page.path === "/guides/" + slug) ?? notFound();
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return growthMetadata(await content(params)); }
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) { return <GrowthPage page={await content(params)} guide />; }
