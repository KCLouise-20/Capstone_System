"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  FileText,
  CalendarRange,
  Building2,
  History,
  Printer,
  Download,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, requestStatusTone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { logReportGeneration } from "@/lib/supabase/mutations";
import {
  RisDocumentModal,
  DeliveryDocumentModal,
  PrintHeader,
  PrintTable,
  SignatureBlock,
  FieldView,
  type RisDocumentRecord,
} from "@/components/reports/DocumentModals";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import type { DeliveryRecord, InventoryItem, RequestStatus, StockCardLedgerRow, StockSummaryRow } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";
import { formatPhDate } from "@/lib/datetime";
import type {
  ItemTransactionRow,
  PeriodSummaryReport,
  ReportPeriodType,
  ScioReportRow,
} from "@/lib/supabase/queries";

const reportTypes = [
  { id: "stock-card", label: "Stock Card", hint: "Per Item Ledger", icon: Smartphone },
  { id: "ris-form", label: "RIS / Release Form", hint: "Printable Form", icon: FileText },
  { id: "period", label: "Monthly / Quarterly", hint: "Period Summary", icon: CalendarRange },
  { id: "scio", label: "Per SCIO Report", hint: "By Campus/Dept.", icon: Building2 },
  { id: "history", label: "Transaction History", hint: "Per Item", icon: History },
] as const;

type ReportTabId = (typeof reportTypes)[number]["id"];

/**
 * Shared shape for the "RIS / release form" tab, built server-side in
 * page.tsx from whichever of getRisRecords()/getMyRequests() fits the
 * signed-in role — so this component never needs to know which one it
 * came from.
 */
export interface RisFormRecord {
  refNo: string;
  department?: string;
  date: string;
  status: RequestStatus;
  scio?: string;
  purpose?: string;
  items: { itemName: string; qty: number; stockOnHand?: number }[];
  requestedBy?: string;
  approvedBy?: string;
  remarks?: string;
}

const periodTypeOptions: ReportPeriodType[] = ["monthly", "quarterly", "yearly"];

