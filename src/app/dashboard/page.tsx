import Link from "next/link";
import { Package, AlertTriangle, Truck, FileCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, requestStatusTone, stockStatusTone } from "@/components/ui/Badge";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import {
  getDashboardMetrics,
  getStockByCategory,
  getPendingRequests,
  getLowStockItems,
  getSystemSettings,
  getCurrentUserProfile,
  getMyRequests,
  getWishListItems,
} from "@/lib/supabase/queries";
import { DashboardActions } from "./DashboardActions";
import { EndUserDashboard } from "./EndUserDashboard";

// Red/yellow/blue/green bands over a category's healthPercent (% of its
// items that are OK stock, not Low/Critical — see getStockByCategory()),
// cut at the 3 admin-configurable thresholds on System Settings.
function categoryBarColor(healthPercent: number, redMax: number, yellowMax: number, blueMax: number): string {
  if (healthPercent <= redMax) return "#b91c1c";
  if (healthPercent <= yellowMax) return "#b45309";
  if (healthPercent <= blueMax) return "#1d4ed8";
  return "#15803d";
}

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile();

  // Faculty/Staff gets its own dashboard shaped around their actual Use
  // Case Diagram scope (their own requests, wish list) rather than the
  // Officer/Admin operational-overview widgets below, which they have no
  // permission to act on. See EndUserDashboard.tsx.
  if (profile?.role === "Faculty / Staff") {
    const [myRequests, wishItems] = await Promise.all([getMyRequests(), getWishListItems(false)]);
    return (
      <AppShell title="Dashboard">
        <EndUserDashboard myRequests={myRequests} wishItems={wishItems} />
      </AppShell>
    );
  }

  const [dashboardMetrics, stockByCategory, pendingRequests, lowStockItems, settings] = await Promise.all([
    getDashboardMetrics(),
    getStockByCategory(),
    getPendingRequests(4),
    getLowStockItems(),
    getSystemSettings(),
  ]);
  const maxValue = Math.max(1, ...stockByCategory.map((c) => c.value));
  const redMax = settings?.categoryHealthRedMax ?? 25;
  const yellowMax = settings?.categoryHealthYellowMax ?? 50;
  const blueMax = settings?.categoryHealthBlueMax ?? 75;

  return (
    <AppShell title="Dashboard">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Items"
          value={dashboardMetrics.totalItems}
          hint="across all categories"
          icon={Package}
          href="/inventory"
        />
        <StatCard
          label="Low Stock"
          value={dashboardMetrics.lowStock}
          hint="items below reorder level"
          icon={AlertTriangle}
          valueClassName="text-low-text"
          href="/inventory"
        />
        <StatCard
          label="Deliveries"
          value={dashboardMetrics.deliveries}
          hint="received this month"
          icon={Truck}
          href="/deliveries"
        />
        <StatCard
          label="RIS Processed"
          value={dashboardMetrics.risProcessed}
          hint="Requisition & Issue Slips released"
          icon={FileCheck}
          href="/releases"
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Stock by Category" />
          <div className="flex flex-col gap-3">
            {stockByCategory.map((c) => (
              <div key={c.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-[#3f3f46]">{c.name}</span>
                  <span className="font-bold">{c.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.value / maxValue) * 100}%`,
                      backgroundColor: categoryBarColor(c.healthPercent, redMax, yellowMax, blueMax),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-2">
            Bar color = % of each category&apos;s items that are healthy stock.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Pending Supply Requests"
            action={
              <Link href="/releases" className="text-xs font-semibold text-muted hover:text-foreground">
                View All
              </Link>
            }
          />
          <div className="flex flex-col">
            {pendingRequests.map((r, i) => (
              <div
                key={r.refNo}
                className={`flex items-center justify-between py-2.5 ${
                  i !== pendingRequests.length - 1 ? "border-b border-border-soft" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{r.itemName}</span>
                  <span className="text-[11.5px] text-muted-2">
                    {r.department} &middot; {r.qty}
                  </span>
                </div>
                <Badge tone={requestStatusTone(r.status)}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Low Stock Items"
          action={<DashboardActions lowStockItems={lowStockItems} />}
        />
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Item code", "Item name", "Category", "Unit", "On hand", "Reorder lvl", "Status"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-border px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-2 first:pl-0"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lowStockItems.map((item, i) => (
              <tr key={item.itemCode} className="hover:bg-background/60">
                <td
                  className={`px-3 py-2.5 pl-0 text-muted ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  {item.itemCode}
                </td>
                <td
                  className={`px-3 py-2.5 font-semibold ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ItemPhoto imageUrl={item.imageUrl} alt={item.itemName} size="sm" />
                    {item.itemName}
                  </div>
                </td>
                <td
                  className={`px-3 py-2.5 text-muted ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  {item.category}
                </td>
                <td
                  className={`px-3 py-2.5 text-muted ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  {item.unit}
                </td>
                <td
                  className={`px-3 py-2.5 font-bold ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  {item.onHand}
                </td>
                <td
                  className={`px-3 py-2.5 text-muted ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  {item.reorderLevel}
                </td>
                <td
                  className={`px-3 py-2.5 ${
                    i !== lowStockItems.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <Badge tone={stockStatusTone(item.status)}>{item.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </AppShell>
  );
}
