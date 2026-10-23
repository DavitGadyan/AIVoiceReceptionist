import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hero } from "@/components/marketing/Hero";
import { INDUSTRY_PHOTOS } from "@/components/marketing/industryPhotos";
import { About, Cta, Features, Footer, Industries, Pricing, Process } from "@/components/marketing/Sections";
import { Aurora } from "@/components/ui/Aurora";

/** Resolved at build time: industry cards only request photos that exist in public/images. */
function availablePhotos(): string[] {
  return INDUSTRY_PHOTOS.filter((p) => existsSync(join(process.cwd(), "public", "images", `industry-${p}.jpg`)));
}

export default function Home() {
  return (
    <main data-theme="dark" className="relative isolate bg-night text-white">
      <Aurora />
      <Hero />
      <About />
      <Process />
      <Industries photos={availablePhotos()} />
      <Features />
      <Pricing />
      <Cta />
      <Footer />
    </main>
  );
}
