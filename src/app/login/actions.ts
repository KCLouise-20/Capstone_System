"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

// Server Action backing the login form (src/app/login/LoginForm.tsx). Runs
// entirely server-side using the cookie-aware server client (src/lib/
// supabase/server.ts), so the session cookie Supabase sets is visible to
// proxy.ts and every Server Component on the very next request.
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard") || "/dashboard";

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: "Invalid email or password." };
  }

  // Pull the profile + role name in one round trip (relies on the FK
  // between public.users.role_id and public.roles.role_id for the
  // PostgREST embed — see supabase/migrations/20260821000300_users_and_auth.sql).
  const { data: profile } = await supabase
    .from("users")
    .select("status, roles(name)")
    .eq("id", authData.user.id)
    .single();

  const roleName = (profile as { roles?: { name?: string } } | null)?.roles?.name;

  if (!profile || profile.status === "inactive") {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Contact your administrator." };
  }

  // Optimistic, non-authoritative role hint for proxy.ts's /admin/* edge
  // check — httpOnly so client JS can't read/tamper with it, but it is NOT
  // itself a security boundary (RLS is). Kept separate from Supabase's own
  // session cookies.
  //
  // maxAge matters here: without it, this defaults to a browser *session*
  // cookie that's cleared whenever the browser fully closes, while
  // Supabase's own auth cookies (@supabase/ssr, refreshed on every request
  // by proxy.ts's supabase.auth.getUser() call) live far longer. That gap
  // meant a still-logged-in user could lose just this cookie and get
  // silently redirected away from /admin/* and /presentation until they
  // signed out and back in — confirmed live on the production deployment.
  // 30 days comfortably outlives normal usage; a stale value here is a
  // non-issue either way since RLS is the real access boundary.
  if (roleName) {
    const cookieStore = await cookies();
    cookieStore.set("user_role", roleName, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // Best-effort audit log entry (see migration 08's log_login() RPC). The
  // comment here used to say this wasn't "awaited-critical," but the code
  // still had `await` in front of it, so every login actually blocked on
  // this RPC's full round trip before redirecting. Under any load on
  // system_logs (concurrent writes, lock contention), that turned into
  // real, user-visible login latency for a result nothing ever reads.
  //
  // Next's after() (stable in this version) runs this once the response
  // has already been sent — not a bare un-awaited promise, which a
  // serverless runtime can kill mid-flight the instant redirect() ends
  // the request, silently dropping the log write more often than not.
  after(async () => {
    try {
      await supabase.rpc("log_login");
    } catch {
      // ignored — see comment above
    }
  });

  redirect(redirectTo);
}
