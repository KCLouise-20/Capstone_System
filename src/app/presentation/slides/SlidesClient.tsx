"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold sm:text-[13px]">{children}</p>
  );
}

function Heading({ serifClass, children }: { serifClass: string; children: React.ReactNode }) {
  return (
    <h2 className={`${serifClass} mt-3 max-w-[22ch] text-[34px] leading-[1.08] text-white sm:text-[46px]`}>
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-white/70 sm:text-[18px]">{children}</p>;
}

const TIP_WIDTH = 288; // matches w-72

// The slide content area scrolls internally (a tall slide needs to scroll
// within the fixed-height deck — see the overflow-y-auto wrapper in the
// component below), and any scrolling ancestor clips a plain CSS
// absolutely-positioned popup the moment it would extend past that
// ancestor's own box. A pure-CSS tooltip (like the doc page's twin, which
// has no such ancestor) gets clipped here instead. Fixed positioning
// computed from the trigger's actual on-screen position sidesteps that
// entirely, since `position: fixed` is relative to the viewport, not any
// scrollable ancestor.
function Tip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.left, window.innerWidth - TIP_WIDTH - 16);
    setPos({ top: rect.bottom + 8, left: Math.max(16, left) });
  }

  return (
    <span
      ref={triggerRef}
      className="relative inline-block cursor-help border-b border-dotted border-white/40"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {label}
      {pos && (
        <span
          className="pointer-events-none fixed z-50 rounded-lg border border-white/15 bg-[#1a1650] p-3.5 text-[12.5px] font-normal normal-case leading-relaxed text-white/85 shadow-xl"
          style={{ top: pos.top, left: pos.left, width: TIP_WIDTH, maxWidth: "80vw" }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

function Flow({ steps }: { steps: { label: string; tip?: React.ReactNode }[] }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5">
            <span className="font-mono text-[12px] text-gold">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[15px] font-semibold text-white">
              {step.tip ? <Tip label={step.label}>{step.tip}</Tip> : step.label}
            </span>
          </div>
          {i < steps.length - 1 && <span className="text-2xl text-white/25">→</span>}
        </div>
      ))}
    </div>
  );
}

type GlanceRow = { label: string; plan: string; built: string; tip: React.ReactNode };

function GlanceTable({ rows }: { rows: GlanceRow[] }) {
  return (
    <div className="mt-6 w-full max-w-[880px] overflow-hidden rounded-xl border border-white/12">
      <div className="grid grid-cols-[140px_1fr_1fr] bg-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-white/45 sm:grid-cols-[170px_1fr_1fr]">
        <div className="px-4 py-2.5">Aspect</div>
        <div className="px-4 py-2.5">Proposal</div>
        <div className="px-4 py-2.5">Actually running</div>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`grid grid-cols-[140px_1fr_1fr] text-[13px] sm:grid-cols-[170px_1fr_1fr] sm:text-[14.5px] ${
            i % 2 === 1 ? "bg-white/[0.03]" : ""
          }`}
        >
          <div className="px-4 py-3 font-bold text-gold">
            <Tip label={r.label}>{r.tip}</Tip>
          </div>
          <div className="px-4 py-3 text-white/50">{r.plan}</div>
          <div className="px-4 py-3 font-medium text-white">{r.built}</div>
        </div>
      ))}
    </div>
  );
}

type ScreenRow = { name: string; status: "match" | "change"; note: string };

