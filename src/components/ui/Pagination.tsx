import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Prev/current/Next control shared by Inventory, Manage Users, and System
 * Logs — the three screens with a real `?page=` searchParam backed by a
 * *Page() query (see src/lib/supabase/queries.ts). Deliberately just the
 * button cluster, not the "Showing X of Y" summary text next to it, since
 * that text differs slightly per screen (e.g. Inventory notes when a
 * client-side search is narrowing the current page further).
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="flex size-7 items-center justify-center rounded-md border border-border text-muted-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={13} strokeWidth={2} />
      </button>
      <span className="px-1.5 text-xs font-semibold text-[#3f3f46]">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="flex size-7 items-center justify-center rounded-md border border-border text-muted-2 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronRight size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
