import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { getCurrentUserProfile } from "@/lib/supabase/queries";

// Async Server Component: proxy.ts already guarantees a signed-in user
// reaches here, so a null profile only happens if the public.users row is
// somehow missing — fall back to placeholder text rather than crashing.
export async function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const profile = await getCurrentUserProfile();

  return (
    <div className="flex min-h-screen bg-background">
      <div className="no-print">
        <Sidebar role={profile?.role ?? null} permissions={profile?.permissions ?? {}} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print">
          <Topbar
            title={title}
            userName={profile?.fullName ?? "Unknown user"}
            userRole={profile?.role ?? "—"}
            initials={profile?.initials ?? "?"}
          />
        </div>
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden p-4 sm:p-6.5">{children}</main>
      </div>
    </div>
  );
}
