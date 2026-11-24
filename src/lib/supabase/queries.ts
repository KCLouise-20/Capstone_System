import { createClient } from "@/lib/supabase/server";
import { formatPhDateTime } from "@/lib/datetime";
import type {
  AccountStatus,
  CategoryStock,
  DeliveryItemLine,
  DeliveryRecord,
  InventoryItem,
  LogEntry,
  PendingRequestSummary,
  RequestStatus,
  RisItemLine,
  RisRecord,
  RoleDefinition,
  StockCardLedgerRow,
  StockStatus,
  StockSummaryRow,
  SupplyRequest,
  SupplyRequestItem,
  SystemUser,
  UserRole,
  WishListItem,
} from "@/lib/types";

// ---------------------------------------------------------------------
// Real Supabase query helpers, shaped to mirror src/lib/mock-data.ts's
// exports as closely as possible so swapping a page from
// `import { inventoryItems } from "@/lib/mock-data"` to
// `import { getInventoryItems } from "@/lib/supabase/queries"` (+ making
// the enclosing component async) is close to a drop-in change.
//
// Reads only — every mutation (create/update/approve/etc.) lives in the
// sibling src/lib/supabase/mutations.ts instead, because Next.js requires
// a Server Action a Client Component imports and calls directly to live in
// a module with a file-level "use server" directive, and that directive
// requires every export to be an async function. This file's reads don't
// fit that constraint (computeStockStatus is sync, and none of them are
// meant to be called as Server Actions), so splitting was the only way to
// let Client Component modals import mutations without pulling this whole
// read-only module (and its use of next/headers) into the client bundle.
// ---------------------------------------------------------------------

/**
 * OK/Low/Critical is NOT stored — items.status in the DB is the item's
 * lifecycle flag (active/inactive/discontinued, see migration 04), not a
 * stock badge. This computes the badge fresh every read so it can never
 * drift out of sync with stock_quantity/reorder_level. Thresholds are a
 * judgment call (below reorder = Low, below half of reorder = Critical) —
 * the old mock-data.ts values were hand-set per row and not perfectly
 * consistent with any single rule, so expect a few items to show a
 * slightly different badge than they did under mock data.
 */

export function computeStockStatus(stockQuantity: number, reorderLevel: number): StockStatus {
  if (stockQuantity <= 0) return "Critical";
  if (reorderLevel > 0 && stockQuantity < reorderLevel) {
    return stockQuantity < reorderLevel * 0.5 ? "Critical" : "Low";
  }
  return "OK";
}

function mapReleaseStatus(status: string): RequestStatus {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "released":
      return "Released";
    default:
      return "Pending";
  }
}

function initialsOf(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Turns a 1-indexed page number + page size into the inclusive [from, to]
 * pair Supabase's `.range()` expects. Shared by the *Page() query
 * functions below (Inventory, Manage Users, System Logs) — none of the
 * existing full-list reads (getInventoryItems etc.) use this, since those
 * still need to return every row for item-picker use elsewhere in the app.
 */
function pageRange(page: number, pageSize: number): [number, number] {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * safeSize;
  return [from, from + safeSize - 1];
}

// ---------------------------------------------------------------------
// Current user / profile
// ---------------------------------------------------------------------

export interface CurrentUserProfile {
  fullName: string;
  initials: string;
  role: UserRole | string;
  department: string | null;
  username: string;
  email: string;
  /** This role's actual granted permissions (from Manage Roles) — Sidebar nav is built from this, not a hardcoded per-role list, so it stays correct after an admin re-configures a role. */
  permissions: Record<string, boolean>;
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select(
      "full_name, departments(dept_name), username, email, roles(name, role_permissions(permission_key, allowed))",
    )
    .eq("id", user.id)
    .single<{
      full_name: string;
      departments: { dept_name: string } | null;
      username: string;
      email: string;
      roles: { name: string; role_permissions: { permission_key: string; allowed: boolean }[] } | null;
    }>();

  if (!data) return null;

  const permissions = Object.fromEntries(
    (data.roles?.role_permissions ?? []).map((p) => [p.permission_key, p.allowed]),
  );

  return {
    fullName: data.full_name,
    initials: initialsOf(data.full_name),
    role: data.roles?.name ?? "Faculty / Staff",
    department: data.departments?.dept_name ?? null,
    username: data.username,
    email: data.email,
    permissions,
  };
}

// ---------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------

interface InventoryRow {
  item_code: string;
  item_name: string;
  description: string | null;
  unit: string;
  stock_quantity: number;
  unit_cost: number | null;
  reorder_level: number;
  image_url: string | null;
  categories: { category_name: string } | null;
}


export async function getInventoryItems() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("item_code, item_name, description, unit, stock_quantity, unit_cost, reorder_level, image_url, categories(category_name)")
    .order("item_code")
    .returns<InventoryRow[]>();

  return (data ?? []).map((row) => ({
    itemCode: row.item_code,
    itemName: row.item_name,
    description: row.description,
    category: row.categories?.category_name ?? "Uncategorized",
    unit: row.unit,
    onHand: Number(row.stock_quantity),
    reorderLevel: Number(row.reorder_level),
    unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
    status: computeStockStatus(Number(row.stock_quantity), Number(row.reorder_level)),
    imageUrl: row.image_url,
  }));
}

/**
 * Paginated counterpart to getInventoryItems(), for the Inventory screen's
 * table (which currently renders every row with decorative, non-functional
 * prev/next buttons). getInventoryItems() itself is left untouched — it's
 * also used as the full item-picker source on Deliveries/Releases/Request
 * Supplies, which all need the complete list, never a page of it. `page`
 * is 1-indexed. Uses `{ count: "exact" }` alongside `.range()` so the page
 * of rows and the total row count come back in one round trip.
 */