function ScreensGrid({ rows }: { rows: ScreenRow[] }) {
  return (
    <div className="mt-7 grid w-full max-w-[920px] grid-cols-1 gap-2.5 sm:grid-cols-2">
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3"
        >
          <span
            className={`mt-1 size-2 shrink-0 rounded-full ${
              r.status === "match" ? "bg-[#4ade80]" : "bg-gold"
            }`}
          />
          <div>
            <p className="text-[14px] font-bold text-white">{r.name}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-white/50">{r.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Callout({ tone, tag, children }: { tone: "critical" | "gold"; tag: string; children: React.ReactNode }) {
  const ring = tone === "critical" ? "border-[#f87171]/40 bg-[#f87171]/10" : "border-gold/40 bg-gold/10";
  const dot = tone === "critical" ? "bg-[#f87171]" : "bg-gold";
  return (
    <div className={`mt-6 flex max-w-[62ch] items-start gap-3 rounded-xl border ${ring} px-5 py-4`}>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">{tag}</p>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/85">{children}</p>
      </div>
    </div>
  );
}

export function SlidesClient({ serifClass }: { serifClass: string }) {
  const [index, setIndex] = useState(0);

  const glanceRows: GlanceRow[] = [
    {
      label: "Stack",
      plan: "ReactJS · Express · MySQL",
      built: "Next.js + Supabase/Postgres",
      tip: "Express was a separate backend server the proposal needed to keep in sync with the frontend. Next.js already includes React and lets server-side code live in the same project as the screens — one thing to build and deploy, not three. Supabase swaps MySQL for Postgres and throws in auth + security rules for free.",
    },
    {
      label: "Deployment",
      plan: "Campus LAN, as a PWA",
      built: "Hosted on Vercel",
      tip: "A PWA installs like an app and works offline — that needs a manifest file and a service worker, never built. What's live is a normal website: reachable from anywhere with internet, not tied to being physically on campus, but not installable.",
    },
    {
      label: "User roles",
      plan: "4 actors",
      built: "3 roles, Faculty + Staff merged",
      tip: "Every single use case in the diagram treats Faculty and Staff identically — same requests, same screens, same permissions. So the real system gives them one shared role instead of two that would only ever drift apart.",
    },
    {
      label: "Departments",
      plan: "Own managed table",
      built: "Real table, Admin panel on Settings",
      tip: "This one graduated. Checking the live data found users.department and releases.department had drifted into almost non-overlapping sets of values — free text with no canonical list will do that. There's now a real departments table with Admin add/edit, same pattern as Categories and Units.",
    },
    {
      label: "SCIO",
      plan: "Own managed table",
      built: "Still a text field, no management screen",
      tip: "Unlike Departments, this stays a deliberate departure. Its own table would mean re-scoping Inventory to be tracked per-SCIO, not just per-item — a materially bigger change nobody asked for. No screen manages a SCIO as its own record, so it stays free text.",
    },
    {
      label: "Inventory stock",
      plan: "Per item, per SCIO",
      built: "Per item, campus-wide",
      tip: "The proposal's schema implies separate stock counts per department, like separate mini-stockrooms. The real system tracks one shared number per item — matching how USTP's actual Supply Office works: one physical stockroom.",
    },
    {
      label: "10 mockup screens",
      plan: "Dashboard → Logs",
      built: "All present, 2 with one field change",
      tip: "“Mockup” is the proposal's own word for its Chapter III wireframes — drawings made before any code existed. It doesn't mean fake data. Every screen here is fully built and reads real records from the live database.",
    },
  ];

  const screenRows: ScreenRow[] = [
    { name: "Dashboard", status: "change", note: "Officer/Admin get the mockup layout; Faculty/Staff get a separate view." },
    { name: "Inventory Management", status: "match", note: "Same columns, same status color logic." },
    { name: "Record Deliveries", status: "change", note: "“Received by” locked to the current user." },
    { name: "Process Release / RIS", status: "match", note: "RIS number generated on submit, not typed." },
    { name: "Reports", status: "match", note: "All 5 report types present." },
    { name: "Request Supplies", status: "change", note: "Department locked to the requester's own." },
    { name: "Manage Users", status: "match", note: "Search, filter, full account lifecycle." },
    { name: "Manage Roles", status: "match", note: "Live permission matrix with toggles." },
    { name: "System Settings", status: "match", note: "Institution info, categories, units." },
    { name: "System Logs", status: "match", note: "Full audit trail with filters." },
  ];

  const slides: React.ReactNode[] = [
    // 0 — Cover
    <div key="cover" className="flex flex-col items-start">
      <Kicker>Presenter notes</Kicker>
      <h1 className={`${serifClass} mt-4 max-w-[16ch] text-[46px] leading-[1.05] text-white sm:text-[64px]`}>
        What we proposed, what we built
      </h1>
      <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/60 sm:text-[19px]">
        A walk through the proposal against the running system — where it matches, where I changed
        course on purpose, and what to say if the panel asks why.
      </p>
    </div>,

    // 1 — Agenda
    <div key="agenda" className="flex flex-col items-start">
      <Kicker>Agenda</Kicker>
      <Heading serifClass={serifClass}>Six things to cover</Heading>
      <ol className="mt-7 flex max-w-[46ch] flex-col gap-3.5 text-[16px] text-white/75 sm:text-[18px]">
        {[
          "The plan vs. what's running, at a glance",
          "Every screen, checked one by one",
          "Where I deliberately departed, and why",
          "What's extra, beyond the proposal",
          "How Next.js actually works, front to back",
          "Standing up a copy: Fork → Supabase → Vercel",
        ].map((item, i) => (
          <li key={item} className="flex items-baseline gap-3">
            <span className="font-mono text-[13px] text-gold">{String(i + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
    </div>,

    // 2 — At a glance table
    <div key="glance" className="flex flex-col items-start">
      <Kicker>At a glance</Kicker>
      <Heading serifClass={serifClass}>The one table to remember</Heading>
      <GlanceTable rows={glanceRows} />
    </div>,

    // 3 — Screens grid
    <div key="screens" className="flex flex-col items-start">
      <Kicker>Screen by screen</Kicker>
      <Heading serifClass={serifClass}>All 10 mockup screens</Heading>
      <ScreensGrid rows={screenRows} />
      <p className="mt-5 max-w-[68ch] text-[13px] leading-relaxed text-white/50">
        Plus an 11th, unmocked one:{" "}
        <Tip label="Update Profile">
          The Use Case Diagram (Figure 3.5) lists this as an &laquo;include&raquo; case for all three
          roles, but none of Chapter III&rsquo;s ten mockups ever draw it. There&rsquo;s now a real
          /profile page, reachable from your name in the Topbar — the build catching up to the diagram.
        </Tip>{" "}
        — required by the diagram, never mocked up, built anyway.
      </p>
    </div>,

    // 4 — Departure: stack
    <div key="d1" className="flex flex-col items-start">
      <Kicker>Deliberate departure — 1 of 5</Kicker>
      <Heading serifClass={serifClass}>The stack changed entirely</Heading>
      <Body>
        ReactJS + Express + MySQL became Next.js + Supabase. No separate backend server —
        a page&rsquo;s server-side code and its screen live in the same file. One codebase
        instead of three, with no second deployment to keep in sync.
      </Body>
    </div>,

    // 5 — Departure: schema
    <div key="d2" className="flex flex-col items-start">
      <Kicker>Deliberate departure — 2 of 5</Kicker>
      <Heading serifClass={serifClass}>
        <Tip label="SCIO">
          The proposal itself isn&rsquo;t consistent — the RIS form calls it &ldquo;School or
          Campus/Organizational Unit,&rdquo; the Data Dictionary calls it &ldquo;Supply Custodian
          Inventory Officers.&rdquo; One&rsquo;s a place, one&rsquo;s a person. The build uses the
          org-unit reading — a free-text label, same shape as department used to be.
        </Tip>{" "}
        stays text-only; stock got simpler
      </Heading>
      <Body>
        Departments graduated to a real table with its own Admin panel — checking the live data found
        two disconnected department lists that had drifted apart, and a real table with dropdowns is
        what stops that. SCIO stays a text field on purpose: its own table would mean re-scoping
        Inventory to be tracked per-SCIO, a materially bigger change nobody asked for. Stock itself is
        one shared number per item, campus-wide, not one count per department — matching how a single
        supply office actually runs: one stockroom.
      </Body>
    </div>,

    // 6 — Departure: roles + department lock
    <div key="d3" className="flex flex-col items-start">
      <Kicker>Deliberate departure — 3 of 5</Kicker>
      <Heading serifClass={serifClass}>Faculty and Staff, merged into one role</Heading>
      <Body>
        The Use Case Diagram draws four actors; the real system has three. Faculty and Staff never
        do anything different from each other in a single use case — same requests, same
        permissions. Two identical roles is one role with an extra label.
      </Body>
      <ul className="mt-5 flex max-w-[60ch] flex-col gap-2.5 text-[14.5px] leading-relaxed text-white/70 sm:text-[15.5px]">
        <li>
          <b className="text-white">One rule to maintain, not two that drift apart.</b> Every future
          permission change only has to be applied — and checked — once.
        </li>
        <li>
          <b className="text-white">Half the combinations to test</b> when you&rsquo;re QA-ing solo.
        </li>
        <li>
          <b className="text-white">Splitting later is easy; un-splitting is not</b> — merging back two
          roles that turned out identical, after other code assumes they&rsquo;re separate, is the
          expensive direction.
        </li>
      </ul>
    </div>,

    // 7 — Departure: locked department field
    <div key="d4" className="flex flex-col items-start">
      <Kicker>Deliberate departure — 4 of 5</Kicker>
      <Heading serifClass={serifClass}>Request Supplies locks your own department</Heading>
      <Body>
        The mockup shows an open dropdown — meaning anyone could file under any department. It&rsquo;s
        now locked to whatever department that person is actually assigned to. Small change, real
        integrity fix: request history can no longer include someone who was never in that department.
      </Body>
    </div>,

    // 7b — Departure: separate End-user Dashboard
    <div key="d5" className="flex flex-col items-start">
      <Kicker>Deliberate departure — 5 of 5</Kicker>
      <Heading serifClass={serifClass}>Faculty/Staff get their own Dashboard</Heading>
      <Body>
        Figure 3.1 draws one shared Dashboard. What&rsquo;s running gives Faculty/Staff a genuinely
        separate screen — not the Officer/Admin one with a few things hidden, a different component
        entirely, built around what an end user can actually do.
      </Body>
      <ul className="mt-5 flex max-w-[62ch] flex-col gap-2.5 text-[14.5px] leading-relaxed text-white/70 sm:text-[15.5px]">
        <li>
          <b className="text-white">The old shared dashboard&rsquo;s metrics meant nothing to them</b> —
          stock-by-category charts, a low-stock table, a &ldquo;Manage Inventory&rdquo; shortcut, none of
          which Faculty/Staff has permission to act on.
        </li>
        <li>
          <b className="text-white">It now matches their real Use Case Diagram scope instead:</b> their
          own request counts, recent requests, Wish List activity, and items recently released to them.
        </li>
      </ul>
    </div>,

    // 7c — Security round
    <div key="security" className="flex flex-col items-start">
      <Kicker>Security — verified live, not just described</Kicker>
      <Heading serifClass={serifClass}>Two Critical holes, found and closed</Heading>
      <Body>
        Not a proposal comparison either direction — rigor the build owes regardless of the document.
        Both of these were re-tested against the running app after the fix, not just read in the code.
      </Body>
      <Callout tone="critical" tag="Privilege escalation">
        Creating a system user had no caller-authorization check — a forged user_role=Admin cookie could
        create a new Admin account. Re-ran that exact exploit post-fix on a real Faculty/Staff session:
        confirmed in the database that no account was created.
      </Callout>
      <Callout tone="critical" tag="User-directory leak">
        Any signed-in user could resolve any other user&rsquo;s real identity through a database policy
        gap — quietly defeating Wish List&rsquo;s whole server-side-anonymity design. Confirmed by direct
        API call, post-fix, that Faculty/Staff can only resolve their own profile and their approver.
      </Callout>
      <p className="mt-5 max-w-[64ch] text-[13px] leading-relaxed text-white/50">
        Also in this round: an anonymous audit-log-injection gap closed, an RIS approve/reject/release
        race condition fixed, page-level permission guards added to /inventory, /deliveries, /releases,
        and /reports (previously reachable by any signed-in user via direct URL), a WCAG AA contrast fix,
        and every RLS policy rewritten to wrap auth.uid() in (select ...) — the documented Postgres/Supabase
        pattern that evaluates it once per query instead of once per row.
      </p>
    </div>,

    // 10 — Extra: QR
    <div key="extra1" className="flex flex-col items-start">
      <Kicker>Beyond the proposal</Kicker>
      <Heading serifClass={serifClass}>QR labels and camera scanning</Heading>
      <Body>
        Every inventory item can generate a printable QR label, with a scan-to-lookup feature.
        Genuinely useful — and worth owning directly rather than hoping nobody notices the overlap.
      </Body>
      <Callout tone="critical" tag="Address this directly">
        Our own Scope and Limitations section rules out &ldquo;barcode or RFID technologies.&rdquo;
        Either amend that line before defense, or say plainly: &ldquo;we found a lightweight way to
        solve the identification problem that exclusion was written around, and chose to include it.&rdquo;
      </Callout>
      <p className="mt-5 max-w-[62ch] text-[13.5px] leading-relaxed text-white/50">
        If asked where: one file,{" "}
        <Tip label="InventoryClient.tsx">
          src/app/inventory/InventoryClient.tsx — every inventory screen interaction lives here.
        </Tip>
        , using two small libraries —{" "}
        <Tip label="qrcode">Draws the label: takes the item&rsquo;s own ID and renders the pattern straight onto a canvas, entirely in the browser, no server round-trip.</Tip>{" "}
        to draw a label and{" "}
        <Tip label="jsQR">Reads one back: decodes the camera&rsquo;s live video feed frame by frame, looking for a QR pattern, then looks the decoded ID up against the real inventory table.</Tip>{" "}
        to read one back.
      </p>
    </div>,

    // 11 — Extra: Wish List + smaller additions
    <div key="extra2" className="flex flex-col items-start">
      <Kicker>Beyond the proposal</Kicker>
      <Heading serifClass={serifClass}>Wish List, and a few smaller additions</Heading>
      <Body>
        A materials-suggestion board — people flag what&rsquo;s missing, others confirm they want the
        same thing, and the Officer sees demand by department without seeing who personally asked.
        Zero mention in the proposal; if it&rsquo;s staying, it belongs in the document.
      </Body>
      <ul className="mt-5 flex max-w-[62ch] flex-col gap-2.5 text-[14.5px] leading-relaxed text-white/70 sm:text-[15.5px]">
        <li>
          <b className="text-white">Two tables:</b> the posted item itself, and a separate table of
          who else confirmed they want the same thing.
        </li>
        <li>
          <b className="text-white">Identity is never sent to the browser</b> — not just hidden by
          styling. A Faculty/Staff viewer&rsquo;s server response simply never includes the
          poster&rsquo;s department when they&rsquo;re not Officer or Admin.
        </li>
      </ul>
      <Callout tone="gold" tag="Consider adding to the paper">
        Also worth a one-line mention: draft status on requests, real CSV export (not just a generic
        button), and a sidebar built from live permissions instead of a hardcoded list.
      </Callout>
    </div>,

    // 12 — How it works
    <div key="how" className="flex flex-col items-start">
      <Kicker>How Next.js actually works</Kicker>
      <Heading serifClass={serifClass}>Three layers, every request</Heading>
      <Flow
        steps={[
          {
            label: "Edge check",
            tip: "src/proxy.ts, running on Vercel's edge network before the page even starts building. Reads a login-time cookie and bounces obviously-disallowed requests early — fast, but explicitly a first filter, not the real lock.",
          },
          {
            label: "Server render",
            tip: "The page's own code runs on the server, asks Supabase for exactly the rows that screen needs, and sends only the finished HTML down. The visitor's browser never sees the query itself.",
          },
          {
            label: "Database RLS",
            tip: "Every table carries its own read/write rules, checked by Postgres on every query — regardless of what the page code asked for. Even a bug upstream can't make the database hand back a row it disallows.",
          },
        ]}
      />
      <Body>
        The database is the layer that actually holds the line — it refuses to hand back rows a
        signed-in user isn&rsquo;t allowed to see, no matter what the page asked for. Security isn&rsquo;t
        &ldquo;trust the frontend to behave.&rdquo; Hover any step above for exactly what runs there.
      </Body>
    </div>,

    // 13 — Deployment
    <div key="deploy" className="flex flex-col items-start">
      <Kicker>Standing up your own copy</Kicker>
      <Heading serifClass={serifClass}>Fork → Supabase → Vercel</Heading>
      <Flow
        steps={[
          { label: "Fork", tip: "Your own independent copy of every file — screens, styling, schema definitions. Nothing shared or synced with the original." },
          { label: "Schema migration", tip: "A numbered sequence of migration files — roles, users, categories/items, deliveries, releases, settings, logs, security policies, seed data — run in order against a fresh Postgres database." },
          { label: "Vercel deploy", tip: "Point Vercel at the fork and the new database's connection details. Every push to main rebuilds and redeploys automatically." },
        ]}
      />
      <Body>
        A fork gives you every file. The schema is a numbered sequence of migrations, run in order,
        that builds an identical database from scratch in minutes. Vercel then points at your fork
        and your database, and every push to main redeploys automatically.
      </Body>
    </div>,

    // 14 — One worked example
    <div key="example" className="flex flex-col items-start">
      <Kicker>If someone wants one concrete example</Kicker>
      <Heading serifClass={serifClass}>Designing the Wish List table</Heading>
      <Body>
        Not a teaching session — but one real walkthrough keeps a curious student satisfied. The
        requirement: anyone can post a material the catalog doesn&rsquo;t have; everyone sees the item;
        only Officer/Admin sees who posted it.
      </Body>
      <ul className="mt-5 flex max-w-[64ch] flex-col gap-2.5 text-[14.5px] leading-relaxed text-white/70 sm:text-[15.5px]">
        <li>
          <b className="text-white">Plain columns</b> — item name, description, status — need no
          special handling.
        </li>
        <li>
          <b className="text-white">Department is copied onto the wish at posting time,</b> not looked
          up later by joining to the poster&rsquo;s profile. A join would mean giving every viewer some
          way to read someone else&rsquo;s user record — reopening the exact door privacy was supposed
          to close.
        </li>
        <li>
          <b className="text-white">The database policy itself is simple:</b> any signed-in user can
          read the table. The privacy rule lives one layer up — the server code has a single switch,
          &ldquo;include department or don&rsquo;t,&rdquo; flipped on only for Officer/Admin.
        </li>
      </ul>
    </div>,

    // 15 — Closing
    <div key="closing" className="flex flex-col items-start">
      <Kicker>That&rsquo;s the walkthrough</Kicker>
      <Heading serifClass={serifClass}>Questions?</Heading>
      <Body>Happy to go deeper on any single screen, decision, or the schema itself.</Body>
    </div>,
  ];

  const last = slides.length - 1;

  const goTo = useCallback(
    (n: number) => {
      setIndex(Math.max(0, Math.min(last, n)));
    },
    [last],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(last);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, last]);

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-[#0d0a2b] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-[#f5a623]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-[#1b1667]/70 blur-3xl"
      />

      <div className="relative flex items-center justify-between px-6 py-5 sm:px-12">
        <Link href="/presentation" className="text-[12.5px] font-semibold text-white/40 hover:text-white/70">
          ← Exit
        </Link>
        <span className="font-mono text-[12px] text-white/40">
          {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </span>
      </div>

      <div className="relative flex flex-1 items-center overflow-y-auto px-6 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-[960px] py-4">{slides[index]}</div>
      </div>

      <div className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-12">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-lg border border-white/15 px-4 py-2 text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Prev
        </button>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-gold" : "w-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === last}
          className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
