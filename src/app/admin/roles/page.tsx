import { AppShell } from "@/components/layout/AppShell";
import { getRoleDefinitions } from "@/lib/supabase/queries";
import { RolesClient } from "./RolesClient";

export default async function ManageRolesPage() {
  const roles = await getRoleDefinitions();

  return (
    <AppShell title="Manage Roles">
      <RolesClient roles={roles} />
    </AppShell>
  );
}