export async function getInventoryItemsPage(
  page: number,
  pageSize: number,
): Promise<{ items: InventoryItem[]; totalCount: number }> {
  const supabase = await createClient();
  const [from, to] = pageRange(page, pageSize);

  const { data, count } = await supabase
    .from("items")
    .select(
      "item_code, item_name, description, unit, stock_quantity, unit_cost, reorder_level, image_url, categories(category_name)",
      { count: "exact" },
    )
    .order("item_code")
    .range(from, to)
    .returns<InventoryRow[]>();

  const items: InventoryItem[] = (data ?? []).map((row) => ({
    itemCode: row.item_code,
    itemName: row.item_name,
    description: row.description,
    category: row.categories?.category_name ?? "Uncategorized",
    unit: row.unit,
    onHand: Number(row.stock_quantity),
    reorderLevel: Number(row.reorder_level),
    unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
    status: computeStockStatus(Number(row.stock_quantity), Number(row.reorder_level)),
    imageUrl: row.image_url,
  }));

  return { items, totalCount: count ?? 0 };
}

export async function getLowStockItems(limit = 5) {
  const items = await getInventoryItems();
  return items.filter((item) => item.status !== "OK").slice(0, limit);
}

/**
 * items.status (active/inactive/discontinued) — the lifecycle flag, not
 * the OK/Low/Critical stock badge getInventoryItems() computes. Keyed by
 * item_code for the Inventory edit modal's separate lifecycle control.
 */
export async function getItemLifecycleStatuses(): Promise<
  Record<string, "active" | "inactive" | "discontinued">
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("item_code, status")
    .returns<{ item_code: string; status: "active" | "inactive" | "discontinued" }[]>();

  const map: Record<string, "active" | "inactive" | "discontinued"> = {};
  for (const row of data ?? []) {
    map[row.item_code] = row.status;
  }
  return map;
}

/**
 * Real per-item stock card, for the Reports screen's "stock card" tab.
 * items.stock_quantity is the one authoritative running total — there's no
 * separate ledger/opening-balance table, and stock can also move via a
 * direct "Edit item" quantity change (updateInventoryItem), which leaves
 * no transaction row at all. So this can't assume the tracked
 * deliveries/releases fully explain the current balance; instead it works
 * backward from the authoritative current stock_quantity to back out
 * what the balance must have been before the earliest tracked
 * transaction, then walks forward from there — the same "Opening
 * balance" row shape the thesis mockup uses, just computed instead of
 * hand-set. Only releases with status in ('approved', 'released') count
 * as issues, matching apply_release_stock_effect (migration 06) exactly.
 */
