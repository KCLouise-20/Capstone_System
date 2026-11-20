import { AppShell } from "@/components/layout/AppShell";
import { getRisRecords, getInventoryItems, getDepartments, getSystemSettings } from "@/lib/supabase/queries";
import { requirePermission } from "@/lib/supabase/guard";
import { resolveLetterhead } from "@/lib/letterhead";
import { ReleasesClient } from "./ReleasesClient";



export default async function ReleasesPage() {
  await requirePermission(["Process RIS", "Approve requests"]);
  const [risRecords, inventoryItems, departments, settings] = await Promise.all([
    getRisRecords(),
    getInventoryItems(),
    getDepartments(),
    getSystemSettings(),
  ]);

  return (
    <AppShell title="Releases (RIS)">
      <ReleasesClient
        risRecords={risRecords}
        inventoryItems={inventoryItems}
        departmentNames={departments.map((d) => d.name)}
        letterhead={resolveLetterhead(settings)}
        settings={settings}
      />
    </AppShell>
  );

}
