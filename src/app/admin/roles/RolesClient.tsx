"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { setRolePermissions, createRole } from "@/lib/supabase/mutations";
import { cn } from "@/lib/utils";
import type { RoleDefinition } from "@/lib/types";

// Display-only — permission_key ("Manage inventory", "Process RIS", ...) is
// the literal string every has_permission() check in RLS matches against,
// so it can't be renamed without touching every policy that reads it. This
// just capitalizes each word for the toggle label without changing the key
// itself (still used as-is for the toggle() call and the permissions map).
function titleCase(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RolesClient({ roles }: { roles: RoleDefinition[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedRole, setSelectedRole] = useState(roles[0]?.name ?? "");
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>(
    Object.fromEntries(roles.map((r) => [r.name, { ...r.permissions }])),
  );
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  const [newRoleModalOpen, setNewRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRoleError, setNewRoleError] = useState("");
  const [isCreatingRole, startCreateRoleTransition] = useTransition();

  function openNewRole() {
    setNewRoleName("");
    setNewRoleDescription("");
    setNewRoleError("");
    setNewRoleModalOpen(true);
  }

  function saveNewRole() {
    const name = newRoleName.trim();
    if (!name) {
      setNewRoleError("Role name is required.");
      return;
    }
    startCreateRoleTransition(async () => {
      const result = await createRole(name, newRoleDescription.trim());
      if (result.error) {
        setNewRoleError(result.error);
        return;
      }
      // `permissions` is local state seeded once from the roles prop, so a
      // brand-new role has no entry in it yet — router.refresh() alone
      // re-renders with the new role in `roles`, but this component
      // instance (and its state) isn't remounted, so without this it'd
      // land on an empty, un-toggleable panel until a full page reload.
      const allOff = Object.fromEntries(
        Object.keys(roles[0]?.permissions ?? {}).map((key) => [key, false]),
      );
      setPermissions((prev) => ({ ...prev, [name]: allOff }));
      setSelectedRole(name);
      setNewRoleModalOpen(false);
      router.refresh();
    });
  }

  const active = roles.find((r) => r.name === selectedRole);
  const activePermissions = permissions[selectedRole] ?? {};

  function toggle(key: string) {
    setPermissions((prev) => ({
      ...prev,
      [selectedRole]: { ...prev[selectedRole], [key]: !prev[selectedRole][key] },
    }));
    setSavedNotice(false);
  }

  function savePermissions() {
    startTransition(async () => {
      const result = await setRolePermissions(selectedRole, activePermissions);
      if (result.error) {
        setSaveError(result.error);
        setSavedNotice(false);
        return;
      }
      setSaveError("");
      setSavedNotice(true);
      router.refresh();
    });
  }

  if (!active) {
    return (
      <Card>
        <p className="py-8 text-center text-muted-2">No roles found.</p>
      </Card>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-bold">Roles</span>
          <button
            onClick={openNewRole}
            className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
          >
            <Plus size={13} strokeWidth={2} />
            New Role
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {roles.map((r) => (
            <button
              key={r.name}
              onClick={() => {
                setSelectedRole(r.name);
                setSavedNotice(false);
                setSaveError("");
              }}
              className={cn(
                "flex flex-col gap-1 rounded-lg border bg-surface p-3 text-left transition-colors",
                r.name === selectedRole ? "border-foreground border-2" : "border-border hover:bg-background",
              )}
            >
              <span className="text-[13px] font-bold">{r.name}</span>
              <span className="text-[11.5px] text-muted-2">{r.description}</span>
              <span className="text-[11px] font-medium text-muted">{r.userCount} users</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={`${active.name} — Permissions`} />
        <div className="flex flex-col">
          {Object.entries(activePermissions).map(([key, value], i, arr) => (
            <div
              key={key}
              className={`flex items-center justify-between py-2.5 text-[13px] font-medium ${
                i !== arr.length - 1 ? "border-b border-border-soft" : ""
              }`}
            >
              {titleCase(key)}
              <Switch checked={value} onChange={() => toggle(key)} />
            </div>
          ))}
        </div>

        {saveError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2.5">
          {savedNotice && <span className="text-[12px] font-medium text-ok-text">Saved.</span>}
          <Button
            variant="dark"
            className="self-end disabled:cursor-not-allowed disabled:opacity-60"
            onClick={savePermissions}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save Permissions"}
          </Button>
        </div>
      </Card>
    </div>

    <Modal open={newRoleModalOpen} onClose={() => setNewRoleModalOpen(false)} title="New Role">
      <div className="flex flex-col gap-3">
        <Field label="Role name">
          <input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="e.g. Warehouse Assistant"
            className="input placeholder:text-muted-2"
          />
        </Field>
        <Field label="Description">
          <input
            value={newRoleDescription}
            onChange={(e) => setNewRoleDescription(e.target.value)}
            placeholder="What this role is for"
            className="input placeholder:text-muted-2"
          />
        </Field>
        {newRoleError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {newRoleError}
          </p>
        )}
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={() => setNewRoleModalOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="dark"
          onClick={saveNewRole}
          disabled={isCreatingRole}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreatingRole ? "Creating..." : "Create Role"}
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

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "flex h-5.5 w-9.5 shrink-0 items-center rounded-full px-0.5 transition-colors",
        checked ? "justify-end bg-foreground" : "justify-start bg-border",
      )}
    >
      <div className="size-4.5 rounded-full bg-white shadow-sm" />
    </button>
  );
}
