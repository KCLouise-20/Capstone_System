"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Search, ChevronDown, Plus, Pencil, QrCode, ScanLine, ImagePlus, Trash2, Ban, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, stockStatusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { QrScannerModal } from "@/components/qr/QrScannerModal";
import { ItemPhoto } from "@/components/inventory/ItemPhoto";
import {
  createInventoryItem,
  updateInventoryItem,
  setItemLifecycleStatus,
  deleteInventoryItem,
  uploadItemImage,
} from "@/lib/supabase/mutations";
import { compressImageToWebP } from "@/lib/image";
import type { InventoryItem, StockStatus } from "@/lib/types";

type LifecycleStatus = "active" | "inactive" | "discontinued";

// Live preview only — the definitive OK/Low/Critical badge is always
// computed server-side (computeStockStatus in queries.ts) and reflected on
// the next router.refresh(); this mirrors that rule for the modal's
// "Resulting status" preview before the save round-trip completes.
function previewStatus(onHand: number, reorderLevel: number): StockStatus {
  if (reorderLevel <= 0) return "OK";
  if (onHand <= reorderLevel * 0.5) return "Critical";
  if (onHand <= reorderLevel) return "Low";
  return "OK";
}

interface ItemFormState {
  itemCode: string;
  itemName: string;
  description: string;
  category: string;
  unit: string;
  onHand: string;
  reorderLevel: string;
  imageUrl: string | null;
}

