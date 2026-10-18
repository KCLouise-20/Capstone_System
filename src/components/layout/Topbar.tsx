import Link from "next/link";
import { Bell } from "lucide-react";

export function Topbar({
  title,
  userName,
  userRole,
  initials,
}: {
  title: string;
  userName: string;
  userRole: string;
  initials: string;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface py-2.5 pl-16 pr-4 lg:px-7">
      <h1 className="truncate text-base font-bold">{title}</h1>
      <div className="flex shrink-0 items-center gap-2.5 sm:gap-4">
        <button
          type="button"
          aria-label="Notifications"
          className="flex size-8.5 shrink-0 items-center justify-center rounded-lg border border-border text-[#52525b] transition-colors hover:bg-background"
        >
          <Bell size={17} strokeWidth={1.8} />
        </button>
        <div className="hidden h-6.5 w-px bg-border sm:block" />
        <Link
          href="/profile"
          title="Update Profile"
          className="flex items-center gap-2.5 rounded-lg transition-colors hover:bg-background"
        >
          <div className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[13px] font-semibold">{userName}</span>
            <span className="text-[11px] text-muted-2">{userRole}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
