import { redirect } from "next/navigation";
import { getCurrentUserProfile, type CurrentUserProfile } from "./queries";

/**
 * Server-side page guard for the Officer-permission-gated screens
 * (Inventory, Deliveries, Releases, Reports). AppShell only ever renders
 * the Sidebar/Topbar — it never checked whether the signed-in user actually
 * holds the permission a page requires, so any authenticated user (e.g.
 * Faculty/Staff) could reach these pages by direct URL even though the
 * Sidebar correctly hides the link. RLS still backs writes either way, but
 * this closes the read-level/UX gap at the same layer proxy.ts already
 * uses for /admin/* (redirect to /dashboard, not a 403 page — matches the
 * existing pattern for an unauthorized route).
 */
export async function requirePermission(
  permissionKey: string | string[],
): Promise<CurrentUserProfile> {
  const profile = await getCurrentUserProfile();
  const keys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  if (!profile || !keys.some((key) => profile.permissions[key])) {
    redirect("/dashboard");
  }
  return profile;
}
