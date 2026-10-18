import { redirect } from "next/navigation";
import { Source_Serif_4 } from "next/font/google";
import { getCurrentUserProfile } from "@/lib/supabase/queries";
import { SlidesClient } from "./SlidesClient";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["600", "700"] });

// Same Admin-only gate as /presentation (see src/proxy.ts) — this is a
// full-screen deck, deliberately rendered without AppShell/Sidebar so it
// reads like an actual presentation rather than another app page.
export default async function PresentationSlidesPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "Admin") {
    redirect("/dashboard");
  }

  return <SlidesClient serifClass={serif.className} />;
}
