"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(login, initialState);

  return (
    <Card className="w-full max-w-sm gap-5 p-7">
      <div className="flex flex-col items-center gap-2 pb-1 text-center">
        <Image src="/ustp-wordmark.png" alt="USTP" width={700} height={202} className="h-9 w-auto" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-muted">Supply &amp; Property</span>
          <span className="text-[12px] text-muted-2">Sign In to Continue</span>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <Field label="Email">
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@school.edu.ph"
            className="input placeholder:text-muted-2"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="input placeholder:text-muted-2"
          />
        </Field>

        {state?.error && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
          >
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>

      <p className="text-center text-[11.5px] text-muted-2">
        Accounts are provisioned by your System Administrator.
      </p>
    </Card>
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="dark"
      disabled={pending}
      className="mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign In"}
    </Button>
  );
}
