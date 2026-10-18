import { cn } from "@/lib/utils";

export type BadgeTone =
  | "critical"
  | "low"
  | "ok"
  | "neutral"
  | "neutral-dark"
  | "navy"
  | "gold";

const toneClasses: Record<BadgeTone, string> = {
  critical: "bg-critical-bg text-critical-text border-critical-border",
  low: "bg-low-bg text-low-text border-low-border",
  ok: "bg-ok-bg text-ok-text border-ok-border",
  neutral: "bg-background text-muted border-border",
  "neutral-dark": "bg-foreground text-white border-foreground",
  navy: "bg-navy-bg text-navy-text border-navy-border",
  gold: "bg-gold-bg text-gold-text border-gold-border",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function stockStatusTone(status: "OK" | "Low" | "Critical"): BadgeTone {
  if (status === "Critical") return "critical";
  if (status === "Low") return "low";
  return "ok";
}

export function requestStatusTone(
  status: "Draft" | "Pending" | "Approved" | "Rejected" | "Released",
): BadgeTone {
  if (status === "Draft") return "neutral";
  if (status === "Pending") return "low";
  if (status === "Approved" || status === "Released") return "ok";
  return "critical";
}

export function accountStatusTone(status: "Active" | "Inactive"): BadgeTone {
  return status === "Active" ? "ok" : "critical";
}

// Widened to plain `string` rather than the four-way UserRole union: the
// actual values coming out of the database (see queries.ts) use the merged
// "Faculty / Staff" role name, not the separate "Faculty"/"Staff" literals
// the older UserRole type still lists — so a strict union check here would
// never match that case anyway.
export function roleTone(role: string): BadgeTone {
  if (role === "Admin") return "navy";
  if (role === "Supply Officer") return "gold";
  return "neutral";
}

export function actionTone(
  action: "Create" | "Login" | "Update" | "Delete",
): BadgeTone {
  if (action === "Delete") return "critical";
  if (action === "Update") return "low";
  if (action === "Create") return "ok";
  return "neutral";
}
