"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Package,
  Truck,
  FileText,
  BarChart3,
  Heart,
  Users,
  ShieldCheck,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavEntry {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
}

// Dashboard is always shown (View Dashboard is an <<include>> use case for
// all three actors). Everything else here is built from the signed-in
// user's ACTUAL granted permissions (Manage Roles), not a hardcoded list
// per role name — otherwise this goes stale the moment an admin toggles a
// permission on a role (e.g. granting Admin "Process RIS" so they can
// approve requests directly does nothing for the nav unless the nav
// actually reads that same flag). Matches exactly what each table's RLS
// checks (has_permission(...) in migrations 04/05/06/07), so a nav item
// only ever appears when the underlying page will actually work, not just
// when a role name matches. "Request Supplies" and "Wish List" are the
// exceptions — neither is a togglable permission key, they're available to
// every signed-in account regardless of role.
function buildMainNav(role: string | null, permissions: Record<string, boolean>): NavEntry[] {
  const nav: NavEntry[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { href: "/wishlist", label: "Wish List", icon: Heart },
  ];
  if (permissions["Manage inventory"]) nav.push({ href: "/inventory", label: "Inventory", icon: Package });
  if (permissions["Record deliveries"]) nav.push({ href: "/deliveries", label: "Deliveries", icon: Truck });
  if (permissions["Process RIS"] || permissions["Approve requests"]) {
    nav.push({ href: "/releases", label: "Releases (RIS)", icon: FileText });
  }
  if (permissions["Generate reports"]) nav.push({ href: "/reports", label: "Reports", icon: BarChart3 });
  if (role === "Faculty / Staff") {
    nav.push({ href: "/request-supplies", label: "Request Supplies", icon: Package });
  }
  return nav;
}

const adminNav: NavEntry[] = [
  { href: "/admin/users", label: "Manage Users", icon: Users },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
  { href: "/admin/settings", label: "System Settings", icon: Settings },
  { href: "/admin/logs", label: "System Logs", icon: ScrollText },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-navy text-white font-semibold"
          : "text-[#52525b] hover:bg-background",
      )}
    >
      <Icon size={18} strokeWidth={1.8} className={active ? "" : "text-muted-2"} />
      {label}
    </Link>
  );
}

// Client Component so it can hold the open/closed state for the mobile
// drawer itself — AppShell (its parent) is an async Server Component and
// can't hold that state, and this is simpler than introducing a second
// wrapper component just to share it with Topbar. At `lg` and up the drawer
// classes are inert (the sidebar is always visible, statically positioned)
// and the hamburger button/backdrop never render.
export function Sidebar({
  role,
  permissions,
}: {
  role: string | null;
  permissions: Record<string, boolean>;
}) {
  const pathname = usePathname();
  const mainNav = buildMainNav(role, permissions);
  const isAdmin = role === "Admin";
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="fixed left-3 top-3.5 z-30 flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground shadow-sm lg:hidden"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#18181b]/40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-62 shrink-0 -translate-x-full flex-col border-r border-border bg-surface p-3.5 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center gap-2 px-2 pb-5.5 pt-1.5">
          <Image src="/ustp-wordmark.png" alt="USTP" width={700} height={202} className="h-6 w-auto shrink-0" />
          <span className="text-[10.5px] font-medium text-muted-2">Supply &amp; Property</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted-2 hover:bg-background hover:text-foreground lg:hidden"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-2.5 pb-1.5 text-[10.5px] font-bold tracking-wider text-muted-2">
          MAIN
        </div>
        <nav className="flex flex-col gap-0.5">
          {mainNav.map((item) => (
            <NavItem key={item.href} {...item} active={pathname === item.href} onNavigate={close} />
          ))}
        </nav>

        {isAdmin && (
          <>
            <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-bold tracking-wider text-muted-2">
              ADMIN
            </div>
            <nav className="flex flex-col gap-0.5">
              {adminNav.map((item) => (
                <NavItem key={item.href} {...item} active={pathname === item.href} onNavigate={close} />
              ))}
            </nav>
          </>
        )}

        <div className="flex-1" />

        <div className="mx-1.5 my-2.5 border-t border-border" />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-medium text-muted hover:bg-background"
          >
            <LogOut size={18} strokeWidth={1.8} className="text-muted-2" />
            Logout
          </button>
        </form>
      </aside>
    </>
  );
}
