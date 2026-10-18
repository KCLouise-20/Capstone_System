"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DeliveryDocumentPanel } from "@/components/reports/DocumentModals";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import { recordDelivery } from "@/lib/supabase/mutations";
import type { DeliveryRecord, InventoryItem } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";

interface DraftLine {
  itemName: string;
  qty: number;
  unitCost: number;
}

function nextDeliveryRef(list: DeliveryRecord[]) {
  const year = new Date().getFullYear();
  const nums = list.map((d) => parseInt(d.refNo.split("-").pop() ?? "0", 10));
  const max = nums.length ? Math.max(...nums) : 0;
  return `DEL-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function DeliveriesClient({
  deliveries,
  inventoryItems,
  receivedByName,
  letterhead,
}: {
  deliveries: DeliveryRecord[];
  inventoryItems: InventoryItem[];
  receivedByName: string;
  letterhead: DocumentLetterhead;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [viewingDelivery, setViewingDelivery] = useState<DeliveryRecord | null>(null);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pendingItem, setPendingItem] = useState(inventoryItems[0]?.itemName ?? "");
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingCost, setPendingCost] = useState(0);
  // Shown on the Qty field's own label so the unit is visible while
  // picking a quantity, not just after the line's been added below.
  const pendingUnit = inventoryItems.find((i) => i.itemName === pendingItem)?.unit ?? "";
  const pendingItemPhoto = inventoryItems.find((i) => i.itemName === pendingItem)?.imageUrl ?? null;
  const [supplier, setSupplier] = useState("");
  const [orNumber, setOrNumber] = useState("");
  const [dateDelivered, setDateDelivered] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [formError, setFormError] = useState("");

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  const refNo = nextDeliveryRef(deliveries);

  function addLine() {
    if (!pendingItem || pendingQty <= 0) return;
    // Merge into an existing line for the same item rather than pushing a
    // second row — delivery_items has a unique (delivery_id, item_id)
    // constraint, so two rows for one item would fail the insert outright.
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.itemName === pendingItem);
      if (existingIndex === -1) {
        return [...prev, { itemName: pendingItem, qty: pendingQty, unitCost: pendingCost }];
      }
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        qty: next[existingIndex].qty + pendingQty,
        unitCost: pendingCost,
      };
      return next;
    });
    setPendingQty(1);
    setPendingCost(0);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function saveDelivery() {
    if (!supplier.trim() || lines.length === 0) {
      setFormError("Supplier name and at least one delivery item are required.");
      return;
    }

    startTransition(async () => {
      const result = await recordDelivery({
        refNo,
        supplier: supplier.trim(),
        poNumber: orNumber.trim() || undefined,
        date: dateDelivered,
        items: lines,
      });

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setLines([]);
      setSupplier("");
      setOrNumber("");
      setFormError("");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
      {viewingDelivery ? (
        <DeliveryDocumentPanel record={viewingDelivery} onClose={() => setViewingDelivery(null)} letterhead={letterhead} />
      ) : (
      <Card className="no-print">
        <CardHeader title="New Delivery Record" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Delivery ref. no.">
            <input readOnly value={refNo} className="input" />
          </Field>
          <Field label="Date delivered">
            <input
              type="date"
              value={dateDelivered}
              onChange={(e) => setDateDelivered(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier name"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="OR / PO number">
            <input
              value={orNumber}
              onChange={(e) => setOrNumber(e.target.value)}
              placeholder="e.g. OR-00482"
              className="input placeholder:text-muted-2"
            />
          </Field>
        </div>

        <Field label="Received by">
          <input readOnly value={receivedByName} className="input" />
        </Field>

        <div className="mt-1 flex flex-col gap-2.5 border-t border-border-soft pt-3.5">
          <span className="text-xs font-bold text-muted">Delivery items</span>
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
            <Field label="Unit cost" className="w-24">
              <input
                type="number"
                min={0}
                value={pendingCost}
                onChange={(e) => setPendingCost(Number(e.target.value))}
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
                  <div className="flex items-center gap-4 text-muted">
                    <span>{line.qty} {unit}</span>
                    <span>&#8369;{line.unitCost.toLocaleString()}</span>
                    <span className="font-bold text-foreground">
                      &#8369;{(line.qty * line.unitCost).toLocaleString()}
                    </span>
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
        <div className="flex items-center justify-between border-t border-border-soft pt-3.5">
          <span className="text-[13px] font-semibold">
            Total: <span className="font-extrabold">&#8369;{total.toLocaleString()}.00</span>
          </span>
          <Button
            variant="dark"
            onClick={saveDelivery}
            disabled={isPending}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save Delivery"}
          </Button>
        </div>
      </Card>
      )}

      <Card className="no-print">
        <CardHeader title="Recent Deliveries" />
        <div className="flex flex-col">
          {deliveries.map((d, i) => (
            <button
              key={d.refNo}
              onClick={() => setViewingDelivery(d)}
              className={`flex items-center justify-between py-2.5 text-left text-[12.5px] hover:bg-background ${
                d.refNo === viewingDelivery?.refNo ? "bg-background" : ""
              } ${i !== deliveries.length - 1 ? "border-b border-border-soft" : ""}`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">{d.refNo}</span>
                <span className="text-muted-2">{d.supplier}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-muted">{d.date}</span>
                <span className="text-muted-2">{d.itemCount} items</span>
              </div>
            </button>
          ))}
          {deliveries.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-muted-2">No deliveries recorded yet.</p>
          )}
        </div>
      </Card>
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
