"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, requestStatusTone } from "@/components/ui/Badge";
import {
  submitSupplyRequest,
  saveSupplyRequestDraft,
  submitDraftRequest,
  deleteRelease,
} from "@/lib/supabase/mutations";
import { RisDocumentPanel, type RisDocumentRecord } from "@/components/reports/DocumentModals";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import type { InventoryItem, SupplyRequest } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";

interface DraftLine {
  itemName: string;
  qty: number;
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
  // Shown on the Qty field's own label so the unit is visible while
  // picking a quantity, not just after the line's been added below.
  const pendingUnit = inventoryItems.find((i) => i.itemName === pendingItem)?.unit ?? "";
  const pendingItemPhoto = inventoryItems.find((i) => i.itemName === pendingItem)?.imageUrl ?? null;
  const [dateNeeded, setDateNeeded] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [selectedRef, setSelectedRef] = useState(myRequests[0]?.refNo ?? "");
  const [formError, setFormError] = useState("");
  const [promotingRef, setPromotingRef] = useState<string | null>(null);
  const [deletingRef, setDeletingRef] = useState<string | null>(null);

  const selected = myRequests.find((r) => r.refNo === selectedRef) ?? myRequests[0];

  function addLine() {
    if (!pendingItem || pendingQty <= 0) return;
    // Merge into an existing line for the same item — release_items has a
    // unique (release_id, item_id) constraint, so two rows for one item
    // would fail the insert outright.
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.itemName === pendingItem);
      if (existingIndex === -1) {
        return [...prev, { itemName: pendingItem, qty: pendingQty }];
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

  function submitRequest() {
    if (lines.length === 0) {
      setFormError("Add at least one item before submitting your request.");
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
      items: r.items.map((it) => ({ itemName: it.itemName, qty: it.qty, unit: it.unit })),
      requestedBy,
      approvedBy: r.approvedBy,
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
              onChange={(e) => setDateNeeded(e.target.value)}
              className="input"
            />
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
                    <span>{line.qty} {unit}</span>
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
