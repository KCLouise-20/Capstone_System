import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  valueClassName,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  valueClassName?: string;
  /** When set, the whole card links here (e.g. a dashboard stat pointing at the page it summarizes). */
  href?: string;
}) {
  const content = (
    <Card className={cn("gap-2.5 p-4", href && "transition-colors hover:bg-background")}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{label}</span>
        {Icon && (
          <div className="flex size-7 items-center justify-center rounded-lg bg-background text-muted">
            <Icon size={15} strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div className={cn("text-[25px] font-extrabold tracking-tight", valueClassName)}>
        {value}
      </div>
      {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