export function InventoryClient({
  items,
  totalCount,
  page,
  pageSize,
  allItems,
  categories: categoryRefs,
  units: unitsOfMeasure,
  lifecycleStatuses,
}: {
  items: InventoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  allItems: InventoryItem[];
  categories: { name: string; active: boolean }[];
  units: { name: string; abbreviation: string }[];
  lifecycleStatuses: Record<string, LifecycleStatus>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [listError, setListError] = useState("");
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [isToggling, startToggleTransition] = useTransition();
  const [togglingCode, setTogglingCode] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm(categoryRefs, unitsOfMeasure));
  const [formError, setFormError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [lifecycleValue, setLifecycleValue] = useState<LifecycleStatus>("active");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecyclePending, startLifecycleTransition] = useTransition();

  const [qrItem, setQrItem] = useState<InventoryItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [scanOpen, setScanOpen] = useState(false);

  // Item codes, not row objects — survives paging (selection made on page 1
  // isn't lost navigating to page 2) since it doesn't depend on which page
  // happens to be loaded.
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [labelQrUrls, setLabelQrUrls] = useState<Record<string, string>>({});
  const [preparingLabels, setPreparingLabels] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isFiltering = search.trim() !== "" || category !== "All categories";

  // Categories come from the full inventory (allItems), not just this page
  // — otherwise the dropdown's options would shrink/change as you paged
  // through the table, and a category with no items on the current page
  // would vanish from the filter entirely.
  const categories = ["All categories", ...Array.from(new Set(allItems.map((i) => i.category)))];

  // Search/category filtering is client-side over just the current page's
  // `items`, not a server refetch across the whole table. That's the
  // simpler of the two options the pagination work called for — it means a
  // search term can miss matches sitting on a different page (a known
  // limitation), but avoids adding a second, filter-aware query path
  // alongside the plain page-by-page one. Revisit if search-across-all-
  // pages turns out to matter in practice.
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.itemName.toLowerCase().includes(search.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "All categories" || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, category]);

  function goToPage(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    router.replace(`/inventory?page=${clamped}`, { scroll: false });
  }

  function nextItemCode() {
    const nums = allItems.map((i) => parseInt(i.itemCode.split("-").pop() ?? "0", 10));
    const max = nums.length ? Math.max(...nums) : 0;
    return `ITM-${String(max + 1).padStart(4, "0")}`;
  }

  function openAdd() {
    setEditingCode(null);
    setForm({ ...emptyForm(categoryRefs, unitsOfMeasure), itemCode: nextItemCode() });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingCode(item.itemCode);
    setForm({
      itemCode: item.itemCode,
      itemName: item.itemName,
      description: item.description ?? "",
      category: item.category,
      unit: item.unit,
      onHand: String(item.onHand),
      reorderLevel: String(item.reorderLevel),
      imageUrl: item.imageUrl,
    });
    setFormError("");
    setLifecycleValue(lifecycleStatuses[item.itemCode] ?? "active");
    setLifecycleError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function handleImageSelected(file: File | undefined) {
    if (!file) return;
    setFormError("");
    setIsUploadingImage(true);
    const compressed = await compressImageToWebP(file);
    const body = new FormData();
    body.set("itemCode", form.itemCode);
    body.set("file", compressed);
    const result = await uploadItemImage(body);
    setIsUploadingImage(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.data) setForm((f) => ({ ...f, imageUrl: result.data!.url }));
  }

  function saveItem() {
    if (!form.itemName.trim()) {
      setFormError("Item name is required.");
      return;
    }
    const onHand = Number(form.onHand) || 0;
    const reorderLevel = Number(form.reorderLevel) || 0;
    const input = {
      itemCode: form.itemCode,
      itemName: form.itemName.trim(),
      description: form.description.trim(),
      category: form.category,
      unit: form.unit,
      onHand,
      reorderLevel,
      imageUrl: form.imageUrl,
    };

    startTransition(async () => {
      const result = editingCode
        ? await updateInventoryItem(editingCode, input)
        : await createInventoryItem(input);

      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormError("");
      setModalOpen(false);
      router.refresh();
    });
  }

  function saveLifecycleStatus() {
    if (!editingCode) return;
    startLifecycleTransition(async () => {
      const result = await setItemLifecycleStatus(editingCode, lifecycleValue);
      if (result.error) {
        setLifecycleError(result.error);
        return;
      }
      setLifecycleError("");
      router.refresh();
    });
  }

  // One click, right on the row — the same reasoning as Manage Users'
  // Deactivate toggle: deleteItem's own blocked-delete error tells the
  // Admin to use Discontinued instead, so that needs to be as easy to
  // reach as Delete itself, not buried behind opening Edit and finding the
  // lifecycle-status dropdown.
  function toggleDiscontinued(item: InventoryItem) {
    const current = lifecycleStatuses[item.itemCode] ?? "active";
    const next: LifecycleStatus = current === "discontinued" ? "active" : "discontinued";
    const verb = next === "discontinued" ? "Discontinue" : "Reactivate";
    if (!confirm(`${verb} ${item.itemName} (${item.itemCode})?`)) return;
    setListError("");
    setTogglingCode(item.itemCode);
    startToggleTransition(async () => {
      const result = await setItemLifecycleStatus(item.itemCode, next);
      setTogglingCode(null);
      if (result.error) {
        setListError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function deleteItem(item: InventoryItem) {
    if (
      !confirm(
        `Delete ${item.itemName} (${item.itemCode})? This can't be undone. Items with delivery or release history can't be deleted — use Discontinue instead.`,
      )
    )
      return;
    setListError("");
    setDeletingCode(item.itemCode);
    startDeleteTransition(async () => {
      const result = await deleteInventoryItem(item.itemCode);
      setDeletingCode(null);
      if (result.error) {
        setListError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openQr(item: InventoryItem) {
    setQrDataUrl("");
    setQrItem(item);
  }

  function toggleSelected(itemCode: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(itemCode)) next.delete(itemCode);
      else next.add(itemCode);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    const filteredCodes = filtered.map((i) => i.itemCode);
    const allSelected = filteredCodes.every((code) => selectedCodes.has(code));
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      filteredCodes.forEach((code) => (allSelected ? next.delete(code) : next.add(code)));
      return next;
    });
  }

  async function printLabels() {
    const selectedItems = allItems.filter((i) => selectedCodes.has(i.itemCode));
    if (selectedItems.length === 0) return;

    setPreparingLabels(true);
    const entries = await Promise.all(
      selectedItems.map(async (item) => [item.itemCode, await QRCode.toDataURL(item.itemCode, { margin: 1, width: 300 })] as const),
    );
    setLabelQrUrls(Object.fromEntries(entries));
    setPreparingLabels(false);
  }

  // Fires window.print() only once the print-area grid has actually
  // committed AND painted with the new labelQrUrls — a bare
  // requestAnimationFrame() chained straight off the async printLabels()
  // above isn't a reliable enough guarantee of that ordering (React's
  // commit for a state update set after an await isn't scheduled inside
  // that same callback), which on some machines/print paths could mean
  // print output catching the grid before the QR images and item rows
  // were actually in the DOM. An effect keyed on labelQrUrls always runs
  // after React's own commit+paint for the render that produced it — this
  // only ever changes via printLabels() above, so every non-empty value
  // here really does mean "a print was just requested."
  useEffect(() => {
    if (Object.keys(labelQrUrls).length === 0) return;
    window.print();
  }, [labelQrUrls]);

  function closeQr() {
    setQrItem(null);
    setQrDataUrl("");
  }

  function openScan() {
    setScanOpen(true);
  }

  function closeScan() {
    setScanOpen(false);
  }

  // The QR encodes the item_code alone (plain text) — matched straight
  // against allItems, same convention QrScannerModal's callers all share.
  function handleScanDetect(code: string): string | undefined {
    const match = allItems.find((i) => i.itemCode === code);
    if (match) {
      setScanOpen(false);
      openEdit(match);
      return;
    }
    return `No item found for code "${code}".`;
  }

  // The QR encodes the item_code alone (plain text, not a URL) — Scan
  // below just needs to read that same string back and match it against
  // allItems, so there's nothing to gain from a heavier payload.
  useEffect(() => {
    if (!qrItem) return;
    let cancelled = false;
    QRCode.toDataURL(qrItem.itemCode, { margin: 1, width: 220 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qrItem]);

  return (
    <>
    <div className="no-print flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard label="Total Items" value={totalCount} hint="all categories" />
        <StatCard
          label="Low Stock"
          value={allItems.filter((i) => i.status !== "OK").length}
          hint="below reorder"
          valueClassName="text-low-text"
        />
        <StatCard label="Categories" value={categories.length - 1} hint="active" />
      </div>

      <Card>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex h-9.5 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Search size={15} strokeWidth={1.8} className="text-muted-2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-2"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 sm:flex-none">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category"
                className="h-9.5 w-full appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-[13px] font-medium text-[#3f3f46] outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                strokeWidth={1.8}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2"
              />
            </div>
            <Button variant="outline" onClick={openScan} className="shrink-0">
              <ScanLine size={14} strokeWidth={1.8} />
              Scan
            </Button>
            <Button variant="dark" onClick={openAdd} className="shrink-0">
              <Plus size={14} strokeWidth={2} />
              Add Item
            </Button>
          </div>
        </div>

        {listError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {listError}
          </p>
        )}

        {selectedCodes.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-navy-border bg-navy-bg px-3 py-2">
            <span className="text-[12.5px] font-semibold text-navy-text">
              {selectedCodes.size} item{selectedCodes.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedCodes(new Set())}
                className="text-[12px] font-semibold text-muted hover:text-foreground"
              >
                Clear
              </button>
              <Button
                variant="dark"
                onClick={printLabels}
                disabled={preparingLabels}
                className="h-8 px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {preparingLabels ? "Preparing..." : "Print Labels"}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-8 border-b border-border pb-2 pl-0">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((i) => selectedCodes.has(i.itemCode))}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all"
                  className="size-3.5"
                />
              </th>
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
              <th className="border-b border-border px-3 pb-2 text-right text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
              const last = i === filtered.length - 1;
              const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
              return (
                <tr key={item.itemCode}>
                  <td className={`${cell} pl-0`}>
                    <input
                      type="checkbox"
                      checked={selectedCodes.has(item.itemCode)}
                      onChange={() => toggleSelected(item.itemCode)}
                      aria-label={`Select ${item.itemCode}`}
                      className="size-3.5"
                    />
                  </td>
                  <td className={`${cell} text-muted`}>{item.itemCode}</td>
                  <td className={`${cell} font-semibold`}>
                    <div className="flex items-center gap-2">
                      <ItemPhoto imageUrl={item.imageUrl} alt={item.itemName} size="sm" onEdit={() => openEdit(item)} />
                      <div className="flex flex-col">
                        <span>{item.itemName}</span>
                        {item.description && (
                          <span className="text-[11px] font-normal text-muted-2">{item.description}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`${cell} text-muted`}>{item.category}</td>
                  <td className={`${cell} text-muted`}>{item.unit}</td>
                  <td className={`${cell} font-bold`}>{item.onHand}</td>
                  <td className={`${cell} text-muted`}>{item.reorderLevel}</td>
                  <td className={cell}>
                    <Badge tone={stockStatusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className={`${cell} text-right`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openQr(item)}
                        title="View / Print QR Label"
                        aria-label={`View QR label for ${item.itemName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background"
                      >
                        <QrCode size={13} strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        title="Edit item"
                        aria-label={`Edit ${item.itemName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background"
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => toggleDiscontinued(item)}
                        disabled={isToggling && togglingCode === item.itemCode}
                        title={
                          (lifecycleStatuses[item.itemCode] ?? "active") === "discontinued"
                            ? "Reactivate"
                            : "Discontinue (stops it from being ordered, keeps history)"
                        }
                        aria-label={`${
                          (lifecycleStatuses[item.itemCode] ?? "active") === "discontinued" ? "Reactivate" : "Discontinue"
                        } ${item.itemName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {(lifecycleStatuses[item.itemCode] ?? "active") === "discontinued" ? (
                          <RotateCcw size={13} strokeWidth={1.8} />
                        ) : (
                          <Ban size={13} strokeWidth={1.8} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteItem(item)}
                        disabled={isDeleting && deletingCode === item.itemCode}
                        title="Permanently delete — blocked if this item has delivery/release history"
                        aria-label={`Delete ${item.itemName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-critical-border bg-critical-bg text-critical-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-2">
                  No items match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-2">
            {isFiltering
              ? `Showing ${filtered.length} matching item${filtered.length === 1 ? "" : "s"} on this page`
              : `Showing ${items.length} of ${totalCount} items`}
          </span>
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingCode ? `Edit Item — ${editingCode}` : "Add Item"}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Item code">
              <input readOnly value={form.itemCode} className="input" />
            </Field>
            <Field label="Item name">
              <input
                value={form.itemName}
                onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
                placeholder="e.g. Bond Paper A4"
                className="input placeholder:text-muted-2"
              />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Inplay Color Black — brand/variant detail for the Stock Card"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="Photo (optional)">
            <div className="flex items-center gap-3">
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Storage URL, not a local asset next/image can optimize
                <img
                  src={form.imageUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-2">
                  <ImagePlus size={20} strokeWidth={1.6} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="flex h-8 w-fit cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-foreground hover:bg-background">
                  {isUploadingImage ? "Uploading..." : form.imageUrl ? "Replace photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={isUploadingImage}
                    onChange={(e) => handleImageSelected(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, imageUrl: null }))}
                    className="w-fit text-[11.5px] font-semibold text-critical-text hover:underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="input"
              >
                {categoryRefs.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit of measure">
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="input"
              >
                {unitsOfMeasure.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Quantity on hand">
              <input
                type="number"
                min={0}
                value={form.onHand}
                onChange={(e) => setForm((f) => ({ ...f, onHand: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="Reorder level">
              <input
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                className="input"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background px-3 py-2.5 text-[12.5px]">
            <span className="text-muted">Resulting status</span>
            <Badge tone={stockStatusTone(previewStatus(Number(form.onHand) || 0, Number(form.reorderLevel) || 0))}>
              {previewStatus(Number(form.onHand) || 0, Number(form.reorderLevel) || 0)}
            </Badge>
          </div>

          {editingCode && (
            <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-muted">Lifecycle status</span>
                <div className="flex items-center gap-2">
                  <select
                    value={lifecycleValue}
                    onChange={(e) => setLifecycleValue(e.target.value as LifecycleStatus)}
                    className="h-8 rounded-lg border border-border bg-surface px-2 text-[12.5px] font-medium outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={saveLifecycleStatus}
                    disabled={lifecyclePending}
                    className="h-8 px-2.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {lifecyclePending ? "Updating..." : "Update Status"}
                  </Button>
                </div>
              </div>
              {lifecycleError && (
                <p
                  role="alert"
                  className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12px] font-medium text-critical-text"
                >
                  {lifecycleError}
                </p>
              )}
            </div>
          )}

          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
            >
              {formError}
            </p>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={saveItem}
            disabled={isPending}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : editingCode ? "Save Changes" : "Add Item"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={qrItem !== null} onClose={closeQr} title="Item QR Label">
        {qrItem && (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image can't optimize this
                <img src={qrDataUrl} alt={`QR code for ${qrItem.itemCode}`} width={220} height={220} />
              ) : (
                <div className="flex size-[220px] items-center justify-center text-muted-2">Generating...</div>
              )}
              <div className="text-center">
                <div className="text-[13px] font-bold">{qrItem.itemCode}</div>
                <div className="text-[12px] text-muted-2">{qrItem.itemName}</div>
              </div>
            </div>
          </>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={closeQr}>
            Close
          </Button>
          <Button
            variant="dark"
            disabled={!qrDataUrl}
            onClick={() => qrItem && setLabelQrUrls({ [qrItem.itemCode]: qrDataUrl })}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            Print Label
          </Button>
        </ModalFooter>
      </Modal>

      <QrScannerModal
        open={scanOpen}
        onClose={closeScan}
        title="Scan Item QR Code"
        instructions="Point the camera at an item's QR label — this looks the item up, it doesn't create one."
        onDetect={handleScanDetect}
      />
    </div>

      {/* Print-only — see .print-area in globals.css. Invisible in the normal UI (hidden), becomes the whole printed page via @media print. */}
      <div className="print-area hidden print:block">
        <div className="grid grid-cols-3 gap-3">
          {allItems
            .filter((item) => labelQrUrls[item.itemCode])
            .map((item) => (
              <div
                key={item.itemCode}
                className="flex flex-col items-center gap-1 border border-black px-2 py-3 text-center"
                style={{ breakInside: "avoid" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image can't optimize this */}
                <img src={labelQrUrls[item.itemCode]} alt="" width={110} height={110} />
                <div className="text-[9px] font-bold uppercase tracking-wide">USTP Supply &amp; Property</div>
                <div className="text-[11px] font-semibold leading-tight">{item.itemName}</div>
                <div className="text-[9px] text-[#52525b]">{item.itemCode}</div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function emptyForm(
  categoryRefs: { name: string; active: boolean }[],
  unitsOfMeasure: { name: string; abbreviation: string }[],
): ItemFormState {
  return {
    itemCode: "",
    itemName: "",
    description: "",
    category: categoryRefs[0]?.name ?? "",
    unit: unitsOfMeasure[0]?.name ?? "",
    onHand: "0",
    reorderLevel: "0",
    imageUrl: null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}
