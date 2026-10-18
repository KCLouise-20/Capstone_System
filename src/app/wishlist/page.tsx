import { AppShell } from "@/components/layout/AppShell";
import { getWishListItems, getCategories, getCurrentUserProfile } from "@/lib/supabase/queries";
import { WishListClient } from "./WishListClient";

export default async function WishListPage() {
  const profile = await getCurrentUserProfile();
  // Gated on actual granted permissions, not a hardcoded role name — a
  // custom role with "Process RIS"/"Approve requests" granted has real
  // officer-level demand-signal access, same reasoning as reports/page.tsx.
  const isOfficerOrAdmin = Boolean(
    profile?.role === "Admin" ||
      profile?.permissions["Process RIS"] ||
      profile?.permissions["Approve requests"],
  );
  const isAdmin = profile?.role === "Admin";

  // includeDepartments is only ever true for this branch — see
  // getWishListItems()'s comment on why that's what actually keeps
  // department data out of a Faculty/Staff viewer's response.
  const [items, categories] = await Promise.all([getWishListItems(isOfficerOrAdmin), getCategories()]);

  return (
    <AppShell title="Wish List">
      <WishListClient
        items={items}
        categoryOptions={categories.map((c) => c.name)}
        isOfficerOrAdmin={isOfficerOrAdmin}
        isAdmin={isAdmin}
      />
    </AppShell>
  );
}
