"use client";

import { useState } from "react";
import { ImagePlus, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const SIZE_CLASSES = {
  sm: "size-7",
  md: "size-10",
  lg: "size-14",
} as const;

/**
 * Shared clickable item-photo thumbnail + lightbox, used everywhere an
 * item's photo shows up (Inventory, Dashboard, Reports' Stock Card,
 * Releases/Request Supplies item pickers and line-item lists) — a plain
 * thumbnail with no way to actually see the product clearly. Clicking it
 * opens a full-size view; passing `onEdit` (Inventory's own table is the
 * only caller that does, since Admin is the only role that can act on it)
 * adds an "Edit item" button right there instead of making the admin
 * close the photo and go hunt for the row's own edit button.
 */
export function ItemPhoto({
  imageUrl,
  alt,
  size = "md",
  onEdit,
}: {
  imageUrl: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (!imageUrl) {
    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-md border border-dashed border-border-soft bg-background text-muted-2`}
      >
        <ImagePlus size={size === "lg" ? 20 : 13} strokeWidth={1.6} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View photo of ${alt}`}
        className={`${sizeClass} shrink-0 overflow-hidden rounded-md border border-border`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, not a local asset next/image can optimize */}
        <img src={imageUrl} alt="" className="size-full object-cover" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={alt} widthClassName="max-w-lg">
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, not a local asset next/image can optimize */}
          <img src={imageUrl} alt={alt} className="max-h-[70vh] w-full rounded-lg object-contain" />
          {onEdit && (
            <div className="flex justify-end">
              <Button
                variant="dark"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <Pencil size={14} strokeWidth={1.8} />
                Edit item
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
