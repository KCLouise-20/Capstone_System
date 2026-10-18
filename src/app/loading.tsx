import Image from "next/image";
import { Loader2 } from "lucide-react";

// App Router convention: this is the Suspense fallback for every route
// under the root layout, so it shows automatically on any navigation
// while the destination page's server-side data is being fetched — one
// file covers every page for every role, no per-page wiring needed. A
// more specific loading.tsx nested under a route folder would override
// this just for that route, but none exist, so this is the only one.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <Image src="/ustp-wordmark.png" alt="USTP" width={700} height={202} priority className="h-11 w-auto" />
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted-2">
        <Loader2 size={15} strokeWidth={2} className="animate-spin text-navy" />
        Loading...
      </div>
    </div>
  );
}
