import { AppShell } from "@/components/layout/AppShell";
import { getDeliveries, getInventoryItems, getSystemSettings } from "@/lib/supabase/queries";
import { requirePermission } from "@/lib/supabase/guard";
import { resolveLetterhead } from "@/lib/letterhead";
import { DeliveriesClient } from "./DeliveriesClient";

export default async function DeliveriesPage() {
  const profile = await requirePermission("Record deliveries");
  const [deliveries, inventoryItems, settings] = await Promise.all([
    getDeliveries(),
    getInventoryItems(),
    getSystemSettings(),
  ]);

  return (
    <AppShell title="Record Deliveries">
      <DeliveriesClient
        deliveries={deliveries}
        inventoryItems={inventoryItems}
        receivedByName={profile.fullName}
        letterhead={resolveLetterhead(settings)}
      />
    </AppShell>
  );
}
