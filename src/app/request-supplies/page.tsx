import { AppShell } from "@/components/layout/AppShell";
import { getMyRequests, getInventoryItems, getCurrentUserProfile, getSystemSettings } from "@/lib/supabase/queries";
import { resolveLetterhead } from "@/lib/letterhead";
import { RequestSuppliesClient } from "./RequestSuppliesClient";

export default async function RequestSuppliesPage() {
  const [myRequests, inventoryItems, profile, settings] = await Promise.all([
    getMyRequests(),
    getInventoryItems(),
    getCurrentUserProfile(),
    getSystemSettings(),
  ]);

  return (
    <AppShell title="Request Supplies">
      <RequestSuppliesClient
        myRequests={myRequests}
        inventoryItems={inventoryItems}
        department={profile?.department ?? "—"}
        requestedBy={profile?.fullName ?? ""}
        role={profile?.role ?? ""}
        letterhead={resolveLetterhead(settings)}
        settings={settings}
      />
    </AppShell>
  );
}