export function ReportsClient({
  initialTab,
  inventoryItems,
  selectedItemCode,
  ledger,
  transactionHistory,
  periodType,
  periodFrom,
  periodTo,
  periodReport,
  scioReport,
  risRecords,
  selectedRis,
  deliveries,
  letterhead,
  fundCluster,
  stockSummary,
}: {
  initialTab: string;
  inventoryItems: InventoryItem[];
  selectedItemCode: string;
  ledger: StockCardLedgerRow[];
  transactionHistory: ItemTransactionRow[];
  periodType: ReportPeriodType;
  periodFrom: string;
  periodTo: string;
  periodReport: PeriodSummaryReport;
  scioReport: ScioReportRow[];
  risRecords: RisFormRecord[];
  selectedRis: string;
  deliveries: DeliveryRecord[];
  letterhead: DocumentLetterhead;
  /** COA accounting classification — printed only on the Stock Card, next to Entity Name (see legacy form parity). */
  fundCluster: string;
  /** Every item's code/name/current stock/average delivered price — the "Stock Summary List" master-list print, separate from a single item's own detailed ledger. */
  stockSummary: StockSummaryRow[];
}) {
  const router = useRouter();
  const [viewingRis, setViewingRis] = useState<RisDocumentRecord | null>(null);
  const [viewingDelivery, setViewingDelivery] = useState<DeliveryRecord | null>(null);
  // Stock Card has two distinct printable documents sharing one tab: a
  // single item's detailed ledger (the actual government Stock Card form,
  // "ledger") and the all-items master list with average delivered price
  // ("summary", see the Items panel's own Print button). Both use the same
  // .print-area, so only one renders into it at a time.
  const [printMode, setPrintMode] = useState<"ledger" | "summary">("ledger");

  // A Stock Card/Transaction History row's `reference` is either a
  // delivery's ref_no or a release's ris_number — both lists already
  // arrive as full props (risRecords for the ris-form tab, deliveries for
  // this lookup), so opening the right document is just a lookup, no
  // extra fetch.
  function openReferenceDocument(reference: string) {
    const delivery = deliveries.find((d) => d.refNo === reference);
    if (delivery) {
      setViewingDelivery(delivery);
      return;
    }
    const ris = risRecords.find((r) => r.refNo === reference);
    if (ris) {
      setViewingRis({
        refNo: ris.refNo,
        department: ris.department,
        date: ris.date,
        status: ris.status,
        scio: ris.scio,
        purpose: ris.purpose,
        items: ris.items.map((it) => ({
          itemName: it.itemName,
          qty: it.qty,
          unit: inventoryItems.find((i) => i.itemName === it.itemName)?.unit,
          stockOnHand: it.stockOnHand,
        })),
        requestedBy: ris.requestedBy,
        approvedBy: ris.approvedBy,
        remarks: ris.remarks,
      });
    }
  }

  const validInitialTab = reportTypes.find((r) => r.id === initialTab)?.id ?? "stock-card";
  const [selected, setSelected] = useState<ReportTabId>(validInitialTab);

  const active = reportTypes.find((r) => r.id === selected)!;
  const activeItem = inventoryItems.find((i) => i.itemCode === selectedItemCode);
  const activeRis = risRecords.find((r) => r.refNo === selectedRis);

  // No useSearchParams() here on purpose (see src/app/login/page.tsx's
  // comment) — every current filter value this page can be navigated with
  // already arrives as a prop from the server, so the next URL is built
  // from those known values plus whatever the caller is changing, without
  // needing a Suspense boundary just to read the query string back.
  function updateParams(patch: Record<string, string | undefined>) {
    const current: Record<string, string | undefined> = {
      tab: selected,
      item: selectedItemCode || undefined,
      ris: selectedRis || undefined,
      periodType,
      from: periodFrom,
      to: periodTo,
      ...patch,
    };
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(current)) {
      if (value) next.set(key, value);
    }
    router.replace(`/reports?${next.toString()}`, { scroll: false });
  }

  function selectTab(id: ReportTabId) {
    setSelected(id);
    updateParams({ tab: id });
  }

  function selectItem(itemCode: string) {
    updateParams({ item: itemCode });
  }

  function selectRis(refNo: string) {
    updateParams({ ris: refNo });
  }

  function setPeriodType(pt: ReportPeriodType) {
    updateParams({ periodType: pt });
  }

  function setPeriodFrom(value: string) {
    updateParams({ from: value });
  }

  function setPeriodTo(value: string) {
    updateParams({ to: value });
  }

  // Fire-and-forget audit trail: log once per distinct "view" of a tab
  // that has an actual record/range to show — not on an empty picker with
  // nothing selected yet. Never blocks the UI; a failure here is silently
  // swallowed since it's just the reports log, not the report itself.
  useEffect(() => {
    if (selected === "stock-card" && activeItem) {
      void logReportGeneration("stock_card", { itemCode: activeItem.itemCode }).catch(() => {});
    } else if (selected === "history" && activeItem) {
      void logReportGeneration("transaction_history", { itemCode: activeItem.itemCode }).catch(() => {});
    } else if (selected === "period") {
      void logReportGeneration("period_summary", { periodType, from: periodFrom, to: periodTo }).catch(() => {});
    } else if (selected === "scio") {
      void logReportGeneration("scio_report", {}).catch(() => {});
    } else if (selected === "ris-form" && activeRis) {
      void logReportGeneration("ris_release_form", { risNumber: activeRis.refNo }).catch(() => {});
    }
  }, [selected, activeItem, periodType, periodFrom, periodTo, activeRis]);

  // "RIS / release form" is a single official document, not a data table —
  // exporting it means the same formatted, signable printout as Print, not
  // a CSV. Every other tab downloads its underlying table as CSV.
  function exportReport() {
    if (selected === "ris-form") {
      window.print();
      return;
    }

    let header = "";
    let rows: string[] = [];
    let filename = "report.csv";

    if (selected === "stock-card") {
      header = "Date,Reference,Receipt Qty,Unit Cost,Issue Qty,Office,Balance,Days to Consume\n";
      rows = ledger.map(
        (r) =>
          `"${r.date}","${r.reference}",${r.receiptQty ?? ""},${r.unitCost ?? ""},${r.issueQty ?? ""},"${r.office ?? ""}",${r.balance},${r.daysToConsume ?? ""}`,
      );
      filename = `stock-card-${activeItem?.itemCode ?? "item"}.csv`;
    } else if (selected === "history") {
      header = "Date,Type,Reference,Qty,Balance\n";
      rows = transactionHistory.map((r) => `"${r.date}","${r.type}","${r.reference}",${r.qty},${r.balance}`);
      filename = `transaction-history-${activeItem?.itemCode ?? "item"}.csv`;
    } else if (selected === "period") {
      header = "Period,Deliveries,Deliveries Value,Releases,Releases Value\n";
      rows = periodReport.rows.map(
        (r) => `"${r.periodLabel}",${r.deliveriesCount},${r.deliveriesValue},${r.releasesCount},${r.releasesValue}`,
      );
      filename = `${periodType}-summary-${periodFrom}-to-${periodTo}.csv`;
    } else if (selected === "scio") {
      header = "SCIO,Item,Qty\n";
      rows = scioReport.flatMap((row) =>
        row.items.length > 0
          ? row.items.map((it) => `"${row.scio}","${it.itemName}",${it.qty}`)
          : [`"${row.scio}","—",0`],
      );
      filename = "per-scio-report.csv";
    }

    const blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const now = formatPhDate(new Date());

  return (
    <>
    <div className="no-print flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {reportTypes.map((r) => (
          <button
            key={r.id}
            onClick={() => selectTab(r.id)}
            className={cn(
              "flex flex-col items-start gap-2.5 rounded-xl border bg-surface p-4 text-left transition-colors",
              selected === r.id ? "border-foreground border-2" : "border-border hover:bg-background",
            )}
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-background text-foreground">
              <r.icon size={18} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold">{r.label}</span>
              <span className="text-[11px] text-muted-2">{r.hint}</span>
            </div>
          </button>
        ))}
      </div>

      {selected === "stock-card" || selected === "history" ? (
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[300px_1fr]">
        <Card className="no-print">
          <CardHeader
            title="Items"
            action={
              selected === "stock-card" && (
                <button
                  onClick={() => {
                    setPrintMode("summary");
                    requestAnimationFrame(() => window.print());
                  }}
                  title="Print a summary list of every item — code, name, current stock, average delivered price"
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground hover:bg-background"
                >
                  <Printer size={12} strokeWidth={1.8} />
                  Print list
                </button>
              )
            }
          />
          <div className="flex max-h-[560px] flex-col gap-0.5 overflow-y-auto">
            {inventoryItems.map((item) => (
              <div
                key={item.itemCode}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  item.itemCode === selectedItemCode ? "bg-background" : "hover:bg-background/60",
                )}
              >
                <ItemPhoto imageUrl={item.imageUrl} alt={item.itemName} size="sm" />
                <button
                  onClick={() => selectItem(item.itemCode)}
                  className="flex flex-1 items-center justify-between gap-2 text-left text-[12.5px]"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{item.itemName}</span>
                    <span className="text-[11px] text-muted-2">{item.itemCode}</span>
                  </div>
                  <span className="shrink-0 text-[11.5px] font-medium text-muted">
                    {item.onHand} {item.unit}
                  </span>
                </button>
              </div>
            ))}
            {inventoryItems.length === 0 && (
              <p className="py-8 text-center text-muted-2">No inventory items yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[13.5px] font-bold">
              {active.label} preview
              {activeItem && (
                <span className="ml-2 font-normal text-muted-2">
                  — {activeItem.itemName} ({activeItem.itemCode})
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPrintMode("ledger");
                  requestAnimationFrame(() => window.print());
                }}
              >
                <Printer size={14} strokeWidth={1.8} />
                Print
              </Button>
              <Button variant="dark" onClick={exportReport}>
                <Download size={14} strokeWidth={1.8} />
                Export
              </Button>
            </div>
          </div>

        {selected === "stock-card" && (
          activeItem ? (
            <>
              <div className="flex items-center gap-4 rounded-lg bg-background px-4 py-3">
                <ItemPhoto imageUrl={activeItem.imageUrl} alt={activeItem.itemName} size="lg" />
                <div className="grid flex-1 grid-cols-1 gap-4 text-[12.5px] sm:grid-cols-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-2">Item code</span>
                    <span className="font-semibold">{activeItem.itemCode}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-2">Description</span>
                    <span className="font-semibold">{activeItem.description || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-2">Unit</span>
                    <span className="font-semibold">{activeItem.unit}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-2">Reorder level</span>
                    <span className="font-semibold">{activeItem.reorderLevel}</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Date", "Reference", "Receipt qty", "Unit cost", "Issue qty", "Office", "Balance", "Days to consume"].map((h) => (
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
                  {ledger.map((row, i) => {
                    const last = i === ledger.length - 1;
                    const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
                    const clickable = row.reference !== "Opening balance";
                    return (
                      <tr
                        key={`${row.date}-${row.reference}-${i}`}
                        onClick={clickable ? () => openReferenceDocument(row.reference) : undefined}
                        className={clickable ? "cursor-pointer hover:bg-background/60" : ""}
                        title={clickable ? "View document" : undefined}
                      >
                        <td className={`${cell} pl-0 font-semibold`}>{row.date}</td>
                        <td className={`${cell} ${clickable ? "text-foreground underline decoration-border-soft underline-offset-2" : "text-muted"}`}>
                          {row.reference}
                        </td>
                        <td className={`${cell} text-muted`}>{row.receiptQty ?? "—"}</td>
                        <td className={`${cell} text-muted`}>
                          {row.unitCost !== null ? `₱${row.unitCost.toLocaleString()}` : "—"}
                        </td>
                        <td className={`${cell} text-muted`}>{row.issueQty ?? "—"}</td>
                        <td className={`${cell} text-muted`}>{row.office ?? "—"}</td>
                        <td className={`${cell} font-bold`}>{row.balance}</td>
                        <td className={`${cell} text-muted`}>{row.daysToConsume ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 pl-0 text-center text-muted-2">
                        No transaction history for this item yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <EmptyPanel icon={Smartphone} text="No inventory items yet." />
          )
        )}

        {selected === "history" && (
          activeItem ? (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Date", "Type", "Reference", "Qty", "Balance"].map((h) => (
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
                {transactionHistory.map((row, i) => {
                  const last = i === transactionHistory.length - 1;
                  const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
                  return (
                    <tr
                      key={`${row.date}-${row.reference}-${i}`}
                      onClick={() => openReferenceDocument(row.reference)}
                      className="cursor-pointer hover:bg-background/60"
                      title="View document"
                    >
                      <td className={`${cell} pl-0 font-semibold`}>{row.date}</td>
                      <td className={cell}>
                        <Badge tone={row.type === "Receipt" ? "ok" : "low"}>{row.type}</Badge>
                      </td>
                      <td className={`${cell} text-foreground underline decoration-border-soft underline-offset-2`}>
                        {row.reference}
                      </td>
                      <td className={`${cell} text-muted`}>{row.qty}</td>
                      <td className={`${cell} font-bold`}>{row.balance}</td>
                    </tr>
                  );
                })}
                {transactionHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 pl-0 text-center text-muted-2">
                      No transaction history for this item yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          ) : (
            <EmptyPanel icon={History} text="No inventory items yet." />
          )
        )}
        </Card>
      </div>
      ) : (
      <Card>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[13.5px] font-bold">
            {active.label} preview
            {selected === "ris-form" && activeRis && (
              <span className="ml-2 font-normal text-muted-2">— {activeRis.refNo}</span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selected === "ris-form" && risRecords.length > 0 && (
              <select
                value={selectedRis}
                onChange={(e) => selectRis(e.target.value)}
                aria-label="Select RIS"
                className="h-8 rounded-lg border border-border bg-surface px-2 text-[12px] font-medium outline-none"
              >
                {risRecords.map((r) => (
                  <option key={r.refNo} value={r.refNo}>
                    {r.refNo}
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={14} strokeWidth={1.8} />
              Print
            </Button>
            <Button variant="dark" onClick={exportReport}>
              <Download size={14} strokeWidth={1.8} />
              Export
            </Button>
          </div>
        </div>

        {selected === "period" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-background px-3 py-2.5">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
              {periodTypeOptions.map((pt) => (
                <button
                  key={pt}
                  onClick={() => setPeriodType(pt)}
                  className={cn(
                    "h-7 rounded-md px-3 text-[12px] font-semibold capitalize transition-colors",
                    periodType === pt ? "bg-foreground text-white" : "text-muted hover:bg-background",
                  )}
                >
                  {pt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <span>From</span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                aria-label="Period from date"
                className="h-7 rounded-lg border border-border bg-surface px-2 text-[12px] outline-none"
              />
              <span>To</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                aria-label="Period to date"
                className="h-7 rounded-lg border border-border bg-surface px-2 text-[12px] outline-none"
              />
            </div>
          </div>
        )}

        {selected === "period" && (
          periodReport.rows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Period", "Deliveries", "Deliveries value", "Releases", "Releases value"].map((h) => (
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
                  {periodReport.rows.map((row, i) => {
                    const last = i === periodReport.rows.length - 1;
                    const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
                    return (
                      <tr key={row.period}>
                        <td className={`${cell} pl-0 font-semibold`}>{row.periodLabel}</td>
                        <td className={`${cell} text-muted`}>{row.deliveriesCount}</td>
                        <td className={`${cell} text-muted`}>₱{row.deliveriesValue.toLocaleString()}</td>
                        <td className={`${cell} text-muted`}>{row.releasesCount}</td>
                        <td className={`${cell} font-bold`}>₱{row.releasesValue.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              <div className="rounded-lg bg-background px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Top 5 categories
                </span>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {periodReport.topCategories.map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-muted">
                        {i + 1}. {c.name}
                      </span>
                      <span className="font-bold">{c.qty} units</span>
                    </li>
                  ))}
                  {periodReport.topCategories.length === 0 && (
                    <li className="text-[12.5px] text-muted-2">No category activity in this range.</li>
                  )}
                </ul>
              </div>
            </>
          ) : (
            <EmptyPanel icon={CalendarRange} text="No deliveries or releases in this period." />
          )
        )}

        {selected === "scio" && (
          scioReport.length > 0 ? (
            <div className="flex flex-col gap-3">
              {scioReport.map((row) => (
                <div key={row.scio} className="rounded-lg border border-border-soft bg-background px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold">{row.scio}</span>
                    <span className="text-[12px] text-muted-2">
                      {row.releaseCount} release{row.releaseCount === 1 ? "" : "s"} &middot; ₱
                      {row.totalValue.toLocaleString()}
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {row.items.map((it) => (
                      <li key={it.itemName} className="flex items-center justify-between text-[12.5px]">
                        <span className="text-muted">{it.itemName}</span>
                        <span className="font-semibold">{it.qty}</span>
                      </li>
                    ))}
                    {row.items.length === 0 && (
                      <li className="text-[12.5px] text-muted-2">No items recorded.</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={Building2} text="No releases recorded yet." />
          )
        )}

        {selected === "ris-form" && (
          activeRis ? (
            <div className="flex flex-col gap-4 rounded-lg border border-border-soft bg-background p-5">
              <div className="flex items-center justify-between border-b border-border-soft pb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold">RIS No. {activeRis.refNo}</span>
                  <span className="text-[12px] text-muted-2">{activeRis.date || "—"}</span>
                </div>
                <Badge tone={requestStatusTone(activeRis.status)}>{activeRis.status}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 text-[12.5px] sm:grid-cols-3">
                {activeRis.department && <FieldView label="Department" value={activeRis.department} />}
                {activeRis.scio && <FieldView label="SCIO" value={activeRis.scio} />}
                {activeRis.approvedBy && <FieldView label="Approved by" value={activeRis.approvedBy} />}
                {activeRis.purpose && <FieldView label="Purpose" value={activeRis.purpose} />}
                {activeRis.remarks && <FieldView label="Remarks" value={activeRis.remarks} />}
              </div>

              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Item", "Qty requested", "Stock on hand"].map((h) => (
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
                  {activeRis.items.map((it, i) => {
                    const last = i === activeRis.items.length - 1;
                    const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
                    return (
                      <tr key={`${it.itemName}-${i}`}>
                        <td className={`${cell} pl-0 font-semibold`}>{it.itemName}</td>
                        <td className={`${cell} font-bold`}>{it.qty}</td>
                        <td className={`${cell} text-muted`}>{it.stockOnHand ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {activeRis.items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 pl-0 text-center text-muted-2">
                        No items on this request.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            <EmptyPanel icon={FileText} text="No RIS / release records yet." />
          )
        )}
      </Card>
      )}
    </div>

    {/* Print-only formatted output — see .print-area in globals.css. A
        proper letterhead + signature block per report type instead of just
        printing whatever the screen happens to show (which included the
        tab picker, filters, and app chrome). Suppressed while a document
        modal is open so its own print-area (RisDocumentModal/
        DeliveryDocumentModal) is the only thing that prints instead of
        both stacking together. */}
    {!viewingRis && !viewingDelivery && (
    <div className="print-area hidden print:block">
      <PrintHeader
        letterhead={letterhead}
        title={
          selected === "stock-card" && printMode === "summary"
            ? "Stock Summary List"
            : selected === "stock-card"
              ? "Stock Card"
              : selected === "history"
                ? "Transaction History"
                : selected === "period"
                  ? `${periodType[0].toUpperCase()}${periodType.slice(1)} Supply Report`
                  : selected === "scio"
                    ? "Report per SCIO / Campus"
                    : "Requisition and Issue Slip"
        }
        subtitle={
          selected === "stock-card" && printMode === "summary"
            ? "All items — current stock and average delivered price"
            : (selected === "stock-card" || selected === "history") && activeItem
              ? `${activeItem.itemName} (${activeItem.itemCode})`
              : selected === "period"
                ? `${periodFrom} to ${periodTo}`
                : selected === "ris-form" && activeRis
                  ? `RIS No. ${activeRis.refNo}`
                  : undefined
        }
        generatedOn={now}
      />

      {selected === "stock-card" && printMode === "summary" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <span className="font-semibold">Entity Name: </span>
              {letterhead.institutionName}
            </div>
            <div>
              <span className="font-semibold">Fund Cluster: </span>
              {fundCluster || "—"}
            </div>
          </div>
          <PrintTable
            headers={["#", "Item Code", "Item Name", "Current Stock", "Average Price"]}
            rows={stockSummary.map((row, i) => [
              i + 1,
              row.itemCode,
              row.itemName,
              `${row.onHand} ${row.unit}`,
              row.avgUnitCost !== null ? `₱${row.avgUnitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—",
            ])}
          />
          <SignatureBlock lines={[{ label: "Prepared by" }, { label: "Checked by" }]} />
        </>
      )}

      {selected === "stock-card" && printMode === "ledger" && activeItem && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <span className="font-semibold">Entity Name: </span>
              {letterhead.institutionName}
            </div>
            <div>
              <span className="font-semibold">Fund Cluster: </span>
              {fundCluster || "—"}
            </div>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-4 text-[12px]">
            <div>
              <span className="font-semibold">Description: </span>
              {activeItem.description || "—"}
            </div>
            <div>
              <span className="font-semibold">Unit: </span>
              {activeItem.unit}
            </div>
            <div>
              <span className="font-semibold">Reorder level: </span>
              {activeItem.reorderLevel}
            </div>
            <div>
              <span className="font-semibold">Current balance: </span>
              {activeItem.onHand}
            </div>
          </div>
          <PrintTable
            headers={["Date", "Reference", "Receipt Qty", "Unit Cost", "Issue Qty", "Office", "Balance", "Days to Consume"]}
            rows={ledger.map((r) => [
              r.date,
              r.reference,
              r.receiptQty ?? "—",
              r.unitCost !== null ? `₱${r.unitCost.toLocaleString()}` : "—",
              r.issueQty ?? "—",
              r.office ?? "—",
              r.balance,
              r.daysToConsume ?? "—",
            ])}
          />
          <SignatureBlock lines={[{ label: "Prepared by" }, { label: "Checked by" }]} />
        </>
      )}

      {selected === "history" && activeItem && (
        <>
          <PrintTable
            headers={["Date", "Type", "Reference", "Qty", "Balance"]}
            rows={transactionHistory.map((r) => [r.date, r.type, r.reference, r.qty, r.balance])}
          />
          <SignatureBlock lines={[{ label: "Prepared by" }, { label: "Checked by" }]} />
        </>
      )}

      {selected === "period" && (
        <>
          <PrintTable
            headers={["Period", "Deliveries", "Deliveries Value", "Releases", "Releases Value"]}
            rows={periodReport.rows.map((r) => [
              r.periodLabel,
              r.deliveriesCount,
              `₱${r.deliveriesValue.toLocaleString()}`,
              r.releasesCount,
              `₱${r.releasesValue.toLocaleString()}`,
            ])}
          />
          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase">Top Categories</div>
            <ol className="mt-1 list-decimal pl-5 text-[12px]">
              {periodReport.topCategories.map((c) => (
                <li key={c.name}>
                  {c.name} — {c.qty} units
                </li>
              ))}
            </ol>
          </div>
          <SignatureBlock lines={[{ label: "Prepared by" }, { label: "Reviewed by" }, { label: "Approved by" }]} />
        </>
      )}

      {selected === "scio" && (
        <>
          {scioReport.map((row) => (
            <div key={row.scio} className="mb-3">
              <div className="mb-1 text-[12.5px] font-bold">
                {row.scio} — {row.releaseCount} release{row.releaseCount === 1 ? "" : "s"}, ₱
                {row.totalValue.toLocaleString()}
              </div>
              <PrintTable
                headers={["Item", "Qty"]}
                rows={row.items.length > 0 ? row.items.map((it) => [it.itemName, it.qty]) : [["—", "—"]]}
              />
            </div>
          ))}
          <SignatureBlock lines={[{ label: "Prepared by" }, { label: "Reviewed by" }, { label: "Approved by" }]} />
        </>
      )}

      {selected === "ris-form" && activeRis && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-4 text-[12px]">
            {activeRis.department && (
              <div>
                <span className="font-semibold">Department: </span>
                {activeRis.department}
              </div>
            )}
            {activeRis.scio && (
              <div>
                <span className="font-semibold">SCIO: </span>
                {activeRis.scio}
              </div>
            )}
            <div>
              <span className="font-semibold">Status: </span>
              {activeRis.status}
            </div>
            {activeRis.purpose && (
              <div className="col-span-3">
                <span className="font-semibold">Purpose: </span>
                {activeRis.purpose}
              </div>
            )}
            {activeRis.remarks && (
              <div className="col-span-3">
                <span className="font-semibold">Remarks: </span>
                {activeRis.remarks}
              </div>
            )}
          </div>
          <PrintTable
            headers={["Item", "Qty Requested", "Stock on Hand"]}
            rows={activeRis.items.map((it) => [it.itemName, it.qty, it.stockOnHand ?? "—"])}
          />
          <SignatureBlock
            lines={[
              { label: "Requested by", name: activeRis.requestedBy },
              { label: "Approved by", name: activeRis.approvedBy },
              { label: "Received by" },
            ]}
          />
        </>
      )}
    </div>
    )}

    <RisDocumentModal record={viewingRis} onClose={() => setViewingRis(null)} letterhead={letterhead} />
    <DeliveryDocumentModal record={viewingDelivery} onClose={() => setViewingDelivery(null)} letterhead={letterhead} />
    </>
  );
}

function EmptyPanel({ icon: Icon, text }: { icon: typeof Smartphone; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-background py-16 text-center">
      <Icon size={22} strokeWidth={1.6} className="text-muted-2" />
      <span className="text-[13px] font-medium text-muted">{text}</span>
    </div>
  );
}
