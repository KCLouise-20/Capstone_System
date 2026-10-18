import Link from "next/link";
import { ClipboardList, Clock, PackageCheck, Heart } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, requestStatusTone } from "@/components/ui/Badge";
import type { SupplyRequest, WishListItem } from "@/lib/types";

/**
 * Faculty/Staff's own dashboard — separate from the shared Officer/Admin
 * one in page.tsx. The old shared dashboard showed the same operational
 * widgets (Total Items, Low Stock, a "Manage Inventory" table) to every
 * role, which doesn't match Faculty/Staff's actual Use Case Diagram
 * scope (Request Supplies / View My Request Status / View Released
 * Items) — an end user has no use for stock-management metrics they
 * can't act on. This mirrors that scope instead: their own requests and
 * wish-list activity.
 */
export function EndUserDashboard({
  myRequests,
  wishItems,
}: {
  myRequests: SupplyRequest[];
  wishItems: WishListItem[];
}) {
  const pending = myRequests.filter((r) => r.status === "Pending" || r.status === "Draft").length;
  const fulfilled = myRequests.filter((r) => r.status === "Released").length;
  const openWishes = wishItems.filter((w) => w.status === "open" && (w.isMine || w.confirmedByMe)).length;

  const recentRequests = myRequests.slice(0, 5);

  const recentlyReleased = myRequests
    .filter((r) => r.status === "Released")
    .slice(0, 6)
    .flatMap((r) => r.items.map((item) => ({ refNo: r.refNo, date: r.date, ...item })));

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My Requests"
          value={myRequests.length}
          hint="total submitted"
          icon={ClipboardList}
          href="/request-supplies"
        />
        <StatCard
          label="Awaiting Approval"
          value={pending}
          hint="pending or draft"
          icon={Clock}
          href="/request-supplies"
        />
        <StatCard
          label="Released to Me"
          value={fulfilled}
          hint="requests fulfilled"
          icon={PackageCheck}
          href="/request-supplies"
        />
        <StatCard
          label="Wish List"
          value={openWishes}
          hint="open suggestions you're in on"
          icon={Heart}
          href="/wishlist"
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="My Recent Requests"
            action={
              <Link href="/request-supplies" className="text-xs font-semibold text-muted hover:text-foreground">
                View All
              </Link>
            }
          />
          <div className="flex flex-col">
            {recentRequests.map((r, i) => (
              <div
                key={r.refNo}
                className={`flex items-center justify-between py-2.5 ${
                  i !== recentRequests.length - 1 ? "border-b border-border-soft" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{r.refNo}</span>
                  <span className="text-[11.5px] text-muted-2">
                    {r.date} &middot; {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                  </span>
                </div>
                <Badge tone={requestStatusTone(r.status)}>{r.status}</Badge>
              </div>
            ))}
            {recentRequests.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-muted-2">
                You haven&apos;t submitted any requests yet.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Wish List Activity"
            action={
              <Link href="/wishlist" className="text-xs font-semibold text-muted hover:text-foreground">
                View All
              </Link>
            }
          />
          <div className="flex flex-col">
            {wishItems
              .filter((w) => w.isMine || w.confirmedByMe)
              .slice(0, 5)
              .map((w, i, arr) => (
                <div
                  key={w.wishId}
                  className={`flex items-center justify-between py-2.5 ${
                    i !== arr.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold">{w.itemName}</span>
                    <span className="text-[11.5px] text-muted-2">
                      {w.isMine ? "You suggested this" : "You confirmed this"} &middot; {w.confirmCount} want it
                    </span>
                  </div>
                  <Badge tone={w.status === "fulfilled" ? "ok" : "low"}>
                    {w.status === "fulfilled" ? "Fulfilled" : "Open"}
                  </Badge>
                </div>
              ))}
            {wishItems.filter((w) => w.isMine || w.confirmedByMe).length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-muted-2">
                Nothing here yet — suggest a material on the Wish List.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recently Released to You" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["RIS/REQ No.", "Item", "Qty", "Date"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-border px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-2 first:pl-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentlyReleased.map((row, i) => (
                <tr key={`${row.refNo}-${row.itemName}-${i}`}>
                  <td
                    className={`px-3 py-2.5 pl-0 text-muted ${
                      i !== recentlyReleased.length - 1 ? "border-b border-border-soft" : ""
                    }`}
                  >
                    {row.refNo}
                  </td>
                  <td
                    className={`px-3 py-2.5 font-semibold ${
                      i !== recentlyReleased.length - 1 ? "border-b border-border-soft" : ""
                    }`}
                  >
                    {row.itemName}
                  </td>
                  <td
                    className={`px-3 py-2.5 font-bold ${
                      i !== recentlyReleased.length - 1 ? "border-b border-border-soft" : ""
                    }`}
                  >
                    {row.qty}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-muted ${
                      i !== recentlyReleased.length - 1 ? "border-b border-border-soft" : ""
                    }`}
                  >
                    {row.date}
                  </td>
                </tr>
              ))}
              {recentlyReleased.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-2">
                    Nothing released to you yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
