import { AppShell } from "@/components/layout/AppShell";
import {
  getInventoryItems,
  getStockCardLedger,
  getStockSummary,
  getItemTransactionHistory,
  getPeriodSummaryReport,
  getScioReport,
  getRisRecords,
  getMyRequests,
  getCurrentUserProfile,
  getSystemSettings,
  getDeliveries,
  type ReportPeriodType,
} from "@/lib/supabase/queries";
import { requirePermission } from "@/lib/supabase/guard";
import { resolveLetterhead } from "@/lib/letterhead";
import { ReportsClient, type RisFormRecord } from "./ReportsClient";

/** Default period-summary window: year-to-date, computed at request time so it never goes stale. */
function defaultPeriodRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    item?: string;
    periodType?: string;
    from?: string;
    to?: string;
    ris?: string;
  }>;
}) {
  await requirePermission("Generate reports");
  const params = await searchParams;
  const { from: defaultFrom, to: defaultTo } = defaultPeriodRange();

  const tabIds = ["stock-card", "ris-form", "period", "scio", "history"];
  const initialTab = tabIds.includes(params.tab ?? "") ? params.tab! : "stock-card";

  const periodType: ReportPeriodType =
    params.periodType === "quarterly" || params.periodType === "yearly" ? params.periodType : "monthly";
  const from = params.from || defaultFrom;
  const to = params.to || defaultTo;

  // "RIS / release form" reuses whichever of these two an officer/admin vs.
  // a faculty/staff requester already has RLS access to (see the "RIS /
  // release form" section of queries.ts) — mapped to one shared shape below
  // so ReportsClient doesn't need to know which source it came from.
  //
  // Gated on the caller's actual granted permissions, not a hardcoded role
  // name — matches Sidebar.tsx's reasoning: a custom role an admin creates
  // with "Process RIS"/"Approve requests" granted has real officer-level RLS
  // access, and a role-name check alone would wrongly fall back to
  // getMyRequests() (own rows only) for that user.
  const profile = await getCurrentUserProfile();
  const isOfficerOrAdmin = Boolean(
    profile?.permissions["Process RIS"] || profile?.permissions["Approve requests"],
  );

  const risRecordsPromise: Promise<RisFormRecord[]> = isOfficerOrAdmin
    ? getRisRecords().then((rows) =>
        rows.map((r) => ({
          refNo: r.risNo,
          department: r.department,
          date: r.date,
          status: r.status,
          scio: r.scio,
          purpose: r.purpose,
          items: r.items.map((it) => ({ itemName: it.itemName, qty: it.qtyRequested, stockOnHand: it.stockOnHand })),
          requestedBy: r.requestedBy,
          approvedBy: r.approvedBy,
        })),
      )
    : getMyRequests().then((rows) =>
        rows.map((r) => ({
          refNo: r.refNo,
          date: r.date,
          status: r.status,
          items: r.items.map((it) => ({ itemName: it.itemName, qty: it.qty })),
          requestedBy: profile?.fullName,
          approvedBy: r.approvedBy,
          remarks: r.remarks,
        })),
      );

  const [inventoryItems, periodReport, scioReport, risRecords, settings, deliveries, stockSummary] = await Promise.all([
    getInventoryItems(),
    getPeriodSummaryReport(periodType, from, to),
    getScioReport(),
    risRecordsPromise,
    getSystemSettings(),
    getDeliveries(),
    getStockSummary(),
  ]);

  // Stock card and transaction history are both "per item" tabs, so they
  // share one item picker/searchParam (?item=) rather than each tracking
  // its own selection.
  const selectedItemCode =
    params.item && inventoryItems.some((i) => i.itemCode === params.item) ? params.item : inventoryItems[0]?.itemCode;

  const [ledger, transactionHistory] = selectedItemCode
    ? await Promise.all([getStockCardLedger(selectedItemCode), getItemTransactionHistory(selectedItemCode)])
    : [[], []];

  const selectedRis =
    params.ris && risRecords.some((r) => r.refNo === params.ris) ? params.ris : risRecords[0]?.refNo;

  return (
    <AppShell title="Generate Reports">
      <ReportsClient
        initialTab={initialTab}
        inventoryItems={inventoryItems}
        selectedItemCode={selectedItemCode ?? ""}
        ledger={ledger}
        transactionHistory={transactionHistory}
        periodType={periodType}
        periodFrom={from}
        periodTo={to}
        periodReport={periodReport}
        scioReport={scioReport.rows}
        risRecords={risRecords}
        selectedRis={selectedRis ?? ""}
        deliveries={deliveries}
        letterhead={resolveLetterhead(settings)}
        fundCluster={settings?.fundCluster ?? ""}
        stockSummary={stockSummary}
      />
    </AppShell>
  );
}