function daysBetween(a: string, b: string): number {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

/**
 * Estimates the legacy Stock Card form's "No. of Days to Consume" column:
 * at this item's own historical average daily issue rate (total issued so
 * far ÷ days since the ledger's first event), how long would the given
 * balance last? Returns null — printed as "—" — when there isn't enough
 * history to estimate from yet (no issues recorded, or this is the very
 * first event), rather than a misleading number. A zero/negative balance
 * is always 0 days, regardless of rate, since there's nothing left to
 * consume.
 */
function computeDaysToConsume(balance: number, cumulativeIssued: number, firstDate: string, asOfDate: string): number | null {
  if (balance <= 0) return 0;
  if (cumulativeIssued <= 0) return null;
  const elapsedDays = daysBetween(firstDate, asOfDate);
  const avgDailyIssueRate = cumulativeIssued / elapsedDays;
  if (avgDailyIssueRate <= 0) return null;
  return Math.round(balance / avgDailyIssueRate);
}

export async function getStockCardLedger(itemCode: string): Promise<StockCardLedgerRow[]> {
  const supabase = await createClient();

    const { data: item } = await supabase
    .from("items")
    .select("item_id, stock_quantity, item_code, item_name, unit, reorder_level, image_url")
    .eq("item_code", itemCode)
    .maybeSingle<{
      item_id: number;
      stock_quantity: number;
      item_code: string;
      item_name: string;
      unit: string;
      reorder_level: number;
      image_url: string | null;
    }>();

  if (!item) return [];

  const [{ data: receipts }, { data: issues }] = await Promise.all([
    supabase
      .from("delivery_items")
      .select("quantity, unit_cost, deliveries(ref_no, delivery_date)")
      .eq("item_id", item.item_id)
      .returns<
        { quantity: number; unit_cost: number | null; deliveries: { ref_no: string; delivery_date: string } | null }[]
      >(),
    supabase
      .from("release_items")
      .select("quantity, releases!inner(ris_number, release_date, status, department)")
      .eq("item_id", item.item_id)
      .in("releases.status", ["approved", "released"])
      .returns<
        {
          quantity: number;
          releases: { ris_number: string; release_date: string | null; status: string; department: string | null };
        }[]
      >(),
  ]);

  type Event = {
    date: string;
    reference: string;
    receiptQty: number | null;
    unitCost: number | null;
    issueQty: number | null;
    office: string | null;
  };
  const events: Event[] = [
    ...(receipts ?? [])
      .filter((r) => r.deliveries)
      .map((r) => ({
        date: r.deliveries!.delivery_date,
        reference: r.deliveries!.ref_no,
        receiptQty: Number(r.quantity),
        unitCost: r.unit_cost !== null ? Number(r.unit_cost) : null,
        issueQty: null,
        office: null,
      })),
    ...(issues ?? [])
      .filter((r) => r.releases.release_date)
      .map((r) => ({
        date: r.releases.release_date!,
        reference: r.releases.ris_number,
        receiptQty: null,
        unitCost: null,
        issueQty: Number(r.quantity),
        office: r.releases.department,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const netTracked = events.reduce((sum, e) => sum + (e.receiptQty ?? 0) - (e.issueQty ?? 0), 0);
  const rawOpening = Number(item.stock_quantity) - netTracked;
  const firstDate = events[0]?.date ?? "—";

  const rows: StockCardLedgerRow[] = [];
  let cumulativeIssued = 0;

  if (rawOpening < 0) {
    // Tracked deliveries/releases alone don't reconcile with the item's
    // current stock_quantity — most likely a direct "Quantity on hand"
    // correction via Edit item (updateInventoryItem lets that happen
    // independent of any delivery/release row, e.g. after a physical
    // recount). A negative "Opening balance" is never a sensible number
    // for a stock card, so start from 0 and reconcile with a trailing
    // "Stock count adjustment" line instead of a leading one — every
    // tracked-event balance stays non-negative this way, and the ledger
    // still ends exactly at the item's real current stock_quantity,
    // whichever direction the correction went.
    let running = 0;
    rows.push({
      date: firstDate,
      reference: "Opening balance",
      receiptQty: null,
      unitCost: null,
      issueQty: null,
      office: null,
      balance: 0,
      daysToConsume: null,
    });
    for (const e of events) {
      running += (e.receiptQty ?? 0) - (e.issueQty ?? 0);
      cumulativeIssued += e.issueQty ?? 0;
      rows.push({
        date: e.date,
        reference: e.reference,
        receiptQty: e.receiptQty,
        unitCost: e.unitCost,
        issueQty: e.issueQty,
        office: e.office,
        balance: running,
        daysToConsume: computeDaysToConsume(running, cumulativeIssued, firstDate, e.date),
      });
    }
    const adjustment = Number(item.stock_quantity) - running;
    rows.push({
      date: new Date().toISOString().slice(0, 10),
      reference: "Stock count adjustment",
      receiptQty: adjustment > 0 ? adjustment : null,
      unitCost: null,
      issueQty: adjustment < 0 ? Math.abs(adjustment) : null,
      office: null,
      balance: Number(item.stock_quantity),
      daysToConsume: computeDaysToConsume(Number(item.stock_quantity), cumulativeIssued, firstDate, new Date().toISOString().slice(0, 10)),
    });
    return rows;
  }

  let running = rawOpening;
  rows.push({
    date: firstDate,
    reference: "Opening balance",
    receiptQty: null,
    unitCost: null,
    issueQty: null,
    office: null,
    balance: running,
    daysToConsume: null,
  });
  for (const e of events) {
    running += (e.receiptQty ?? 0) - (e.issueQty ?? 0);
    cumulativeIssued += e.issueQty ?? 0;
    rows.push({
      date: e.date,
      reference: e.reference,
      receiptQty: e.receiptQty,
      unitCost: e.unitCost,
      issueQty: e.issueQty,
      office: e.office,
      balance: running,
      daysToConsume: computeDaysToConsume(running, cumulativeIssued, firstDate, e.date),
    });
  }
  return rows;
}

/**
 * The "Stock Summary List" — every item at a glance (code, name, current
 * stock, average price), printed as the separate master-list companion to
 * a single item's own getStockCardLedger() above. avgUnitCost is averaged
 * in JS across every delivery_items row for that item rather than via a
 * SQL AVG()/GROUP BY, since Supabase-js's query builder doesn't expose
 * aggregates without a raw-SQL RPC — two flat queries plus an in-memory
 * average is simpler here and this table is never large enough for it to
 * matter.
 */
export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const supabase = await createClient();
  const [{ data: items }, { data: deliveryLines }] = await Promise.all([
    supabase
      .from("items")
      .select("item_id, item_code, item_name, unit, stock_quantity, reorder_level, image_url")
      .order("item_code")
      .returns<{ item_id: number; item_code: string; item_name: string; unit: string; stock_quantity: number }[]>(),
    supabase
      .from("delivery_items")
      .select("item_id, unit_cost")
      .returns<{ item_id: number; unit_cost: number }[]>(),
  ]);

  const costsByItem = new Map<number, number[]>();
  for (const line of deliveryLines ?? []) {
    const list = costsByItem.get(line.item_id) ?? [];
    list.push(Number(line.unit_cost));
    costsByItem.set(line.item_id, list);
  }

  return (items ?? []).map((item) => {
    const costs = costsByItem.get(item.item_id);
    return {
      itemCode: item.item_code,
      itemName: item.item_name,
      unit: item.unit,
      onHand: Number(item.stock_quantity),
      avgUnitCost: costs && costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    };
  });
}

// ---------------------------------------------------------------------
// Reports (remaining tabs on src/app/reports/page.tsx). The "Stock card"
// tab is getStockCardLedger() above. "RIS / release form" is deliberately
// NOT given a dedicated query here — it's a print-one-record view, and
// getRisRecords()/getMyRequests() already return every field a printable
// RIS needs (ris no., department, date, status, scio, purpose, full item
// list with qty/stock) — a new function would just be a thin, redundant
// wrapper around one of those two.
// ---------------------------------------------------------------------

export interface ItemTransactionRow {
  date: string;
  type: "Receipt" | "Issue";
  reference: string;
  qty: number;
  balance: number;
}

/**
 * "Transaction history per item" tab. This is the same chronological
 * receipts/issues getStockCardLedger() already computes (see that
 * function for the opening-balance/running-total logic) — wrapped rather
 * than reimplemented, per an explicit "receipt or issue" type flag and an
 * optional date-range filter, and with the synthetic "Opening balance" row
 * dropped since this tab is meant to read as a plain transaction list, not
 * a ledger.
 */
export async function getItemTransactionHistory(
  itemCode: string,
  from?: string,
  to?: string,
): Promise<ItemTransactionRow[]> {
  const ledger = await getStockCardLedger(itemCode);

  return ledger
    .filter((row) => row.reference !== "Opening balance")
    .filter((row) => (!from || row.date >= from) && (!to || row.date <= to))
    .map((row) => ({
      date: row.date,
      type: row.receiptQty !== null ? "Receipt" : "Issue",
      reference: row.reference,
      qty: row.receiptQty ?? row.issueQty ?? 0,
      balance: row.balance,
    }));
}

export type ReportPeriodType = "monthly" | "quarterly" | "yearly";

export interface PeriodSummaryRow {
  /** Sortable key: "2026-08" (monthly), "2026-Q3" (quarterly), "2026" (yearly). */
  period: string;
  periodLabel: string;
  deliveriesCount: number;
  deliveriesValue: number;
  releasesCount: number;
  releasesValue: number;
}

export interface PeriodCategoryTotal {
  name: string;
  qty: number;
}

export interface PeriodSummaryReport {
  periodType: ReportPeriodType;
  from: string;
  to: string;
  rows: PeriodSummaryRow[];
  /** Top 5 categories by combined delivered + released quantity across the whole range. */
  topCategories: PeriodCategoryTotal[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function periodKeyOf(dateStr: string, periodType: ReportPeriodType): string {
  const [year, month] = dateStr.split("-");
  if (periodType === "yearly") return year;
  if (periodType === "quarterly") return `${year}-Q${Math.ceil(Number(month) / 3)}`;
  return `${year}-${month}`;
}

function periodLabelOf(key: string, periodType: ReportPeriodType): string {
  if (periodType === "yearly") return key;
  if (periodType === "quarterly") return key.replace("-Q", " Q");
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * Monthly/Quarterly/Yearly summary tab. Aggregates delivery_items and
 * release_items (the same line-item tables getStockCardLedger reads) into
 * one row per period within [from, to] (inclusive, yyyy-mm-dd). Only
 * releases with status in ('approved', 'released') count as an actual
 * release, matching apply_release_stock_effect (migration 06) exactly —
 * a still-pending or rejected request never moved stock, so it shouldn't
 * count as a "release" in a period summary either.
 *
 * release_items.unit_cost has no default and nothing currently writes it
 * (see insertReleaseRequest in mutations.ts), so it's null for every row
 * today; releasesValue falls back to the item's current unit_cost in that
 * case rather than silently reporting zero.
 */
export async function getPeriodSummaryReport(
  periodType: ReportPeriodType,
  from: string,
  to: string,
): Promise<PeriodSummaryReport> {
  const supabase = await createClient();

  const [{ data: deliveryRows }, { data: releaseRows }] = await Promise.all([
    supabase
      .from("delivery_items")
      .select("quantity, unit_cost, items(unit_cost, categories(category_name)), deliveries!inner(delivery_date)")
      .gte("deliveries.delivery_date", from)
      .lte("deliveries.delivery_date", to)
      .returns<
        {
          quantity: number;
          unit_cost: number;
          items: { unit_cost: number; categories: { category_name: string } | null } | null;
          deliveries: { delivery_date: string };
        }[]
      >(),
    supabase
      .from("release_items")
      .select(
        "quantity, unit_cost, items(unit_cost, categories(category_name)), releases!inner(release_date, status)",
      )
      .in("releases.status", ["approved", "released"])
      .gte("releases.release_date", from)
      .lte("releases.release_date", to)
      .returns<
        {
          quantity: number;
          unit_cost: number | null;
          items: { unit_cost: number; categories: { category_name: string } | null } | null;
          releases: { release_date: string | null; status: string };
        }[]
      >(),
  ]);

  const periodMap = new Map<string, PeriodSummaryRow>();
  function rowFor(key: string): PeriodSummaryRow {
    let row = periodMap.get(key);
    if (!row) {
      row = { period: key, periodLabel: periodLabelOf(key, periodType), deliveriesCount: 0, deliveriesValue: 0, releasesCount: 0, releasesValue: 0 };
      periodMap.set(key, row);
    }
    return row;
  }

  const categoryTotals = new Map<string, number>();
  function addCategoryQty(name: string, qty: number) {
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + qty);
  }

  for (const d of deliveryRows ?? []) {
    const row = rowFor(periodKeyOf(d.deliveries.delivery_date, periodType));
    row.deliveriesCount += 1;
    row.deliveriesValue += Number(d.quantity) * Number(d.unit_cost);
    addCategoryQty(d.items?.categories?.category_name ?? "Uncategorized", Number(d.quantity));
  }

  for (const r of releaseRows ?? []) {
    if (!r.releases.release_date) continue;
    const row = rowFor(periodKeyOf(r.releases.release_date, periodType));
    row.releasesCount += 1;
    const unitCost = r.unit_cost ?? r.items?.unit_cost ?? 0;
    row.releasesValue += Number(r.quantity) * Number(unitCost);
    addCategoryQty(r.items?.categories?.category_name ?? "Uncategorized", Number(r.quantity));
  }

  const rows = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  const topCategories = Array.from(categoryTotals.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return { periodType, from, to, rows, topCategories };
}

export interface ScioItemTotal {
  itemName: string;
  qty: number;
}

export interface ScioReportRow {
  scio: string;
  releaseCount: number;
  totalValue: number;
  items: ScioItemTotal[];
}

/**
 * Per-SCIO report: releases grouped by the `scio` column (migration 06,
 * populated by the Releases/Request Supplies forms). Only releases with
 * status in ('approved', 'released') are counted — same reasoning as
 * getPeriodSummaryReport. Rows with no scio set are grouped under
 * "Unspecified" rather than dropped, so nothing silently disappears from
 * the report.
 */
export async function getScioReport(): Promise<{ rows: ScioReportRow[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("releases")
    .select("scio, release_items(quantity, unit_cost, items(item_name, unit_cost))")
    .in("status", ["approved", "released"])
    .returns<
      {
        scio: string | null;
        release_items:
          | { quantity: number; unit_cost: number | null; items: { item_name: string; unit_cost: number } | null }[]
          | null;
      }[]
    >();

  const byScio = new Map<string, { releaseCount: number; totalValue: number; items: Map<string, number> }>();

  for (const release of data ?? []) {
    const scioName = release.scio?.trim() || "Unspecified";
    let entry = byScio.get(scioName);
    if (!entry) {
      entry = { releaseCount: 0, totalValue: 0, items: new Map() };
      byScio.set(scioName, entry);
    }
    entry.releaseCount += 1;

    for (const line of release.release_items ?? []) {
      const unitCost = line.unit_cost ?? line.items?.unit_cost ?? 0;
      entry.totalValue += Number(line.quantity) * Number(unitCost);
      const itemName = line.items?.item_name ?? "—";
      entry.items.set(itemName, (entry.items.get(itemName) ?? 0) + Number(line.quantity));
    }
  }

  const rows: ScioReportRow[] = Array.from(byScio.entries())
    .map(([scio, entry]) => ({
      scio,
      releaseCount: entry.releaseCount,
      totalValue: entry.totalValue,
      items: Array.from(entry.items.entries()).map(([itemName, qty]) => ({ itemName, qty })),
    }))
    .sort((a, b) => b.releaseCount - a.releaseCount);

  return { rows };
}

export async function getDashboardMetrics() {
  const supabase = await createClient();

  // StatCard's own label says "received this month" (dashboard/page.tsx) --
  // this needs a matching date filter, or the number is really a lifetime
  // total that happens to be captioned otherwise.
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [itemCount, items, deliveryCount, risCount] = await Promise.all([
    supabase.from("items").select("item_id", { count: "exact", head: true }),
    getInventoryItems(),
    supabase
      .from("deliveries")
      .select("delivery_id", { count: "exact", head: true })
      .gte("delivery_date", startOfMonth),
    supabase
      .from("releases")
      .select("release_id", { count: "exact", head: true })
      .in("status", ["approved", "released"]),
  ]);

  return {
    totalItems: itemCount.count ?? 0,
    lowStock: items.filter((item) => item.status !== "OK").length,
    deliveries: deliveryCount.count ?? 0,
    risProcessed: risCount.count ?? 0,
  };
}

export async function getStockByCategory(): Promise<CategoryStock[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("stock_quantity, reorder_level, categories(category_name)")
    .returns<
      { stock_quantity: number; reorder_level: number; categories: { category_name: string } | null }[]
    >();

  const totals = new Map<string, number>();
  const healthyCounts = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = row.categories?.category_name ?? "Uncategorized";
    totals.set(name, (totals.get(name) ?? 0) + Number(row.stock_quantity));
    itemCounts.set(name, (itemCounts.get(name) ?? 0) + 1);
    if (computeStockStatus(Number(row.stock_quantity), Number(row.reorder_level)) === "OK") {
      healthyCounts.set(name, (healthyCounts.get(name) ?? 0) + 1);
    }
  }

  return Array.from(totals.entries()).map(([name, value]) => ({
    name,
    value,
    healthPercent: Math.round(((healthyCounts.get(name) ?? 0) / (itemCounts.get(name) ?? 1)) * 100),
  }));
}

export async function getCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("category_name, status").order("category_name");
  return (data ?? []).map((row) => ({ name: row.category_name, active: row.status === "active" }));
}

/** The real DEPARTMENTS entity (migration 20) — backs the Manage Departments card on System Settings, and every department dropdown (Manage Users, Officer's RIS form). */
export async function getDepartments() {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("dept_name, description, status").order("dept_name");
  return (data ?? []).map((row) => ({
    name: row.dept_name,
    description: row.description,
    active: row.status === "active",
  }));
}

export async function getUnitsOfMeasure() {
  const supabase = await createClient();
  const { data } = await supabase.from("units_of_measure").select("name, abbreviation").order("name");
  return data ?? [];
}

// ---------------------------------------------------------------------
// System Settings (read) — see mutations.ts for updateSystemSettings.
// ---------------------------------------------------------------------

export interface SystemSettings {
  institutionName: string;
  systemTitle: string;
  fiscalYearStart: string;
  currency: string;
  lowStockThresholdPercent: number;
  categoryHealthRedMax: number;
  categoryHealthYellowMax: number;
  categoryHealthBlueMax: number;
  /** Printed-document letterhead fields (migration 23) — e.g. "Supply and Property Management Office". */
  officeName: string;
  address: string;
  contactInfo: string;
  /** COA accounting classification (migration 25) — printed on the Stock Card only, matching the legacy government form's "Fund Cluster" field (e.g. "IGI"). */
  fundCluster: string;
  deliveryUnit: string;
  responsibilityCenterCode: string;
  poNo: string;
}

/**
 * No read function existed for the general-settings panel (categories and
 * units of measure already had getCategories/getUnitsOfMeasure) — the mock
 * form just hardcoded defaultValue text that happened to match the seed
 * row. Added here so the Edit form has something real to pre-fill from.
 */
export async function getSystemSettings(): Promise<SystemSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_settings")
        .select(
      "institution_name, system_title, fiscal_year_start, currency, low_stock_threshold_percent, category_health_red_max, category_health_yellow_max, category_health_blue_max, office_name, address, contact_info, fund_cluster, delivery_unit, responsibility_center_code, po_no",
    )
    .eq("id", true)
    .maybeSingle<{
      institution_name: string | null;
      system_title: string | null;
      fiscal_year_start: string | null;
      currency: string | null;
      low_stock_threshold_percent: number | null;
      category_health_red_max: number | null;
      category_health_yellow_max: number | null;
      category_health_blue_max: number | null;
      office_name: string | null;
      address: string | null;
      contact_info: string | null;
      fund_cluster: string | null;
      delivery_unit: string | null;
      responsibility_center_code: string | null;
      po_no: string | null;
    }>();


  if (!data) return null;
  return {
    institutionName: data.institution_name ?? "",
    systemTitle: data.system_title ?? "",
    fiscalYearStart: data.fiscal_year_start ?? "",
    currency: data.currency ?? "",
    lowStockThresholdPercent: Number(data.low_stock_threshold_percent ?? 0),
    categoryHealthRedMax: Number(data.category_health_red_max ?? 25),
    categoryHealthYellowMax: Number(data.category_health_yellow_max ?? 50),
    categoryHealthBlueMax: Number(data.category_health_blue_max ?? 75),
    officeName: data.office_name ?? "",
    address: data.address ?? "",
    contactInfo: data.contact_info ?? "",
    fundCluster: data.fund_cluster ?? "",
    deliveryUnit: data.delivery_unit ?? "",
    responsibilityCenterCode: data.responsibility_center_code ?? "",
    poNo: data.po_no ?? "",
  };
}

// ---------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------

interface DeliveryRow {
  ref_no: string;
  po_number: string | null;
  supplier: string;
  delivery_date: string;
  remarks: string | null;
  received_by_name: string | null;
  receiver: { full_name: string } | null;
  delivery_items: { quantity: number; unit_cost: number; items: { item_name: string; unit: string } | null }[] | null;
}

export async function getDeliveries(): Promise<DeliveryRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deliveries")
    .select(
      "ref_no, po_number, supplier, delivery_date, remarks, received_by_name, receiver:received_by(full_name), delivery_items(quantity, unit_cost, items(item_name, unit))",
    )
    .order("delivery_date", { ascending: false })
    .returns<DeliveryRow[]>();

  return (data ?? []).map((row) => {
    const items: DeliveryItemLine[] = (row.delivery_items ?? []).map((line) => ({
      itemName: line.items?.item_name ?? "—",
      qty: Number(line.quantity),
      unitCost: Number(line.unit_cost),
      unit: line.items?.unit ?? "",
    }));

    return {
      refNo: row.ref_no,
      supplier: row.supplier,
      date: row.delivery_date,
      itemCount: items.length,
      items,
      totalCost: items.reduce((sum, line) => sum + line.qty * line.unitCost, 0),
      poNumber: row.po_number ?? undefined,
      // Live join first (shows a since-corrected name for an account that
      // still exists), falling back to the permanent snapshot (migration
      // 24) once the account itself has been deleted and the join goes null.
      receivedBy: row.receiver?.full_name ?? row.received_by_name ?? undefined,
      remarks: row.remarks ?? undefined,
    };
  });
}

// ---------------------------------------------------------------------
// Releases (unified RIS + Requests — see migration 06)
// ---------------------------------------------------------------------

interface ReleaseRow {
  ris_number: string;
  department: string | null;
  release_date: string | null;
  status: string;
  scio: string | null;
  purpose: string | null;
  remarks: string | null;
  approved_at: string | null;
  released_at: string | null;
  rejected_at: string | null;
  requested_by_name: string | null;
  requested_by_designation: string | null;
  approved_by_name: string | null;
  approved_by_designation: string | null;
  released_by_name: string | null;
  released_by_designation: string | null;
  
  release_items:
    | {
        quantity: number;
        items: { item_name: string; stock_quantity: number; reorder_level: number; unit?: string } | null;
      }[]
    | null;
  approver: { full_name: string; roles: { name: string } | null } | null;
  requester?: { full_name: string; roles: { name: string } | null } | null;
}


/**
 * Officer-facing view: every release/RIS record, newest first. Excludes
 * *other people's* 'draft' rows — a draft is still being assembled by its
 * requester (Officer and Faculty/Staff both use the same draft/pending
 * lifecycle, see migration 13/14) and isn't something to review/act on
 * yet, even though RLS itself lets an Officer see it if they went
 * looking. The signed-in Officer's own drafts (from their own "New RIS
 * form") still need to show up here, though — this is also where they'd
 * find and submit one — so the exclusion only applies to drafts that
 * aren't theirs.
 */
export async function getRisRecords(): Promise<RisRecord[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

    const { data } = await supabase
    .from("releases")
    .select(
      "ris_number, department, release_date, status, scio, purpose, remarks, requested_by_name, requested_by_designation, approved_by_name, approved_by_designation, approved_at, released_at, rejected_at, released_by_name, released_by_designation, release_items(quantity, items(item_name, stock_quantity, reorder_level)), requester:requested_by(full_name, roles(name)), approver:approved_by(full_name, roles(name))",
    )
    .or(`status.neq.draft${user ? `,requested_by.eq.${user.id}` : ""}`)
    .order("created_at", { ascending: false })
    .returns<ReleaseRow[]>();


  return (data ?? []).map((row) => {
    const items: RisItemLine[] = (row.release_items ?? []).map((line) => ({
      itemName: line.items?.item_name ?? "—",
      qtyRequested: Number(line.quantity),
      stockOnHand: Number(line.items?.stock_quantity ?? 0),
      lowStock: Number(line.items?.stock_quantity ?? 0) < Number(line.items?.reorder_level ?? 0),
    }));

    return {
      risNo: row.ris_number,
      department: row.department ?? "—",
      date: row.release_date ?? "",
      status: mapReleaseStatus(row.status),
      scio: row.scio ?? "",
      purpose: row.purpose ?? "",
      items,
      // Live join first, permanent snapshot (migration 24) as fallback once
      // the account is deleted and the join goes null — same pattern as
      // getDeliveries' receivedBy.
      requestedBy: row.requester?.full_name ?? row.requested_by_name ?? undefined,
      requestedByDesignation: row.requester?.roles?.name ?? row.requested_by_designation ?? undefined,
      approvedBy: row.approver?.full_name ?? row.approved_by_name ?? undefined,
      approvedByDesignation: row.approver?.roles?.name ?? row.approved_by_designation ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      releasedAt: row.released_at ?? undefined,
      issuedBy: row.released_by_name ?? undefined,
      issuedByDesignation: row.released_by_designation ?? undefined,
      rejectedAt: row.rejected_at ?? undefined,
      remarks: row.remarks ?? undefined,

    };
  });
}

/** Faculty/Staff-facing view: only the signed-in user's own requests (RLS enforces this too). */
export async function getMyRequests(): Promise<SupplyRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("releases")
    .select(
      "ris_number, release_date, status, remarks, approved_by_name, approved_at, released_at, rejected_at, release_items(quantity, items(item_name, unit, stock_quantity)), approver:approved_by(full_name, roles(name))",
    )
    .eq("requested_by", user.id)
    .order("created_at", { ascending: false })
    .returns<ReleaseRow[]>();

    return (data ?? []).map((row) => {
    const items: SupplyRequestItem[] = (row.release_items ?? []).map((line) => ({
      itemName: line.items?.item_name ?? "—",
      qty: Number(line.quantity),
      unit: line.items?.unit,
      stockOnHand: Number(line.items?.stock_quantity ?? 0),
    }));

    return {
      refNo: row.ris_number,
      date: row.release_date ?? "",
      itemCount: items.length,
      status: mapReleaseStatus(row.status),
      items,
      approvedBy: row.approver?.full_name ?? row.approved_by_name ?? undefined,
      approvedByDesignation: row.approver?.roles?.name ?? undefined,

      // The date the Officer actually acted, NOT release_date (which is the
      // date needed). Released rows report their hand-over date; approved
      // rows their approval date; anything else (pending/rejected/draft)
      // reports nothing, so the receipt shows no date line at all.
          approvedOn:
      row.status === "released"
        ? (row.released_at ?? undefined)
        : row.status === "approved"
          ? (row.approved_at ?? undefined)
          : row.status === "rejected"
            ? (row.rejected_at ?? undefined)
            : undefined,
      remarks: row.remarks ?? undefined,
    };
  });
}

/** Dashboard widget — excludes 'draft' rows for the same reason as getRisRecords(). */
export async function getPendingRequests(limit = 10): Promise<PendingRequestSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("releases")
    .select("ris_number, department, status, release_items(quantity, items(item_name, unit))")
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<
      {
        ris_number: string;
        department: string | null;
        status: string;
        release_items: { quantity: number; items: { item_name: string; unit: string } | null }[] | null;
      }[]
    >();

  return (data ?? []).map((row) => {
    const first = row.release_items?.[0];
    return {
      refNo: row.ris_number,
      itemName: first?.items?.item_name ?? "—",
      department: row.department ?? "—",
      qty: first ? `${first.quantity} ${first.items?.unit ?? ""}`.trim() : "—",
      status: mapReleaseStatus(row.status),
    };
  });
}

/**
 * The material wishlist — every flagged material, newest first, with how
 * many people want it and whether the current viewer already confirmed
 * it. `includeDepartments` should only ever be true for an Officer/Admin
 * caller (see src/app/wishlist/page.tsx) — this is what keeps department
 * (and, by extension, any hint of who asked) out of a Faculty/Staff
 * viewer's response entirely, not just hidden by the component that
 * renders it.
 */
export async function getWishListItems(includeDepartments: boolean): Promise<WishListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: items }, { data: confirmations }] = await Promise.all([
    supabase
      .from("wishlist_items")
      .select("wish_id, item_name, description, category_name, department, requested_by, status, created_at")
      .order("created_at", { ascending: false })
      .returns<
        {
          wish_id: number;
          item_name: string;
          description: string | null;
          category_name: string | null;
          department: string | null;
          requested_by: string;
          status: string;
          created_at: string;
        }[]
      >(),
    supabase
      .from("wishlist_confirmations")
      .select("wish_id, user_id, department")
      .returns<{ wish_id: number; user_id: string; department: string | null }[]>(),
  ]);

  return (items ?? []).map((item) => {
    const confirms = (confirmations ?? []).filter((c) => c.wish_id === item.wish_id);
    let departments: string[] | undefined;
    if (includeDepartments) {
      const set = new Set<string>();
      if (item.department) set.add(item.department);
      for (const c of confirms) if (c.department) set.add(c.department);
      departments = Array.from(set);
    }

    return {
      wishId: item.wish_id,
      itemName: item.item_name,
      description: item.description,
      category: item.category_name,
      status: item.status === "fulfilled" ? "fulfilled" : "open",
      createdAt: item.created_at,
      confirmCount: confirms.length + 1, // +1 for the poster's own implicit want
      confirmedByMe: user ? confirms.some((c) => c.user_id === user.id) : false,
      isMine: user ? item.requested_by === user.id : false,
      departments,
    };
  });
}

