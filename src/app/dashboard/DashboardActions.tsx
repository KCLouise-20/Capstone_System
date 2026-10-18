"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { InventoryItem } from "@/lib/types";

/** Client-only wrapper for the two "Low stock items" actions — the rest of Dashboard is a Server Component. */
export function DashboardActions({ lowStockItems }: { lowStockItems: InventoryItem[] }) {
  function exportCsv() {
    const header = "Item code,Item name,Category,Unit,On hand,Reorder lvl,Status\n";
    const rows = lowStockItems
      .map((i) => `"${i.itemCode}","${i.itemName}","${i.category}","${i.unit}",${i.onHand},${i.reorderLevel},"${i.status}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "low-stock-items.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={exportCsv}>
        <Download size={14} strokeWidth={1.8} />
        Export
      </Button>
      <Link
        href="/inventory"
        className="inline-flex h-9.5 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-black"
      >
        Manage Inventory
      </Link>
    </div>
  );
}
