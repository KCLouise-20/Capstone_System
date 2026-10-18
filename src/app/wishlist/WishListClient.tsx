"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  submitWish,
  toggleWishConfirmation,
  deleteWish,
  setWishStatus,
} from "@/lib/supabase/mutations";
import type { WishListItem } from "@/lib/types";

export function WishListClient({
  items,
  categoryOptions,
  isOfficerOrAdmin,
  isAdmin,
}: {
  items: WishListItem[];
  categoryOptions: string[];
  isOfficerOrAdmin: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, startSubmit] = useTransition();
  const [busyWishId, setBusyWishId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [formError, setFormError] = useState("");

  const openCount = items.filter((i) => i.status === "open").length;
  const myConfirmCount = items.filter((i) => i.confirmedByMe && !i.isMine).length;

  function submit() {
    if (!itemName.trim()) {
      setFormError("Item name is required.");
      return;
    }
    startSubmit(async () => {
      const result = await submitWish(itemName, description, category);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormError("");
      setItemName("");
      setDescription("");
      setCategory("");
      router.refresh();
    });
  }

  function runAction(wishId: number, action: () => Promise<{ error?: string }>) {
    setBusyWishId(wishId);
    setActionError("");
    action()
      .then((result) => {
        if (result.error) setActionError(result.error);
      })
      .finally(() => {
        setBusyWishId(null);
        router.refresh();
      });
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard label="Open Wishes" value={openCount} hint="not yet in the catalog" />
        <StatCard label="Total Suggestions" value={items.length} hint="open and fulfilled" />
        <StatCard label="Confirmed by Me" value={myConfirmCount} hint="materials you also want" />
      </div>

      <Card>
        <CardHeader title="Suggest a Material" />
        <p className="text-[12px] text-muted-2">
          Not in Request Supplies yet? Flag it here — others can confirm they want it too, and the
          Supply Officer sees how much real demand there is before sourcing it.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
            Item name
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Whiteboard eraser"
              className="input placeholder:text-muted-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
            Category (optional)
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="">No category</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any detail that helps (brand, size, why you need it)..."
            rows={2}
            className="input h-auto resize-none py-2"
          />
        </label>
        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {formError}
          </p>
        )}
        <Button
          variant="dark"
          onClick={submit}
          disabled={isSubmitting}
          className="self-end disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Submitting..." : "Add to Wish List"}
        </Button>
      </Card>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
        >
          {actionError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const busy = busyWishId === item.wishId;
          return (
            <Card key={item.wishId} className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold">{item.itemName}</span>
                    {item.category && (
                      <Badge tone="neutral" className="text-[10px]">
                        {item.category}
                      </Badge>
                    )}
                    <Badge tone={item.status === "fulfilled" ? "ok" : "low"} className="text-[10px]">
                      {item.status === "fulfilled" ? "Fulfilled" : "Open"}
                    </Badge>
                    {item.isMine && (
                      <span className="text-[11px] font-semibold text-muted-2">(Yours)</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[12.5px] text-muted">{item.description}</p>
                  )}
                  {isOfficerOrAdmin && item.departments && (
                    <p className="text-[11.5px] text-muted-2">
                      {item.departments.length > 0
                        ? `Wanted by: ${item.departments.join(", ")}`
                        : "No department on file"}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-muted">
                    <Heart size={13} strokeWidth={1.8} className={item.confirmCount > 1 ? "fill-critical-text text-critical-text" : ""} />
                    {item.confirmCount}
                  </span>

                  {!item.isMine && !isOfficerOrAdmin && (
                    <Button
                      variant={item.confirmedByMe ? "outline" : "dark"}
                      disabled={busy}
                      onClick={() =>
                        runAction(item.wishId, () => toggleWishConfirmation(item.wishId, item.confirmedByMe))
                      }
                      className="h-8 px-2.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.confirmedByMe ? "Unconfirm" : "I want this too"}
                    </Button>
                  )}

                  {isOfficerOrAdmin && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(item.wishId, () =>
                          setWishStatus(item.wishId, item.status === "fulfilled" ? "open" : "fulfilled"),
                        )
                      }
                      title={item.status === "fulfilled" ? "Reopen" : "Mark fulfilled"}
                      className="flex size-8 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.status === "fulfilled" ? (
                        <RotateCcw size={14} strokeWidth={1.8} />
                      ) : (
                        <CheckCircle2 size={14} strokeWidth={1.8} />
                      )}
                    </button>
                  )}

                  {(item.isMine || isAdmin) && (
                    <button
                      disabled={busy}
                      onClick={() => runAction(item.wishId, () => deleteWish(item.wishId))}
                      title="Withdraw"
                      aria-label="Withdraw"
                      className="flex size-8 items-center justify-center rounded-md border border-border text-critical-text hover:bg-critical-bg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {items.length === 0 && (
          <Card>
            <p className="py-8 text-center text-[13px] text-muted-2">
              Nothing suggested yet — be the first to flag a material.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
