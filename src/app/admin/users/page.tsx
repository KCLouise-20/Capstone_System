import { AppShell } from "@/components/layout/AppShell";
import { getSystemUsersPage, getRoleNames, getDepartments, getCurrentUserProfile } from "@/lib/supabase/queries";
import { UsersClient } from "./UsersClient";

const PAGE_SIZE = 10;

export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ users, totalCount }, roleNames, departments, profile] = await Promise.all([
    getSystemUsersPage(page, PAGE_SIZE),
    getRoleNames(),
    getDepartments(),
    getCurrentUserProfile(),
  ]);

  return (
    <AppShell title="Manage Users">
      <UsersClient
        users={users}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        roleNames={roleNames}
        departmentNames={departments.map((d) => d.name)}
        currentUserEmail={profile?.email ?? ""}
      />
    </AppShell>
  );
}