// ---------------------------------------------------------------------
// Users / Roles / Logs (admin screens)
// ---------------------------------------------------------------------

interface UserRow {
  full_name: string;
  email: string;
  departments: { dept_name: string } | null;
  status: string;
  roles: { name: string } | null;
}

/** Every role name, for the Manage Users role picker — includes any custom role an admin created on Manage Roles, not just the 3 seeded ones. */
export async function getRoleNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("name").order("name");
  return (data ?? []).map((r) => r.name);
}

export async function getSystemUsers(): Promise<SystemUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("full_name, email, departments(dept_name), status, roles(name)")
    .order("full_name")
    .returns<UserRow[]>();

  return (data ?? []).map((row) => ({
    fullName: row.full_name,
    initials: initialsOf(row.full_name),
    email: row.email,
    role: (row.roles?.name ?? "Faculty / Staff") as UserRole,
    department: row.departments?.dept_name ?? "—",
    status: (row.status === "active" ? "Active" : "Inactive") as AccountStatus,
  }));
}

/**
 * Paginated counterpart to getSystemUsers(), for the Manage Users screen
 * (which currently has no pagination UI at all — every row renders at
 * once). `page` is 1-indexed; see pageRange() above.
 */
export async function getSystemUsersPage(
  page: number,
  pageSize: number,
): Promise<{ users: SystemUser[]; totalCount: number }> {
  const supabase = await createClient();
  const [from, to] = pageRange(page, pageSize);

  const { data, count } = await supabase
    .from("users")
    .select("full_name, email, departments(dept_name), status, roles(name)", { count: "exact" })
    .order("full_name")
    .range(from, to)
    .returns<UserRow[]>();

  const users: SystemUser[] = (data ?? []).map((row) => ({
    fullName: row.full_name,
    initials: initialsOf(row.full_name),
    email: row.email,
    role: (row.roles?.name ?? "Faculty / Staff") as UserRole,
    department: row.departments?.dept_name ?? "—",
    status: (row.status === "active" ? "Active" : "Inactive") as AccountStatus,
  }));

  return { users, totalCount: count ?? 0 };
}

