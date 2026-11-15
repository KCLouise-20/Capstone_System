"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, requestStatusTone, stockStatusTone } from "@/components/ui/Badge";
import {
  submitSupplyRequest,
  saveSupplyRequestDraft,
  submitDraftRequest,
  deleteRelease,
} from "@/lib/supabase/mutations";
import { RisDocumentPanel, type RisDocumentRecord } from "@/components/reports/DocumentModals";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import { todayPh } from "@/lib/datetime";
import type { InventoryItem, StockStatus, SupplyRequest } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";

interface DraftLine {
  itemName: string;
  qty: number;
  stock: number;
  stockStatus: StockStatus;
}

export function RequestSuppliesClient({
  myRequests,
  inventoryItems,
  department,
  requestedBy,
  letterhead,
}: {
  myRequests: SupplyRequest[];
  inventoryItems: InventoryItem[];
  /** The signed-in user's own department, assigned by Admin — not editable here (see submitSupplyRequest). */
  department: string;
  requestedBy: string;
  letterhead: DocumentLetterhead;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingDraft, startDraftTransition] = useTransition();
  const [isPromoting, startPromoteTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [viewingRis, setViewingRis] = useState<RisDocumentRecord | null>(null);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pendingItem, setPendingItem] = useState(inventoryItems[0]?.itemName ?? "");
  const [pendingQty, setPendingQty] = useState(1);
  const pendingInventoryItem = inventoryItems.find((i) => i.itemName === pendingItem);
  const pendingUnit = pendingInventoryItem?.unit ?? "";
  const pendingItemPhoto = pendingInventoryItem?.imageUrl ?? null;
  const [dateNeeded, setDateNeeded] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [selectedRef, setSelectedRef] = useState(myRequests[0]?.refNo ?? "");
  const [formError, setFormError] = useState("");
  const [promotingRef, setPromotingRef] = useState<string | null>(null);
  const [deletingRef, setDeletingRef] = useState<string | null>(null);

  const selected = myRequests.find((r) => r.refNo === selectedRef) ?? myRequests[0];

  // How many of the item being picked are already on the draft. Counts
  // toward the stock check below, because addLine merges a repeated item
  // into the one existing row rather than adding a second one.
  const pendingExistingQty =
    lines.find((l) => l.itemName === pendingItem)?.qty ?? 0;

  // True when what's already on the draft plus what's being picked exceeds
  // stock on hand. This BLOCKS the add and Submit (see addLine and
  // submitRequest) instead of just colouring the hint red.
  const pendingOverStock =
    !!pendingInventoryItem &&
    pendingExistingQty + pendingQty > pendingInventoryItem.onHand;

  // Today's date in Philippine time, YYYY-MM-DD — the shape the date input
  // uses, so it can be compared as a plain string. Manila-pinned on purpose:
  // a request filed at 7am in Manila is still "yesterday" in UTC, and a
  // UTC-derived today would wrongly reject a legitimate same-day request.
  const today = todayPh();
  const dateInPast = !!dateNeeded && dateNeeded < today;

  function addLine() {
    const item = inventoryItems.find((i) => i.itemName === pendingItem);
    if (!item || pendingQty <= 0) return;

    // Hard block: refuse the line outright when the running total for this
    // item would exceed stock on hand. release_items merges duplicates into
    // one row (unique (release_id, item_id)), so the existing line's
    // quantity has to count too — otherwise adding 3 twice past a stock of
    // 4 would slip through.
    const existingQty = lines.find((l) => l.itemName === item.itemName)?.qty ?? 0;
    const totalRequested = existingQty + pendingQty;
    if (totalRequested > item.onHand) {
      setFormError(
        existingQty > 0
          ? `Only ${item.onHand} ${item.unit} of ${item.itemName} are on hand, and ${existingQty} ${item.unit} ${existingQty === 1 ? "is" : "are"} already requested. Reduce the quantity.`
          : `Only ${item.onHand} ${item.unit} of ${item.itemName} ${item.onHand === 1 ? "is" : "are"} on hand. Reduce the quantity.`,
      );
      return;
    }

    setFormError("");
    // Merge into an existing line for the same item — release_items has a
    // unique (release_id, item_id) constraint, so two rows for one item
    // would fail the insert outright.
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.itemName === item.itemName);
      if (existingIndex === -1) {
        return [
          ...prev,
          {
            itemName: item.itemName,
            qty: pendingQty,
            // Snapshot stock at pick time, same pattern as ReleasesClient's
            // addLine — the row then shows the figure as it was when added,
            // and the stock badge alongside it.
            stock: item.onHand,
            stockStatus: item.status,
          },
        ];
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

  /**
   * Last line of defence before the insert: re-checks every queued line
   * against the stock figures this page was rendered with. Catches a line
   * that was valid when added but whose item has since been release-edited
   * down (another Officer acting while this form sat open), and any caller
   * that skipped the addLine guard. The authoritative check is still the
   * server's — submitSupplyRequest compares against live stock_quantity.
   */
  function findOverStockLine(): DraftLine | undefined {
    return lines.find((line) => {
      const item = inventoryItems.find((i) => i.itemName === line.itemName);
      return !!item && line.qty > item.onHand;
    });
  }

  function submitRequest() {
    if (lines.length === 0) {
      setFormError("Add at least one item before submitting your request.");
      return;
    }

    // Same-day is allowed — an Officer can still act on a request filed
    // today. Only a genuinely earlier calendar date is refused. Strings
    // compare correctly here because both sides are zero-padded YYYY-MM-DD
    // and both come from the same Manila-pinned clock.
    if (!dateNeeded) {
      setFormError("Set the date you need this.");
      return;
    }
    if (dateInPast) {
      setFormError("The date needed can't be in the past. Pick today or a later date.");
      return;
    }

    const overStock = findOverStockLine();
    if (overStock) {
      const item = inventoryItems.find((i) => i.itemName === overStock.itemName);
      setFormError(
        `Only ${item?.onHand ?? overStock.stock} ${item?.unit ?? ""} of ${overStock.itemName} ${(item?.onHand ?? overStock.stock) === 1 ? "is" : "are"} available. Reduce the quantity before submitting.`.trim(),
      );
      return;
    }

    startTransition(async () => {
      // department is intentionally omitted — the server always files this
      // under the signed-in user's own department, see submitSupplyRequest.
      const result = await submitSupplyRequest({
        purpose: purpose || undefined,
        date: dateNeeded,
        items: lines,
      });

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setLines([]);
      setPurpose("");
      setFormError("");
      if (result.data?.refNo) setSelectedRef(result.data.refNo);
      router.refresh();
    });
  }

  function saveDraft() {
    if (dateInPast) {
      setFormError("The date needed can't be in the past. Pick today or a later date.");
      return;
    }

    startDraftTransition(async () => {
      const result = await saveSupplyRequestDraft({
        purpose: purpose || undefined,
        date: dateNeeded,
        items: lines,
      });

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setLines([]);
      setPurpose("");
      setFormError("");
      if (result.data?.refNo) setSelectedRef(result.data.refNo);
      router.refresh();
    });
  }

  function promoteDraft(refNo: string) {
    setPromotingRef(refNo);
    startPromoteTransition(async () => {
      const result = await submitDraftRequest(refNo);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormError("");
      router.refresh();
    });
  }

  function deleteDraft(refNo: string) {
    if (!confirm(`Delete draft ${refNo}? This can't be undone.`)) return;
    setDeletingRef(refNo);
    startDeleteTransition(async () => {
      const result = await deleteRelease(refNo);
      if (result.error) {
        setFormError(result.error);
        setDeletingRef(null);
        return;
      }
      setFormError("");
      if (selectedRef === refNo) setSelectedRef("");
      router.refresh();
    });
  }

  // Once Approved/Released, this same document doubles as the requester's
  // printable claim slip (see RisDocumentModal — it renders a QR code for
  // those two statuses) to carry when picking up items: the Supply Officer
  // scans it on Releases to pull up and confirm this exact record before
  // handing anything over, instead of just taking the requester's word for
  // it.
   function openDocument(r: SupplyRequest) {
    setViewingRis({
      refNo: r.refNo,
      department,
      date: r.date,
      status: r.status,
      items: r.items.map((it) => ({
        itemName: it.itemName,
        qty: it.qty,
        unit: it.unit,
        stockOnHand: it.stockOnHand,
      })),
      requestedBy,
      approvedBy: r.approvedBy,
      // Was omitted entirely, which is why the receipt had no date line.
      approvedOn: r.approvedOn,
      remarks: r.remarks,
    });
  }


  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.2fr_1fr]">
      {viewingRis ? (
        <RisDocumentPanel record={viewingRis} onClose={() => setViewingRis(null)} letterhead={letterhead} />
      ) : (
      <Card className="no-print">
        <CardHeader title="New Supply Request" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Department">
            <div className="input flex items-center bg-background text-muted">{department}</div>
          </Field>
          <Field label="Date needed">
            <input
              type="date"
              value={dateNeeded}
              min={today}
              onChange={(e) => setDateNeeded(e.target.value)}
              className="input"
            />
            {dateInPast && (
              <span className="text-[11px] font-medium text-critical-text">
                This date is in the past.
              </span>
            )}
          </Field>
        </div>

        <Field label="Purpose">
          <textarea
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="State the purpose of your request..."
            className="input h-auto resize-none py-2 placeholder:text-muted-2"
          />
        </Field>

        <div className="mt-1 flex flex-col gap-2.5 border-t border-border-soft pt-3.5">
          <span className="text-xs font-bold text-muted">Requested items</span>
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
              disabled={pendingOverStock}
              title={pendingOverStock ? "Quantity exceeds stock on hand" : undefined}
              className="mb-0.5 flex size-9.5 shrink-0 items-center justify-center rounded-lg bg-foreground text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>

          {pendingInventoryItem && (
            <p className={`text-[11.5px] ${pendingOverStock ? "text-critical-text" : "text-muted"}`}>
              {pendingInventoryItem.onHand} {pendingUnit} on hand
              {pendingExistingQty > 0 && ` · ${pendingExistingQty} already requested`}
              {pendingOverStock && " — exceeds available stock"}
            </p>
          )}

          {lines.length > 0 && (
            <div className="flex flex-col rounded-lg border border-border-soft">
              {lines.map((line, i) => {
                const invItem = inventoryItems.find((it) => it.itemName === line.itemName);
                const unit = invItem?.unit ?? "";
                const overStock = !!invItem && line.qty > invItem.onHand;
                return (
                <div
                  key={`${line.itemName}-${i}`}
                  className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-[12.5px] ${
                    i !== lines.length - 1 ? "border-b border-border-soft" : ""
                  } ${overStock ? "bg-critical-bg" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <ItemPhoto imageUrl={invItem?.imageUrl ?? null} alt={line.itemName} size="sm" />
                    <span className="font-medium">{line.itemName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted">
                    <span>Qty req. {line.qty} {unit}</span>
                    <span className={overStock ? "font-semibold text-critical-text" : ""}>
                      Stock {invItem?.onHand ?? line.stock}
                    </span>
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
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="disabled:cursor-not-allowed disabled:opacity-60"
            onClick={saveDraft}
            disabled={isSavingDraft || isPending}
          >
            {isSavingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            variant="dark"
            className="disabled:cursor-not-allowed disabled:opacity-60"
            onClick={submitRequest}
            disabled={isPending || isSavingDraft}
          >
            {isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </Card>
      )}

      <div className="flex flex-col gap-3.5">
        <Card className="no-print">
          <CardHeader title="My Request Status" />
          <div className="flex flex-col">
            {myRequests.map((r, i) => (
              <div
                key={r.refNo}
                className={`flex items-center justify-between gap-2 py-2.5 text-[12.5px] ${
                  i !== myRequests.length - 1 ? "border-b border-border-soft" : ""
                }`}
              >
                <button
                  onClick={() => setSelectedRef(r.refNo)}
                  className={`flex flex-1 flex-col gap-0.5 text-left ${
                    r.refNo === selectedRef ? "opacity-100" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <span className="font-semibold">{r.refNo}</span>
                  <span className="text-muted-2">
                    {r.date} &middot; {r.itemCount} items
                  </span>
                </button>
                {r.status === "Draft" && (
                  <>
                    <button
                      onClick={() => promoteDraft(r.refNo)}
                      disabled={isPromoting && promotingRef === r.refNo}
                      className="text-[11px] font-semibold text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPromoting && promotingRef === r.refNo ? "Submitting..." : "Submit"}
                    </button>
                    <button
                      onClick={() => deleteDraft(r.refNo)}
                      disabled={isDeleting && deletingRef === r.refNo}
                      aria-label={`Delete draft ${r.refNo}`}
                      className="flex size-6 shrink-0 items-center justify-center text-critical-text disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={12} strokeWidth={1.8} />
                    </button>
                  </>
                )}
                {r.status !== "Draft" && (
                  <button
                    onClick={() => openDocument(r)}
                    aria-label={`View or print document for ${r.refNo}`}
                    title={
                      r.status === "Approved" || r.status === "Released"
                        ? "View / print claim slip"
                        : "View document"
                    }
                    className="flex size-6 shrink-0 items-center justify-center text-muted hover:text-foreground"
                  >
                    <FileText size={13} strokeWidth={1.8} />
                  </button>
                )}
                <Badge tone={requestStatusTone(r.status)}>{r.status}</Badge>
              </div>
            ))}
            {myRequests.length === 0 && (
              <p className="py-6 text-center text-muted-2">You haven&apos;t submitted any requests yet.</p>
            )}
          </div>
        </Card>

        {selected && (
          <Card className="no-print">
            <CardHeader title={`${selected.refNo} details`} />
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <DetailRow label="Status">
                <Badge tone={requestStatusTone(selected.status)}>{selected.status}</Badge>
              </DetailRow>
              <DetailRow label="Approved by" value={selected.approvedBy ?? "—"} />
              <DetailRow label="Approved on" value={selected.approvedOn ?? "—"} />
              <DetailRow label="Remarks" value={selected.remarks ?? "—"} />
            </div>
          </Card>
        )}
      </div>
    </div>
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

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-soft pb-2.5 last:border-b-0 last:pb-0">
      <span className="text-muted-2">{label}</span>
      {children ?? <span className="font-semibold">{value}</span>}
    </div>
  );
}
