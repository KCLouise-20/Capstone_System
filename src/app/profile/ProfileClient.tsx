"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, roleTone } from "@/components/ui/Badge";
import { updateOwnProfile, changeOwnPassword } from "@/lib/supabase/mutations";
import type { CurrentUserProfile } from "@/lib/supabase/queries";

export function ProfileClient({ profile }: { profile: CurrentUserProfile }) {
  const router = useRouter();
  const [isSavingProfile, startProfileTransition] = useTransition();
  const [isSavingPassword, startPasswordTransition] = useTransition();

  const [fullName, setFullName] = useState(profile.fullName);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  function saveProfile() {
    setProfileSaved(false);
    startProfileTransition(async () => {
      const result = await updateOwnProfile(fullName);
      if (result.error) {
        setProfileError(result.error);
        return;
      }
      setProfileError("");
      setProfileSaved(true);
      router.refresh();
    });
  }

  function savePassword() {
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    startPasswordTransition(async () => {
      const result = await changeOwnPassword(newPassword);
      if (result.error) {
        setPasswordError(result.error);
        return;
      }
      setPasswordError("");
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" />

        <div className="flex items-center gap-3 border-b border-border-soft pb-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-white">
            {profile.initials}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-bold">{profile.fullName}</span>
            <Badge tone={roleTone(profile.role)} className="w-fit">
              {profile.role}
            </Badge>
          </div>
        </div>

        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Username">
            <div className="input flex items-center bg-background text-muted">{profile.username}</div>
          </Field>
          <Field label="Email">
            <div className="input flex items-center bg-background text-muted">{profile.email}</div>
          </Field>
        </div>

        <Field label="Department">
          <div className="input flex items-center bg-background text-muted">
            {profile.department || "—"}
          </div>
        </Field>
        <p className="text-[11.5px] text-muted-2">
          Username, email, and department are managed by your Administrator on Manage Users.
        </p>

        {profileError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {profileError}
          </p>
        )}
        {profileSaved && !profileError && (
          <p className="rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-[12.5px] font-medium text-ok-text">
            Profile updated.
          </p>
        )}
        <Button
          variant="dark"
          onClick={saveProfile}
          disabled={isSavingProfile || !fullName.trim()}
          className="self-end disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingProfile ? "Saving..." : "Save Changes"}
        </Button>
      </Card>

      <Card>
        <CardHeader title="Change Password" />
        <p className="text-[12px] text-muted-2">
          Set a new password for your account. You&apos;ll stay signed in after changing it.
        </p>

        <Field label="New password">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            className="input placeholder:text-muted-2"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            className="input placeholder:text-muted-2"
          />
        </Field>

        {passwordError && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {passwordError}
          </p>
        )}
        {passwordSaved && !passwordError && (
          <p className="rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-[12.5px] font-medium text-ok-text">
            Password changed.
          </p>
        )}
        <Button
          variant="dark"
          onClick={savePassword}
          disabled={isSavingPassword || !newPassword || !confirmPassword}
          className="self-end disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingPassword ? "Saving..." : "Change Password"}
        </Button>
      </Card>
    </div>
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