export async function getRoleDefinitions(): Promise<RoleDefinition[]> {
  const supabase = await createClient();

  const [{ data: roles }, { data: permissions }, { data: users }] = await Promise.all([
    supabase.from("roles").select("role_id, name, description"),
    supabase.from("role_permissions").select("role_id, permission_key, allowed"),
    supabase.from("users").select("role_id"),
  ]);

  return (roles ?? []).map((role) => {
    const rolePermissions = (permissions ?? [])
      .filter((p) => p.role_id === role.role_id)
      .reduce<Record<string, boolean>>((acc, p) => {
        acc[p.permission_key] = p.allowed;
        return acc;
      }, {});

    return {
      name: role.name,
      description: role.description ?? "",
      userCount: (users ?? []).filter((u) => u.role_id === role.role_id).length,
      permissions: rolePermissions,
    };
  });
}

export async function getSystemLogs(limit = 200): Promise<LogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_logs")
    .select("created_at, action, module, description, user_name, users(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<
      {
        created_at: string;
        action: string;
        module: string;
        description: string | null;
        user_name: string | null;
        users: { full_name: string } | null;
      }[]
    >();

  return (data ?? []).map((row) => ({
    timestamp: formatPhDateTime(row.created_at),
    // Live join first, permanent snapshot (migration 24) as fallback once
    // the account is deleted and the join goes null — same pattern as
    // getDeliveries' receivedBy.
    user: row.users?.full_name ?? row.user_name ?? "System",
    action: (row.action.charAt(0).toUpperCase() + row.action.slice(1)) as LogEntry["action"],
    module: row.module,
    description: row.description ?? "",
  }));
}

/**
 * Paginated counterpart to getSystemLogs(), for the System Logs screen
 * (which currently has a decorative prev/next control with no onClick).
 * `page` is 1-indexed; see pageRange() above.
 */
export async function getSystemLogsPage(
  page: number,
  pageSize: number,
): Promise<{ logs: LogEntry[]; totalCount: number }> {
  const supabase = await createClient();
  const [from, to] = pageRange(page, pageSize);

  const { data, count } = await supabase
    .from("system_logs")
    .select("created_at, action, module, description, user_name, users(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<
      {
        created_at: string;
        action: string;
        module: string;
        description: string | null;
        user_name: string | null;
        users: { full_name: string } | null;
      }[]
    >();

  const logs: LogEntry[] = (data ?? []).map((row) => ({
    timestamp: formatPhDateTime(row.created_at),
    user: row.users?.full_name ?? row.user_name ?? "System",
    action: (row.action.charAt(0).toUpperCase() + row.action.slice(1)) as LogEntry["action"],
    module: row.module,
    description: row.description ?? "",
  }));

  return { logs, totalCount: count ?? 0 };
}
