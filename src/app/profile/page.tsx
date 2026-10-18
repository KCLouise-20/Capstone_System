import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUserProfile } from "@/lib/supabase/queries";
import { ProfileClient } from "./ProfileClient";

/**
 * "Update Profile" — an <<include>> use case for every actor (Admin,
 * Supply Officer, Faculty/Staff) per the thesis Use Case Diagram, same as
 * View Dashboard, but with no screen ever built for it (no mockup figure
 * either — the diagram is the only place it's specified). Available to
 * every signed-in role, reachable from the Topbar's user info.
 */
export default async function ProfilePage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  return (
    <AppShell title="Update Profile">
      <ProfileClient profile={profile} />
    </AppShell>
  );
}
