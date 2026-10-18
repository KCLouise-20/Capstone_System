import { AppShell } from "@/components/layout/AppShell";
import { getSystemLogsPage, getSystemUsers } from "@/lib/supabase/queries";
import { LogsClient } from "./LogsClient";

const PAGE_SIZE = 20;

export default async function SystemLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ logs, totalCount }, users] = await Promise.all([
    getSystemLogsPage(page, PAGE_SIZE),
    // Full account list, used only to populate the "All users" filter with
    // every user, not just whoever happens to have a log entry on this one
    // page (which would make the dropdown's options shift as you paged).
    getSystemUsers(),
  ]);

  return (
    <AppShell title="System Logs (Audit Trail)">
      <LogsClient
        logs={logs}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        allUserNames={users.map((u) => u.fullName)}
      />
    </AppShell>
  );
}
