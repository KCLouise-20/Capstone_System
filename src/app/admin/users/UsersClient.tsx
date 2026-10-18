"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Plus, Pencil, KeyRound, Trash2, UserX, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, accountStatusTone, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { createSystemUser, updateSystemUser, deleteSystemUser, resetUserPassword } from "@/lib/supabase/mutations";
import type { AccountStatus, SystemUser, UserRole } from "@/lib/types";

interface UserFormState {
  fullName: string;
  email: string;
  role: string;
  department: string;
  status: AccountStatus;
}

const emptyForm: UserFormState = {
  fullName: "",
  email: "",
  role: "Faculty / Staff",
  department: "",
  status: "Active",
};

export function UsersClient({
  users,
  totalCount,
  page,
  pageSize,
  roleNames,
  departmentNames,
  currentUserEmail,
}: {
  users: SystemUser[];
  totalCount: number;
  page: number;
  pageSize: number;
  roleNames: string[];
  departmentNames: string[];
  currentUserEmail: string;
}) {
  const router = useRouter();
  const roleOptions = ["All roles", ...roleNames];
  const assignableRoles = roleNames;
  const [isPending, startTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [isToggling, startToggleTransition] = useTransition();
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [listError, setListError] = useState("");

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("All roles");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isFiltering = search.trim() !== "" || role !== "All roles";

  // Same call as Inventory's search/filter: client-side over just the
  // current page of `users`, not a server refetch across every user — see
  // the longer comment in src/app/inventory/InventoryClient.tsx for the
  // reasoning and the known limitation (a match on another page won't show
  // up here).
  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const q = search.toLowerCase();
        const matchesSearch =
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q);
        const matchesRole = role === "All roles" || u.role === role;
        return matchesSearch && matchesRole;
      }),
    [users, search, role],
  );

  function goToPage(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    router.replace(`/admin/users?page=${clamped}`, { scroll: false });
  }

  function openAdd() {
    setEditingEmail(null);
    setForm(emptyForm);
    setResetNotice("");
    setFormError("");
    setPassword("");
    setConfirmPassword("");
    setModalOpen(true);
  }

  function openEdit(user: SystemUser) {
    setEditingEmail(user.email);
    setForm({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department === "—" ? "" : user.department,
      status: user.status,
    });
    setResetNotice("");
    setFormError("");
    setPassword("");
    setConfirmPassword("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  function saveUser() {
    if (!form.fullName.trim() || !form.email.trim()) {
      setFormError("Full name and email are required.");
      return;
    }
    if (password.trim() && password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const result = editingEmail
        ? await updateSystemUser(editingEmail, {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            role: form.role,
            department: form.department.trim() || undefined,
            status: form.status,
            password: password.trim() || undefined,
          })
        : await createSystemUser({
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            role: form.role,
            department: form.department.trim() || undefined,
            status: form.status,
            password: password.trim() || undefined,
          });

      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormError("");
      setModalOpen(false);
      router.refresh();
    });
  }

  function resetPassword() {
    if (!editingEmail) return;
    startResetTransition(async () => {
      const result = await resetUserPassword(editingEmail);
      if (result.error) {
        setResetNotice(result.error);
        return;
      }
      setResetNotice("Password reset link sent.");
    });
  }

  function deleteUser(u: SystemUser) {
    if (
      !confirm(
        `Delete ${u.fullName} (${u.email})? Their account will be removed, but everything they did (requests, deliveries, reports) stays on record under their name. This can't be undone.`,
      )
    )
      return;
    setListError("");
    setDeletingEmail(u.email);
    startDeleteTransition(async () => {
      const result = await deleteSystemUser(u.email);
      setDeletingEmail(null);
      if (result.error) {
        setListError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // One click, right on the row — this is exactly what deleteUser's own
  // blocked-delete error message tells the Admin to do instead ("use
  // Deactivate instead to revoke their access"), so it needs to be as easy
  // to reach as Delete itself rather than buried behind opening Edit and
  // finding the status dropdown. Deactivating never removes the row: every
  // delivery/release/report/log this account is attached to keeps their
  // name attached forever (see deleteSystemUser's own comment on why
  // permanent delete is blocked once any of that exists) — RLS (migration
  // 12, current_role_name()/has_permission()) revokes their access
  // immediately at the database level the moment status flips, not just on
  // their next login attempt.
  function toggleStatus(u: SystemUser) {
    const nextStatus: AccountStatus = u.status === "Active" ? "Inactive" : "Active";
    const verb = nextStatus === "Inactive" ? "Deactivate" : "Reactivate";
    if (!confirm(`${verb} ${u.fullName} (${u.email})?`)) return;
    setListError("");
    setTogglingEmail(u.email);
    startToggleTransition(async () => {
      const result = await updateSystemUser(u.email, { status: nextStatus });
      setTogglingEmail(null);
      if (result.error) {
        setListError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex h-9.5 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Search size={15} strokeWidth={1.8} className="text-muted-2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-2"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 sm:flex-none">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Filter by role"
                className="h-9.5 w-full appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-[13px] font-medium text-[#3f3f46] outline-none"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                strokeWidth={1.8}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2"
              />
            </div>
            <Button variant="dark" onClick={openAdd} className="shrink-0">
              <Plus size={14} strokeWidth={2} />
              Add User
            </Button>
          </div>
        </div>

        {listError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {listError}
          </p>
        )}

        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["", "Full name", "Email", "Role", "SCIO / dept.", "Status"].map((h) => (
                <th
                  key={h}
                  className="border-b border-border px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-2 first:pl-0"
                >
                  {h}
                </th>
              ))}
              <th className="border-b border-border px-3 pb-2 text-right text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const last = i === filtered.length - 1;
              const cell = `px-3 py-2.5 ${last ? "" : "border-b border-border-soft"}`;
              return (
                <tr key={u.email}>
                  <td className={`${cell} pl-0`}>
                    <div className="flex size-7 items-center justify-center rounded-full bg-background text-[11px] font-bold">
                      {u.initials}
                    </div>
                  </td>
                  <td className={`${cell} font-semibold`}>{u.fullName}</td>
                  <td className={`${cell} text-muted`}>{u.email}</td>
                  <td className={cell}>
                    <Badge tone={roleTone(u.role as UserRole)}>{u.role}</Badge>
                  </td>
                  <td className={`${cell} text-muted`}>{u.department}</td>
                  <td className={cell}>
                    <Badge tone={accountStatusTone(u.status)}>{u.status}</Badge>
                  </td>
                  <td className={`${cell} text-right`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(u)}
                        aria-label={`Edit ${u.fullName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background"
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                      </button>
                      {u.email !== currentUserEmail && (
                        <button
                          onClick={() => toggleStatus(u)}
                          disabled={isToggling && togglingEmail === u.email}
                          aria-label={`${u.status === "Active" ? "Deactivate" : "Reactivate"} ${u.fullName}`}
                          title={u.status === "Active" ? "Deactivate (revokes access, keeps history)" : "Reactivate"}
                          className="inline-flex size-7 items-center justify-center rounded-md border border-border text-[#52525b] hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {u.status === "Active" ? (
                            <UserX size={13} strokeWidth={1.8} />
                          ) : (
                            <UserCheck size={13} strokeWidth={1.8} />
                          )}
                        </button>
                      )}
                      {u.email !== currentUserEmail && (
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={isDeleting && deletingEmail === u.email}
                          aria-label={`Delete ${u.fullName}`}
                          title="Permanently delete — their past activity stays on record under their name"
                          className="inline-flex size-7 items-center justify-center rounded-md border border-critical-border bg-critical-bg text-critical-text disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-2">
                  No users match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-2">
            {isFiltering
              ? `Showing ${filtered.length} matching user${filtered.length === 1 ? "" : "s"} on this page`
              : `Showing ${users.length} of ${totalCount} users`}
          </span>
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingEmail ? `Edit User — ${editingEmail}` : "Add User"}
      >
        <div className="flex flex-col gap-3">
          <Field label="Full name">
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Ana Mercado"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="Email address">
            <input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@school.edu.ph"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Assigned role">
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="input"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="input"
              >
                <option value="">No department</option>
                {departmentNames.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Account status">
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AccountStatus }))}
              className="input"
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={editingEmail ? "New password (optional)" : "Password (optional)"}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingEmail ? "Leave blank to keep current password" : "Leave blank to email a setup link"}
                autoComplete="new-password"
                className="input placeholder:text-muted-2"
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="input placeholder:text-muted-2"
              />
            </Field>
          </div>
          {editingEmail && (
            <p className="text-[11.5px] text-muted-2">
              Setting a password here takes effect immediately — use this for accounts whose email
              isn&apos;t a real inbox (like the @school.edu.ph seed accounts), since{" "}
              <span className="font-semibold">Reset Password</span> below only works by actually
              emailing them a link.
            </p>
          )}

          {editingEmail && (
            <div className="flex items-center justify-between rounded-lg border border-border-soft bg-background px-3 py-2.5">
              <span className="text-[12.5px] text-muted">
                {resetNotice || "Or email a reset link instead"}
              </span>
              <button
                onClick={resetPassword}
                disabled={isResetting}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound size={13} strokeWidth={1.8} />
                {isResetting ? "Sending..." : "Reset Password"}
              </button>
            </div>
          )}

          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
            >
              {formError}
            </p>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={saveUser}
            disabled={isPending}
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : editingEmail ? "Save Changes" : "Add User"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}
