import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutGrid,
  Package,
  Truck,
  FileText,
  BarChart3,
  ClipboardList,
  Heart,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "USTP Supply & Property Management System",
};

const features = [
  { icon: LayoutGrid, label: "Dashboard", desc: "Stock levels, recent deliveries, and pending requests at a glance." },
  { icon: Package, label: "Inventory", desc: "Items, stock levels, categories, and low-stock flags." },
  { icon: Truck, label: "Deliveries", desc: "Record incoming stock — inventory updates automatically." },
  { icon: FileText, label: "Releases (RIS)", desc: "Process and approve requests; stock adjusts on approval." },
  { icon: BarChart3, label: "Reports", desc: "Per-item stock card ledger, plus period and SCIO summaries." },
  { icon: ClipboardList, label: "Request Supplies", desc: "Faculty/staff submit a request and track its status." },
  { icon: Heart, label: "Wish List", desc: "Suggest materials not yet in the catalog and confirm demand, with requesters kept private." },
  { icon: ShieldCheck, label: "Admin Tools", desc: "Users, roles, system settings, and an audit log." },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <Image src="/ustp-wordmark.png" alt="USTP" width={700} height={202} className="h-6 w-auto" />
          <span className="text-[13px] font-semibold text-muted">Supply &amp; Property</span>
        </div>
        <Link
          href="/login"
          className="inline-flex h-9.5 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-black"
        >
          Sign In
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-14 px-5 pb-20 pt-6 sm:px-8 sm:pt-14">
        <section className="flex flex-col items-center gap-5 text-center">
          <Image
            src="/ustp-logo.png"
            alt="USTP — University of Science and Technology of Southern Philippines"
            width={900}
            height={1149}
            priority
            className="h-32 w-auto sm:h-40"
          />
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-[32px]">
              Supply &amp; Property Management System
            </h1>
            <p className="max-w-lg text-[14.5px] leading-relaxed text-muted">
              Built for USTP Villanueva Campus to track inventory, deliveries, and
              consumable releases end to end — with a different view depending on
              who&apos;s signed in.
            </p>
          </div>
          <Link
            href="/login"
            className="mt-1 inline-flex h-10.5 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-black"
          >
            Sign In to Continue
            <ArrowRight size={16} strokeWidth={2} />
          </Link>
        </section>

        <section className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, label, desc }) => (
            <Card key={label} className="gap-2">
              <div className="flex items-center gap-2">
                <Icon size={17} strokeWidth={1.8} className="text-navy" />
                <span className="text-[13.5px] font-bold">{label}</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted">{desc}</p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border-soft px-5 py-5 text-center text-[11.5px] text-muted-2 sm:px-8">
        USTP Villanueva Campus — accounts are provisioned by your System Administrator.
      </footer>
    </div>
  );
}
