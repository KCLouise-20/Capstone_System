"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  if (!open) return null;

  return (
    // no-print: a modal's own chrome (backdrop, title bar, close button)
    // should never bleed into a print — anything meant to print goes
    // through its own dedicated .print-area sibling instead (see
    // RisDocumentModal/DeliveryDocumentModal for the pattern). Found live:
    // without this, printing from an open modal showed its title bar
    // overlapping the bottom of the actual print content.
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#18181b]/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col gap-3.5 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl",
          widthClassName ?? "max-w-md",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[14.5px] font-bold">{title}</span>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-2 hover:bg-background hover:text-foreground"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-3.5">
      {children}
    </div>
  );
}
