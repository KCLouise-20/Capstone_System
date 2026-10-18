"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Download, ChevronDown, ScanLine } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, requestStatusTone, stockStatusTone } from "@/components/ui/Badge";
import { QrScannerModal } from "@/components/qr/QrScannerModal";
import {
  createRisRequest,
  saveRisRequestDraft,
  submitDraftRequest,
  deleteRelease,
  approveRelease,
  rejectRelease,
  markReleaseReleased,
  type MutationResult,
} from "@/lib/supabase/mutations";
import { RisDocumentPanel, type RisDocumentRecord } from "@/components/reports/DocumentModals";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import type { InventoryItem, RisRecord, StockStatus } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";

interface DraftLine {
  itemName: string;
  qty: number;
  stock: number;
  stockStatus: StockStatus;
}

export function ReleasesClient({
  risRecords,
  inventoryItems,
  departmentNames,
  letterhead,
}: {
  risRecords: RisRecord[];
  inventoryItems: InventoryItem[];
  departmentNames: string[];
  letterhead: DocumentLetterhead;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingDraft, startDraftTransition] = useTransition();
  const [isActing, startActionTransition] = useTransition();
  const [viewingRis, setViewingRis] = useState<RisDocumentRecord | null>(null);
  const [risScanVerified, setRisScanVerified] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pendingItem, setPendingItem] = useState(inventoryItems[0]?.itemName ?? "");
  const [pendingQty, setPendingQty] = useState(1);
  // Shown on the Qty field's own label so the unit is visible while
  // picking a quantity, not just after the line's been added below.
  const pendingUnit = inventoryItems.find((i) => i.itemName === pendingItem)?.unit ?? "";
  const pendingItemPhoto = inventoryItems.find((i) => i.itemName === pendingItem)?.imageUrl ?? null;
  const [statusFilter, setStatusFilter] = useState("All status");
  const [department, setDepartment] = useState(departmentNames[0] ?? "");
  const [scio, setScio] = useState("");
  const [purpose, setPurpose] = useState("");
  const [releaseDate, setReleaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState("");

  const [actioningRisNo, setActioningRisNo] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  function addLine() {
    const item = inventoryItems.find((i) => i.itemName === pendingItem);
    if (!item || pendingQty <= 0) return;
    // Merge into an existing line for the same item — release_items has a
    // unique (release_id, item_id) constraint, so two rows for one item
    // would fail the insert outright.
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.itemName === item.itemName);
      if (existingIndex === -1) {
        return [...prev, { itemName: item.itemName, qty: pendingQty, stock: item.onHand, stockStatus: item.status }];
      }
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], qty: next[existingIndex].qty + pendingQty };
      return next;
    });
    setPendingQty(1);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setLines([]);
    setPurpose("");
    setFormError("");
  }

  function submitForApproval() {
    if (!department.trim() || lines.length === 0) {
      setFormError("Department and at least one item to release are required.");
      return;
    }

    startTransition(async () => {
      const result = await createRisRequest({
        department,
        scio,
        purpose: purpose || undefined,
        date: releaseDate,
        items: lines.map((l) => ({ itemName: l.itemName, qty: l.qty })),
      });

      if (result.error) {
        setFormError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function saveDraft() {
    startDraftTransition(async () => {
      const result = await saveRisRequestDraft({
        department,
        scio,
        purpose: purpose || undefined,
        date: releaseDate,
        items: lines.map((l) => ({ itemName: l.itemName, qty: l.qty })),
      });

      if (result.error) {
        setFormError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function exportHistoryCsv() {
    const header = "RIS No,Department,Date,Status\n";
    const rows = filteredHistory.map((r) => `${r.risNo},${r.department},${r.date},${r.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ris-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function runAction(risNo: string, action: () => Promise<MutationResult>) {
    setActioningRisNo(risNo);
    startActionTransition(async () => {
      const result = await action();
      setActionErrors((prev) => {
        const next = { ...prev };
        if (result.error) {
          next[risNo] = result.error;
        } else {
          delete next[risNo];
        }
        return next;
      });
      setActioningRisNo(null);
      if (!result.error) router.refresh();
    });
  }

  const filteredHistory = risRecords.filter(
    (r) => statusFilter === "All status" || r.status === statusFilter,
  );

  function openDocument(r: RisRecord, opts?: { verified?: boolean }) {
    setRisScanVerified(Boolean(opts?.verified));
    setViewingRis({
      refNo: r.risNo,
      department: r.department,
      date: r.date,
      status: r.status,
      scio: r.scio,
      purpose: r.purpose,
      items: r.items.map((it) => ({
        itemName: it.itemName,
        qty: it.qtyRequested,
        unit: inventoryItems.find((i) => i.itemName === it.itemName)?.unit,
        stockOnHand: it.stockOnHand,
      })),
      requestedBy: r.requestedBy,
      approvedBy: r.approvedBy,
    });
  }

  // Scanning a requester's printed claim slip QR (see RisDocumentModal's
  // print output) — looked up against the full, live risRecords list (not
  // just filteredHistory) so an officer scanning a slip while a status
  // filter is applied still gets a real match. Matching by number is only
  // the lookup key; the actual verification is opening this modal and
  // seeing the record's real current status, requester, and items instead
  // of trusting what's printed on paper.
  function handleScanDetect(code: string): string | undefined {
    const match = risRecords.find((r) => r.risNo === code);
    if (!match) return `No RIS found for number "${code}".`;
    setScanOpen(false);
    openDocument(match, { verified: true });
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
      {viewingRis ? (
        <RisDocumentPanel
          record={viewingRis}
          onClose={() => setViewingRis(null)}
          letterhead={letterhead}
          scanVerified={risScanVerified}
        />
      ) : (
      <Card className="no-print">
        <CardHeader title="New RIS Form" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Release date">
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Requested by (dept.)">
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input">
              {departmentNames.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="SCIO">
          <input
            value={scio}
            onChange={(e) => setScio(e.target.value)}
            placeholder="e.g. Main Campus"
            className="input placeholder:text-muted-2"
          />
        </Field>

        <Field label="Purpose">
          <textarea
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="State the purpose of this release..."
            className="input h-auto resize-none py-2 placeholder:text-muted-2"
          />
        </Field>

        <div className="mt-1 flex flex-col gap-2.5 border-t border-border-soft pt-3.5">
          <span className="text-xs font-bold text-muted">Items to release</span>
          <div className="flex flex-wrap items-end gap-2">
            <ItemPhoto imageUrl={pendingItemPhoto} alt={pendingItem || "Selected item"} size="md" />
            <Field label="Item" className="min-w-[160px] flex-1">
              <select
                value={pendingItem}
                onChange={(e) => setPendingItem(e.target.value)}
                className="input"
              >
                {inventoryItems.map((i) => (
                  <option key={i.itemCode} value={i.itemName}>
                    {i.itemName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={pendingUnit ? `Qty (${pendingUnit})` : "Qty"} className="w-24">
              <input
                type="number"
                min={1}
                value={pendingQty}
                onChange={(e) => setPendingQty(Number(e.target.value))}
                className="input"
              />
            </Field>
            <button
              onClick={addLine}
              className="mb-0.5 flex size-9.5 shrink-0 items-center justify-center rounded-lg bg-foreground text-white hover:bg-black"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>

          {lines.length > 0 && (
            <div className="flex flex-col rounded-lg border border-border-soft">
              {lines.map((line, i) => {
                const invItem = inventoryItems.find((it) => it.itemName === line.itemName);
                const unit = invItem?.unit ?? "";
                return (
                <div
                  key={`${line.itemName}-${i}`}
                  className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-[12.5px] ${
                    i !== lines.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ItemPhoto imageUrl={invItem?.imageUrl ?? null} alt={line.itemName} size="sm" />
                    <span className="font-medium">{line.itemName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted">
                    <span>Qty req. {line.qty} {unit}</span>
                    <span>Stock {line.stock}</span>
                    {line.stockStatus !== "OK" && (
                      <Badge tone={stockStatusTone(line.stockStatus)} className="!px-2 !py-0.5">
                        {line.stockStatus}
                      </Badge>
                    )}
                    <button
                      onClick={() => removeLine(i)}
                      aria-label={`Remove ${line.itemName}`}
                      className="flex size-7 shrink-0 items-center justify-center text-critical-text"
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12px] font-medium text-critical-text"
          >
            {formError}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-3.5">
          <Button
            variant="outline"
            onClick={saveDraft}
            disabled={isSavingDraft || isPending}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            variant="dark"
            onClick={submitForApproval}
            disabled={isPending || isSavingDraft}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Submitting..." : "Submit for Approval"}
          </Button>
        </div>
      </Card>
      )}

      <Card className="no-print">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-bold">RIS History</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter RIS history by status"
                className="h-8 appearance-none rounded-lg border border-border bg-surface pl-2.5 pr-7 text-[12px] font-medium outline-none"
              >
                <option>All status</option>
                <option>Draft</option>
                <option>Pending</option>
                <option>Approved</option>
                <option>Rejected</option>
                <option>Released</option>
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-2"
              />
            </div>
            <button
              onClick={() => setScanOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12px] font-semibold text-foreground hover:bg-background"
            >
              <ScanLine size={14} strokeWidth={1.8} />
              Scan to Verify
            </button>
            <button
              onClick={exportHistoryCsv}
              aria-label="Export RIS history as CSV"
              className="flex size-8 items-center justify-center rounded-lg border border-border text-[#52525b] hover:bg-background"
            >
              <Download size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          {filteredHistory.map((r, i) => (
            <div
              key={r.risNo}
              className={`flex flex-col gap-1 py-2.5 text-[12.5px] ${
                i !== filteredHistory.length - 1 ? "border-b border-border-soft" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => openDocument(r)}
                  className="flex flex-col gap-0.5 text-left hover:opacity-70"
                  title="View document"
                >
                  <span className="font-semibold underline decoration-border-soft underline-offset-2">
                    {r.risNo}
                  </span>
                  <span className="text-muted-2">
                    {r.department} &middot; {r.date} &middot; {r.items.length} item{r.items.length === 1 ? "" : "s"}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <Badge tone={requestStatusTone(r.status)}>{r.status}</Badge>
                  {r.status === "Draft" && (
                    <>
                      <button
                        onClick={() => runAction(r.risNo, () => submitDraftRequest(r.risNo))}
                        disabled={isActing && actioningRisNo === r.risNo}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-bold text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Submit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete draft ${r.risNo}? This can't be undone.`)) {
                            runAction(r.risNo, () => deleteRelease(r.risNo));
                          }
                        }}
                        disabled={isActing && actioningRisNo === r.risNo}
                        aria-label={`Delete draft ${r.risNo}`}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-critical-border bg-critical-bg text-critical-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 size={12} strokeWidth={1.8} />
                      </button>
                    </>
                  )}
                  {r.status === "Pending" && (
                    <>
                      <button
                        onClick={() => runAction(r.risNo, () => approveRelease(r.risNo))}
                        disabled={isActing && actioningRisNo === r.risNo}
                        className="rounded-md border border-ok-border bg-ok-bg px-2 py-1 text-[11px] font-bold text-ok-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => runAction(r.risNo, () => rejectRelease(r.risNo))}
                        disabled={isActing && actioningRisNo === r.risNo}
                        className="rounded-md border border-critical-border bg-critical-bg px-2 py-1 text-[11px] font-bold text-critical-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === "Approved" && (
                    <button
                      onClick={() => runAction(r.risNo, () => markReleaseReleased(r.risNo))}
                      disabled={isActing && actioningRisNo === r.risNo}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-bold text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
              {actionErrors[r.risNo] && (
                <p role="alert" className="text-[11.5px] font-medium text-critical-text">
                  {actionErrors[r.risNo]}
                </p>
              )}
            </div>
          ))}
          {filteredHistory.length === 0 && (
            <p className="py-6 text-center text-muted-2">No RIS records match this filter.</p>
          )}
        </div>
      </Card>
    </div>

    <QrScannerModal
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      title="Scan Claim Slip"
      instructions="Point the camera at the requester's printed claim slip QR code to pull up and verify their request before releasing items."
      onDetect={handleScanDetect}
    />
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-xs font-semibold text-muted ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}
