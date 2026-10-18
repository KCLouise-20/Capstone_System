import { AppShell } from "@/components/layout/AppShell";
import {
  getInventoryItems,
  getInventoryItemsPage,
  getCategories,
  getUnitsOfMeasure,
  getItemLifecycleStatuses,
} from "@/lib/supabase/queries";
import { requirePermission } from "@/lib/supabase/guard";
import { InventoryClient } from "./InventoryClient";

const PAGE_SIZE = 50;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("Manage inventory");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ items, totalCount }, allItems, categories, units, lifecycleStatuses] = await Promise.all([
    getInventoryItemsPage(page, PAGE_SIZE),
    // Full list — getInventoryItemsPage() above only ever returns one
    // page, but the stat cards (total/low-stock/categories), the category
    // filter dropdown, and the "Add item" modal's next-sequential-code
    // guess all need to see every item, not just the current page, or
    // they'd silently go wrong/incomplete as soon as there's more than
    // one page of inventory.
    getInventoryItems(),
    getCategories(),
    getUnitsOfMeasure(),
    getItemLifecycleStatuses(),
  ]);

  return (
    <AppShell title="Inventory Management">
      <InventoryClient
        items={items}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        allItems={allItems}
        categories={categories}
        units={units}
        lifecycleStatuses={lifecycleStatuses}
      />
    </AppShell>
  );
}
