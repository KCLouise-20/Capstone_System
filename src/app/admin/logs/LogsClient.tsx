"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, actionTone } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import type { LogEntry } from "@/lib/types";

const actionTypes = ["All actions", "Login", "Create", "Update", "Delete"];

export function LogsClient({
  logs,
  totalCount,
  page,
  pageSize,
  allUserNames,
}: {
  logs: LogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  allUserNames: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("All actions");
  const [user, setUser] = useState("All users");

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isFiltering = search.trim() !== "" || action !== "All actions" || user !== "All users";

  // "System" (see getSystemLogs/getSystemLogsPage's fallback for a log
  // entry with no associated user row) is included alongside every real
  // account so it's always selectable, even before any log entry using it
  // has loaded onto the current page.
  const users = useMemo(
    () => ["All users", ...Array.from(new Set([...allUserNames, "System"]))],
    [allUserNames],
  );

  // Same call as Inventory/Manage Users: client-side filtering over just
  // the current page of `logs`, not a server refetch across the whole
  // audit trail — see InventoryClient.tsx for the fuller reasoning.
  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const matchesSearch = log.description.toLowerCase().includes(search.toLowerCase());
        const matchesAction = action === "All actions" || log.action === action;
        const matchesUser = user === "All users" || log.user === user;
        return matchesSearch && matchesAction && matchesUser;
      }),
    [logs, search, action, user],
  );

  function goToPage(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    router.replace(`/admin/logs?page=${clamped}`, { scroll: false });
  }

  function exportCsv() {
    const header = "Timestamp,User,Action,Module,Description\n";
    const rows = filtered
      .map((log) => `"${log.timestamp}","${log.user}","${log.action}","${log.module}","${log.description}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex h-9.5 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 sm:min-w-[180px]">
          <Search size={15} strokeWidth={1.8} className="text-muted-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Dropdown value={action} onChange={setAction} options={actionTypes} label="Filter by action type" />
          <Dropdown value={user} onChange={setUser} options={users} label="Filter by user" />
          <button
            onClick={exportCsv}
            aria-label="Export logs as CSV"
            className="flex h-9.5 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-[#3f3f46] hover:bg-background"
          >
            <Download size={14} strokeWidth={1.8} />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Timestamp", "User", "Action", "Module", "Description"].map((h) => (
              <th
                key={h}
                className="border-b border-border px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-2 first:pl-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((log, i) => {
            const last = i === filtered.length - 1;
            const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
            return (
              <tr key={`${log.timestamp}-${log.description}-${i}`}>
                <td className={`${cell} pl-0 text-muted`}>{log.timestamp}</td>
                <td className={`${cell} font-semibold`}>{log.user}</td>
                <td className={cell}>
                  <Badge tone={actionTone(log.action)}>{log.action}</Badge>
                </td>
                <td className={`${cell} text-muted`}>{log.module}</td>
                <td className={`${cell} text-muted`}>{log.description}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-2">
                No log entries match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-2">
          {isFiltering
            ? `Showing ${filtered.length} matching entr${filtered.length === 1 ? "y" : "ies"} on this page`
            : `Showing ${logs.length} of ${totalCount} log entries`}
        </span>
        <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
      </div>
    </Card>
  );
}

function Dropdown({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9.5 appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-[13px] font-medium text-[#3f3f46] outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={1.8}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2"
      />
    </div>
  );
}
