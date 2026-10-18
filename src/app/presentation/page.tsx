import { redirect } from "next/navigation";
import Link from "next/link";
import { Source_Serif_4 } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserProfile } from "@/lib/supabase/queries";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["600", "700"] });

const SECTIONS = [
  { href: "#glance", label: "At a glance" },
  { href: "#comparison", label: "Screen by screen" },
  { href: "#decisions", label: "Why I departed" },
  { href: "#extras", label: "What's extra" },
  { href: "#howitworks", label: "How Next.js works" },
  { href: "#deploy", label: "Fork → Supabase → Vercel" },
  { href: "#example", label: "One worked example" },
];

// Reachable only by typing the URL directly — deliberately not in Sidebar's
// nav. Gated Admin-only both here and at the edge (see src/proxy.ts); this
// page has no RLS-protected table backing it, so the page-level check below
// is the only backstop if the edge check were ever skipped.
export default async function PresentationPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "Admin") {
    redirect("/dashboard");
  }

  return (
    <AppShell title="Presentation">
      {/* ---------------------------- Cover ---------------------------- */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-[#100d33] px-6 py-9 sm:px-10 sm:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#f5a623]/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-[#1b1667]/60 blur-3xl"
        />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-[#f5a623]">
          Presenter notes · Admin only
        </p>
        <h1 className={`${serif.className} relative mt-2.5 max-w-[18ch] text-[32px] leading-[1.1] text-white sm:text-[42px]`}>
          What we proposed, what we actually built
        </h1>
        <p className="relative mt-4 max-w-[62ch] text-[14.5px] leading-relaxed text-white/70">
          Read from this, don&rsquo;t project it. It&rsquo;s the case for every place the running
          system agrees with, improves on, or knowingly departs from the proposal — so nothing
          from the panel catches any of us off guard.
        </p>
        <Link
          href="/presentation/slides"
          className="relative mt-6 inline-flex items-center gap-2 rounded-lg bg-[#f5a623] px-4 py-2.5 text-[13px] font-bold text-[#100d33] transition-colors hover:bg-[#ffb640]"
        >
          Open the slide deck
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* --------------------------- Quick nav --------------------------- */}
      <nav className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6.5 sm:px-6.5">
        {SECTIONS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:border-[#c7c2ea] hover:bg-navy-bg hover:text-navy"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* --------------------------- At a glance --------------------------- */}
      <section id="glance" className="flex scroll-mt-16 flex-col gap-3.5 pt-2">
        <SectionHead
          n="—"
          title="At a glance"
          dek="The one table to remember, if nothing else lands. Hover any row label for the fuller explanation."
        />
        {/* No overflow-x-auto here on purpose — that would also clip the
            hover tooltips vertically (an ancestor's overflow-x other than
            "visible" forces its overflow-y to clip too, per the CSS spec).
            The table is only 3 columns; it compresses fine on narrow
            screens without needing horizontal scroll. */}
        <div className="rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-background">
                <Th first>Aspect</Th>
                <Th>In the proposal</Th>
                <Th last>What&rsquo;s actually running</Th>
              </tr>
            </thead>
            <tbody>
              <GlanceRow
                label="Stack"
                plan="ReactJS · Node.js + Express · MySQL · XAMPP"
                built="Next.js (frontend + backend in one) · Supabase / Postgres"
                tone="gold"
                tip={
                  <>
                    ReactJS is just the UI library — the proposal still needed a <b>separate</b> Node.js
                    + Express server to talk to a MySQL database, so that&rsquo;s three projects to build
                    and deploy. Next.js already includes React and lets server-side code live in the
                    same file as the screen that uses it, so the &ldquo;backend&rdquo; is really just
                    functions inside the same project — one thing to build, one thing to deploy. Supabase
                    swaps MySQL for Postgres and throws in authentication and security rules for free.
                  </>
                }
              />
              <GlanceRow
                label="Deployment"
                plan="Local server on the campus LAN, as a PWA"
                built="Hosted on Vercel, plain web app — not installable"
                tone="gold"
                tip={
                  <>
                    A PWA (Progressive Web App) is a website that can be &ldquo;installed&rdquo; like an
                    app and can keep working with no internet. That needs extra plumbing (a manifest
                    file, a service worker caching pages offline) that was never built. What&rsquo;s live
                    is a normal website — reachable from anywhere with internet, not tied to being
                    physically on campus, but you do need a connection and there&rsquo;s no app icon.
                  </>
                }
              />
              <GlanceRow
                label="User roles"
                plan="4 actors: Admin, Officer, Faculty, Staff"
                built="3 roles — Faculty and Staff merged, identical capabilities"
                tone="gold"
                tip={
                  <>
                    Go through every use case in the diagram and ask &ldquo;does Faculty do this
                    differently than Staff?&rdquo; The answer is never yes — same requests, same screens,
                    same permissions. So the real system gives them one shared role, literally called{" "}
                    <b>&ldquo;Faculty / Staff&rdquo;</b> in the database. See the full reasoning further
                    down this page.
                  </>
                }
              />
              <GlanceRow
                label="Departments"
                plan="Own table, a managed entity"
                built="Real table, Admin CRUD panel on System Settings"
                tone="ok"
                tip={
                  <>
                    This one graduated. There&rsquo;s now a real <code className="rounded bg-background px-1 py-0.5 text-[11.5px]">departments</code> table
                    with its own status (active/inactive), and a full add/edit panel on System Settings —
                    same pattern as Categories and Units. Not done for its own sake: checking the live data
                    turned up a real integrity bug — <code className="rounded bg-background px-1 py-0.5 text-[11.5px]">users.department</code> and{" "}
                    <code className="rounded bg-background px-1 py-0.5 text-[11.5px]">releases.department</code> were
                    both free text and had drifted into almost non-overlapping sets of values (one had{" "}
                    <i>Finance, Information Technology, Main Campus, All</i>; the other had{" "}
                    <i>Arts, Engineering, Finance, HR, MIS</i>). A real table with dropdowns built on top
                    of it is what stops that drift going forward.
                  </>
                }
              />
              <GlanceRow
                label="SCIO"
                plan="Own table, a managed entity"
                built="Still a text field — no management screen"
                tone="gold"
                tip={
                  <>
                    Unlike Departments, this one stays a deliberate departure. The Data Dictionary&rsquo;s
                    SCIO entity would mean re-scoping Inventory to be tracked per-SCIO, not just per-item —
                    a materially bigger change than a lookup table, and nobody asked for it. No screen
                    manages a SCIO as its own record, so it stays a free-text label, same shape as
                    department was before this round.
                  </>
                }
              />
              <GlanceRow
                label="Inventory stock"
                plan="One stock count per item, per SCIO"
                built="One shared stock count per item, campus-wide"
                tone="gold"
                tip={
                  <>
                    The proposal&rsquo;s INVENTORY table has a quantity column keyed to both the item{" "}
                    <i>and</i> the SCIO — meaning, on paper, &ldquo;Bond Paper&rdquo; could have a
                    different stock count for every department, like separate mini-stockrooms. The real
                    system tracks one number per item for the whole campus, matching how USTP&rsquo;s
                    actual Supply Office works: one physical stockroom, one source of truth.
                  </>
                }
              />
              <GlanceRow
                label="10 mockup screens"
                plan="Dashboard through System Logs"
                built="All 10 present; 3 have one deliberate change"
                tone="ok"
                tip={
                  <>
                    &ldquo;Mockup&rdquo; is the proposal&rsquo;s own word for its Chapter III wireframes —
                    drawings of what each screen should look like, made <i>before</i> any code existed.
                    It doesn&rsquo;t mean the real system uses fake or placeholder data. Every screen
                    listed here is fully built and reads real records from the live database. The three
                    changes: &ldquo;Received by&rdquo; locked on Deliveries, department locked on Request
                    Supplies, and Dashboard now showing a different view depending on who&rsquo;s signed
                    in — see further down.
                  </>
                }
              />
              <GlanceRow
                isLast
                label="Beyond the proposal"
                plan="—"
                built="QR labels/scanning, Wish List, draft status, CSV export"
                tone="navy"
                tip={
                  <>
                    Extra, working scope the document never asked for. Two of these are worth a
                    deliberate, prepared answer rather than hoping nobody asks — see &ldquo;What&rsquo;s
                    extra&rdquo; further down.
                  </>
                }
              />
            </tbody>
          </table>
        </div>

        <Card className="gap-2">
          <CardHeader title="Quick definition: what's a SCIO?" />
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Worth having a straight answer ready, because the proposal itself isn&rsquo;t fully
            consistent about it: the Release/RIS screen&rsquo;s own description defines SCIO as
            &ldquo;School or Campus/Organizational Unit,&rdquo; while the Data Dictionary section
            defines it as &ldquo;Supply Custodian Inventory Officers.&rdquo; One reads as a{" "}
            <i>place</i>, the other as a <i>person</i>. In the build, it&rsquo;s used the first way — a
            free-text label for a campus or organizational unit, same shape as department. If a student
            or panelist catches that inconsistency, it&rsquo;s a fair catch — the honest answer is
            &ldquo;the document uses it both ways; we went with the org-unit reading since that&rsquo;s
            what the mockup&rsquo;s own form field asks for.&rdquo;
          </p>
        </Card>
      </section>

      {/* --------------------------- Screen by screen --------------------------- */}
      <section id="comparison" className="flex scroll-mt-16 flex-col gap-3.5 pt-6">
        <SectionHead
          n="01"
          title="Screen by screen"
          dek="Almost every screen in the mockups exists and works close to as drawn — the real differences live underneath, not on the glass."
        />

        <Card className="gap-2 !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>Proposal screen</Th>
                  <Th>Status</Th>
                  <Th>What to say</Th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:last-child)>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-4 [&>tr>td]:py-2.5">
                <tr><Td strong>Dashboard</Td><Td><Badge tone="gold">One change</Badge></Td><Td muted>Officer/Admin see the mockup&rsquo;s layout exactly — 4 metric cards, category chart, pending requests, low-stock table. Faculty/Staff get a separate screen built around what they can actually do; see &ldquo;Why I departed&rdquo; below.</Td></tr>
                <tr><Td strong>Inventory Management</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>Same columns, same OK/Low/Critical color logic, search + category filter, pagination.</Td></tr>
                <tr><Td strong>Record Deliveries</Td><Td><Badge tone="gold">One change</Badge></Td><Td muted>&ldquo;Received by&rdquo; isn&rsquo;t a personnel dropdown — it&rsquo;s locked to whoever&rsquo;s actually logged in.</Td></tr>
                <tr><Td strong>Process Release / RIS</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>RIS number isn&rsquo;t typed in — generated on submit, so two people can never collide on one number.</Td></tr>
                <tr><Td strong>Reports</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>All 5 types: Stock Card, RIS/Release Form, Period Summary, Per-SCIO, Transaction History.</Td></tr>
                <tr><Td strong>Request Supplies</Td><Td><Badge tone="gold">One change</Badge></Td><Td muted>Department isn&rsquo;t a free dropdown — locked to whatever department that person is actually in.</Td></tr>
                <tr><Td strong>Manage Users</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>Search, role filter, add/edit/deactivate/reset password — all there.</Td></tr>
                <tr><Td strong>Manage Roles</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>Role cards plus a live permission matrix with toggles, exactly as drawn.</Td></tr>
                <tr><Td strong>System Settings</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>Institution info, categories, units — all editable, plus one bonus panel.</Td></tr>
                <tr><Td strong>System Logs</Td><Td><Badge tone="ok">Matches</Badge></Td><Td muted>Full audit trail: timestamp, user, action, module, description, filters, pagination.</Td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="gap-2">
          <CardHeader title="The functional requirements bullet list" />
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Every bullet in Chapter III&rsquo;s Functional Requirements is implemented. The one to
            flag honestly: search and filtering works, but it searches within the page you&rsquo;re
            currently on, not the entire table at once. That&rsquo;s a real, known trade-off — say so
            plainly if asked, don&rsquo;t dodge it. Everything else on that list is fully there.
          </p>
        </Card>

        <Card className="gap-2">
          <CardHeader title="An 11th screen: Update Profile" />
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Worth knowing about, because it cuts the other way from everything else on this page — this
            isn&rsquo;t scope we added, it&rsquo;s scope the proposal itself required and then never drew.
            The Use Case Diagram (Figure 3.5) lists Update Profile as an <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">&lt;&lt;include&gt;&gt;</code> use
            case for all three actors, but none of the ten named Chapter III mockups ever depict it. There&rsquo;s
            now a real <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">/profile</code> page
            — edit your name, change your password, see the fields your Administrator manages — reachable
            by clicking your own name in the Topbar, for every role. The build catching up to the diagram,
            not the other way around.
          </p>
        </Card>
      </section>

      {/* --------------------------- Why I departed --------------------------- */}
      <section id="decisions" className="flex scroll-mt-16 flex-col gap-3.5 pt-6">
        <SectionHead
          n="02"
          title="Why I deliberately departed from the proposal"
          dek="A proposal is a plan written before anything exists. These are the places real engineering changed the plan on purpose — and the reasoning to give if the panel pushes on any of them."
        />

        <DecisionCard title="The tech stack changed entirely">
          The proposal names ReactJS, Node.js with Express, and MySQL. What&rsquo;s actually running
          is Next.js — which already includes React — talking directly to Supabase, which is
          Postgres plus authentication plus row-level security built in. I didn&rsquo;t write a
          separate backend server at all: a page&rsquo;s server-side code and its screen live in the
          same file, so there&rsquo;s no separate API project to keep in sync, no second deployment,
          no second set of environment variables. For a team our size, one codebase beats three.
        </DecisionCard>

        <DecisionCard title="Departments got its own table; SCIO deliberately still doesn't">
          The data dictionary lists DEPARTMENTS and SCIO as their own tables. Departments now has one —
          real rows, active/inactive status, an Admin panel on System Settings to add and edit them.
          That wasn&rsquo;t done just to match the document: checking the live data found{" "}
          <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">users.department</code> and{" "}
          <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">releases.department</code> had
          drifted into almost entirely different sets of values — free text with no canonical list will
          do that. A real table with dropdowns on top of it is what stops it happening again. SCIO stays a
          text field on purpose — its own table would mean re-scoping Inventory to be tracked per-SCIO,
          not just per-item, which is a materially bigger change nobody asked for. A concept that never
          gets its own management screen doesn&rsquo;t earn its own table; Departments earned one, SCIO
          hasn&rsquo;t.
        </DecisionCard>

        <DecisionCard title="Stock is one number per item, not per department">
          The proposal&rsquo;s INVENTORY table implies each department holds its own separate stock
          count for the same item. What&rsquo;s built is one shared count per item, campus-wide —
          simpler, and it matches how a single supply office actually operates: one stockroom, not
          one per department. The real limitation: per-building stock rooms would be genuine future
          scope, not something this schema does today.
        </DecisionCard>

        <DecisionCard title="Faculty and Staff are one role, not two — and merging them was the right call">
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            The Use Case Diagram draws four actors; the real system has three. Looking at the
            diagram&rsquo;s own use cases, Faculty and Staff never do anything different from each
            other — same requests, same visibility, same permissions.
          </p>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] font-semibold text-foreground">
            Why merging is actually better, not just simpler:
          </p>
          <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              <b className="text-foreground">One rule to maintain, not two that must stay in sync.</b>{" "}
              With two identical roles, every future change — a new permission, a new screen — has to
              be applied to both and checked against both. Miss one, and they silently drift apart.
              With one role, that category of bug can&rsquo;t happen at all.
            </li>
            <li>
              <b className="text-foreground">Half the combinations to test.</b> Every screen and
              permission only needs verifying against three roles instead of four — meaningful when
              you&rsquo;re QA-ing solo.
            </li>
            <li>
              <b className="text-foreground">Splitting later is easy; un-splitting is not.</b> If USTP
              ever needs Faculty to have something Staff shouldn&rsquo;t (say, a research-supplies
              budget line), pulling one role into two is a small, additive change. Discovering two
              &ldquo;different&rdquo; roles were actually identical the whole time — after other code
              already assumes they&rsquo;re separate — is a much bigger cleanup.
            </li>
          </ul>
        </DecisionCard>

        <DecisionCard title="Faculty/Staff get their own Dashboard, not the shared one">
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Figure 3.1 draws one Dashboard, shared by everyone. What&rsquo;s running gives Faculty/Staff a
            genuinely separate screen from Officer/Admin — not a variant with a few things hidden, a
            different component entirely.
          </p>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] font-semibold text-foreground">
            Why splitting it was the right call, not just a preference:
          </p>
          <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              <b className="text-foreground">The operational metrics don&rsquo;t mean anything to an end
                user.</b> The old shared dashboard showed stock-by-category charts, a low-stock table, a
              &ldquo;Manage Inventory&rdquo; shortcut — none of which a Faculty/Staff account has permission
              to act on. Showing it anyway was just noise.
            </li>
            <li>
              <b className="text-foreground">It matches their actual Use Case Diagram scope.</b> Faculty
              and Staff&rsquo;s own use cases are Request Supplies, View My Request Status, View Released
              Items. Their dashboard now shows exactly that: their own request counts, Wish List activity,
              and what&rsquo;s recently been released to them — nothing they can&rsquo;t act on.
            </li>
            <li>
              <b className="text-foreground">One role, one honest screen.</b> Faculty and Staff still
              share a single role — this doesn&rsquo;t reopen that decision. It just means the shared role
              gets a screen that actually reflects what the role can do, instead of borrowing the
              Officer/Admin one and hiding nothing.
            </li>
          </ul>
        </DecisionCard>

        <DecisionCard title="Department on Request Supplies is locked, not a free choice">
          Worth explaining carefully — this one&rsquo;s a genuine improvement, not just a
          simplification. The mockup shows an open department dropdown, meaning anyone could file a
          request under any department. I locked it to whatever department that person is actually
          assigned to. Small change, real integrity consequence: without it, &ldquo;Engineering&rdquo;
          request history could include someone who was never in Engineering at all.
        </DecisionCard>

        <DecisionCard title="Roles and permissions go further than the diagram, not less">
          The proposal treats role as a fixed label. What&rsquo;s built is a live permission matrix —
          Manage Roles lets an Admin toggle exactly what each role can do, enforced directly at the
          database level, not just a hidden button in the UI. One of the few places the build is
          strictly more capable than what was proposed.
        </DecisionCard>

        <Callout tone="critical" tag="Verified live, not just described" title="A security round: two Critical holes, found and closed">
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            None of this is in the proposal either direction — it&rsquo;s not a design decision, it&rsquo;s
            rigor the build owes regardless of what any document says. Worth stating plainly rather than
            letting it surface as a question: two of these were genuinely serious, and I didn&rsquo;t just
            patch and move on — I re-ran the actual exploit against the running app for each one to
            confirm the fix holds.
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5 text-[13.5px] leading-relaxed text-muted">
            <li>
              <b className="text-foreground">Privilege escalation.</b> The function that creates a new
              system user had no check on who was calling it — a forged <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">user_role=Admin</code> cookie
              was enough to create a brand-new Admin account. I re-attempted that exact exploit against
              a real Faculty/Staff session after the fix and confirmed in the database that no account
              was created; a real Admin creating a user still works normally.
            </li>
            <li>
              <b className="text-foreground">A user-directory leak.</b> Any signed-in user could resolve
              any other user&rsquo;s real identity through a database policy gap — which quietly defeated
              Wish List&rsquo;s entire server-side-anonymity design, the thing that section above calls
              its main selling point. Confirmed by direct API call, post-fix, that a Faculty/Staff account
              can only resolve their own profile and their legitimate approver&rsquo;s name — not the
              full user list.
            </li>
          </ul>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] font-semibold text-foreground">
            Also fixed in the same round, lower severity but real:
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-muted">
            <li>— An anonymous-key audit-log-injection gap — the anon key alone now gets rejected outright.</li>
            <li>— An RIS approve/reject/release race condition — a double-approve on the same request now correctly fails on the second attempt.</li>
            <li>
              — Page-level permission guards added to <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">/inventory</code>,{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">/deliveries</code>,{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">/releases</code>, and{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">/reports</code> — any
              signed-in user could reach all four by typing the URL directly, regardless of role; the
              Sidebar hid the links but nothing backed that up at the page.
            </li>
            <li>— A WCAG AA contrast fix on the muted text color used across the app.</li>
            <li>
              — An RLS performance rewrite: every row-level security policy now wraps <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">auth.uid()</code> in{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">(select ...)</code>, the
              documented Postgres/Supabase pattern that makes it evaluate once per query instead of once
              per row. Not a design tradeoff — same access rules, just faster at scale — so there was no
              reason not to apply it everywhere.
            </li>
          </ul>
        </Callout>
      </section>

      {/* --------------------------- What's extra --------------------------- */}
      <section id="extras" className="flex scroll-mt-16 flex-col gap-3.5 pt-6">
        <SectionHead
          n="03"
          title="What's extra — not in the proposal at all"
          dek="Extra, working scope is a strength. Two of these need an honest, prepared answer before anyone asks."
        />

        <Callout tone="critical" tag="Address this directly" title="QR codes on inventory items">
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Every item can generate a printable QR label, plus a camera-based scan-to-lookup. Genuinely
            useful — but our own Scope and Limitations section rules out &ldquo;barcode or RFID
            technologies&rdquo; as beyond the study. Don&rsquo;t let this surface as a surprise. Either
            amend that paragraph before defense to frame QR lookup as a value-add, or say plainly:
            &ldquo;we found a lightweight way to solve the identification problem that exclusion was
            written around, and chose to include it.&rdquo; Own it — don&rsquo;t get caught contradicting
            the document.
          </p>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] font-semibold text-foreground">
            If a student asks &ldquo;where&rsquo;s that in the code, what does it actually do&rdquo;:
          </p>
          <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              It all lives in one file — <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">src/app/inventory/InventoryClient.tsx</code> —
              using two small open-source libraries: <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">qrcode</code> to
              draw a label, and <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">jsqr</code> to
              read one back.
            </li>
            <li>
              <b className="text-foreground">Generating a label:</b> take the item&rsquo;s own ID, hand
              it to the <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">qrcode</code>{" "}
              library, and it draws the black-and-white square pattern straight onto an on-screen canvas
              — entirely in the browser, no server round-trip, ready to print immediately.
            </li>
            <li>
              <b className="text-foreground">Scanning one:</b> the browser asks for camera permission
              and reads the live video feed frame by frame.{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">jsQR</code> looks at each
              frame&rsquo;s pixels for the three corner squares every QR code has, and once it locks on,
              decodes the pattern back into that same item ID — which the app then looks up against the
              real inventory table, same as typing it into search.
            </li>
          </ul>
        </Callout>

        <Callout tone="low" tag="Consider adding to the paper" title="Wish List">
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            A materials-suggestion board — Faculty/Staff flag something not yet in the catalog, others
            confirm they want the same thing, and the Supply Officer sees demand by department without
            seeing who personally asked. Zero mention anywhere in the proposal — if it&rsquo;s staying,
            it belongs in the document somewhere, even briefly.
          </p>
          <p className="mt-2.5 max-w-[68ch] text-[13.5px] font-semibold text-foreground">
            Worth expanding on, because the privacy mechanism is the actual interesting part:
          </p>
          <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              <b className="text-foreground">Two tables.</b> One holds the actual posted item; a second,
              separate table holds who else confirmed they want the same thing — a plain &ldquo;me
              too&rdquo; list, one row per person per item.
            </li>
            <li>
              <b className="text-foreground">Identity is never sent to the browser, not just hidden by
                styling.</b> A regular Faculty/Staff viewer&rsquo;s page asks the server for wish-list
              data, and the server simply never includes the poster&rsquo;s department or identity in
              that response at all when the viewer isn&rsquo;t Officer or Admin — there&rsquo;s nothing
              for a curious student to find even by opening the browser&rsquo;s network tab and
              inspecting the raw data, because it was never there to begin with. That&rsquo;s a
              meaningfully stronger guarantee than just hiding a column with CSS.
            </li>
            <li>
              <b className="text-foreground">The Officer&rsquo;s view is demand, not identity.</b> They
              see how many different departments confirmed wanting an item — useful for deciding what
              to stock — without ever learning which specific person asked.
            </li>
          </ul>
        </Callout>

        <Card className="gap-2">
          <CardHeader title="Smaller additions worth a one-line mention" />
          <ul className="flex flex-col gap-1.5 text-[13.5px] text-muted">
            <li>— A draft status on requests and RIS, so people can save progress before submitting.</li>
            <li>— CSV export, not just a generic &ldquo;export button,&rdquo; on Releases, Reports, and Logs.</li>
            <li>— A branded loading screen on every page transition.</li>
            <li>— The sidebar menu is built from live permissions, not a hardcoded list per role.</li>
          </ul>
        </Card>
      </section>

      {/* --------------------------- How Next.js works --------------------------- */}
      <section id="howitworks" className="flex scroll-mt-16 flex-col gap-3.5 pt-6">
        <SectionHead
          n="04"
          title="How Next.js actually behaves, front to back"
          dek="Not a coding walkthrough — the mental model any of us should be able to say out loud if the panel asks where the backend is."
        />

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <InfoCard title="There's no separate backend project">
            The frontend is one project, the backend API is a second, and normally they talk over
            HTTP. Next.js collapses that into one: a page&rsquo;s file can run code on the server —
            reading the database — and send only finished HTML to the browser. A button&rsquo;s click
            can call a server-only function directly, no hand-written API endpoint required.
          </InfoCard>
          <InfoCard title="The folder structure is the routing">
            Every folder under the app directory becomes a URL. No routing table to maintain, no risk
            of a route existing in code but not in the menu, or the reverse — the folder either
            exists or it doesn&rsquo;t.
          </InfoCard>
        </div>

        <Card className="gap-3">
          <CardHeader title="A request hits three layers before it's answered" />
          <FlowRow steps={["Edge check", "Server render", "Database RLS"]} />

          <div className="mt-1 flex flex-col gap-3">
            <div>
              <p className="text-[13.5px] font-bold text-foreground">1. Edge check — is this even worth answering?</p>
              <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
                One file, <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">src/proxy.ts</code>,
                runs before the actual page starts building — on Vercel&rsquo;s edge network, physically
                closer to the visitor than the main app. It reads a small cookie set when someone logs in
                and asks two questions: &ldquo;are you signed in at all&rdquo; and, for Admin-only pages,
                &ldquo;does your cookie say Admin.&rdquo; Fail either, and it redirects immediately —
                cheap and fast, but explicitly a first filter, not the real lock.
              </p>
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-foreground">2. Server render — go get exactly what this page needs</p>
              <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
                If the edge check passes, the page&rsquo;s own code runs — on the server, not in the
                visitor&rsquo;s browser — and asks Supabase for precisely the rows that screen needs.
                The finished HTML is what gets sent down; the visitor&rsquo;s browser never sees the
                query itself.
              </p>
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-foreground">3. Database RLS — the layer that actually can&rsquo;t be talked around</p>
              <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
                Every table in the database carries its own rules for who can read or write it, checked
                by Postgres itself on every single query — regardless of what the page code asked for.
                If a bug ever let the wrong query slip through step 2, the database would still refuse to
                hand back rows that user isn&rsquo;t allowed to see. Security here isn&rsquo;t &ldquo;trust
                the frontend to behave&rdquo; — it&rsquo;s enforced at the one layer nothing above it can
                override.
              </p>
            </div>
          </div>
        </Card>

        <InfoCard title="Deployment is just: push to Git">
          No server to log into, no service to restart. Every push to the main branch triggers a
          fresh build, distributed automatically. The database is a separate, always-on service — the
          app and the database scale and fail independently, which is exactly why a redeploy never
          means the data disappeared.
        </InfoCard>
      </section>

      {/* --------------------------- Deploy --------------------------- */}
      <section id="deploy" className="flex scroll-mt-16 flex-col gap-3.5 pt-6 pb-4">
        <SectionHead
          n="05"
          title="Standing up your own copy"
          dek="Fork → Supabase → Vercel. Talk through the shape of each stage, not commands."
        />

        <Card className="gap-3">
          <FlowRow steps={["Fork", "Schema migration", "Vercel deploy"]} />
        </Card>

        <InfoCard title="1. Fork the repository">
          A fork is your own independent copy of every file — screens, styling, schema definitions —
          completely separate from the original. It&rsquo;s a clean starting point that already
          contains a finished application.
        </InfoCard>

        <InfoCard title="2. Stand up a database and run the schema">
          A brand-new Supabase project starts as an empty Postgres database. The schema is a numbered
          sequence of migration files, each building on the last: roles, then users, then categories
          and items, then deliveries, then releases, then reporting and settings, then logs, then the
          security policies that lock every table down, then seed data. Order matters — later files
          reference tables the earlier ones create. Run them in order against a fresh project and you
          get a database in the exact same shape as this one, from scratch, in minutes.
        </InfoCard>

        <Card className="gap-3">
          <CardHeader title="Why the schema is shaped the way it is" />
          <ul className="flex flex-col gap-2.5 text-[13.5px] leading-relaxed text-muted">
            <li>
              <b className="text-foreground">Small lookup tables for categories and units.</b> An
              item references a category by ID instead of repeating the name on every row — rename a
              category once, every item updates automatically.
            </li>
            <li>
              <b className="text-foreground">Requests and releases are one table with a status,</b> not
              two. A Faculty/Staff request and an Officer-processed release are the same record moving
              through stages — draft, pending, approved, released. Splitting that into two tables would
              mean copying a row the moment it&rsquo;s approved, exactly the kind of step that
              eventually gets forgotten under real use.
            </li>
            <li>
              <b className="text-foreground">Permissions live in the database,</b> not scattered across
              the frontend. Every table has its own rule for who can read or write it, checked on every
              request — which is what makes the toggles in Manage Roles mean something real.
            </li>
            <li>
              <b className="text-foreground">Passwords never touch our own tables.</b> Authentication
              is handled entirely by Supabase&rsquo;s own auth system. One less thing we could get
              wrong.
            </li>
          </ul>
        </Card>

        <InfoCard title="3. Connect Vercel and deploy">
          Vercel points at the forked repository, given the new Supabase project&rsquo;s connection
          details as environment variables — same code, your own database. Every push to main
          rebuilds and redeploys automatically. Nothing about this step is specific to this
          project&rsquo;s data; it&rsquo;s the same path for anyone forking any Next.js-plus-Supabase
          application.
        </InfoCard>
      </section>

      {/* --------------------------- One worked example --------------------------- */}
      <section id="example" className="flex scroll-mt-16 flex-col gap-3.5 pt-6 pb-2">
        <SectionHead
          n="06"
          title="If someone wants one concrete example"
          dek="Not a teaching session — but one real walkthrough is a good way to keep a curious student satisfied without opening the floor to twenty more questions. This is the Wish List table, start to finish."
        />

        <Card className="gap-3">
          <CardHeader title="Step 1 — start from the actual requirement, not the columns" />
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            The requirement was specific: anyone can post a material the catalog doesn&rsquo;t have;
            everyone can see the item; nobody but Officer/Admin can see who posted it. Every column
            decision below traces back to that one sentence.
          </p>
        </Card>

        <Card className="gap-3">
          <CardHeader title="Step 2 — design the columns around who needs to read what" />
          <ul className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">wish_id</code>,{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">item_name</code>,{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">description</code>,{" "}
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">status</code> — the
              plain, public parts of a wish. Nothing sensitive here.
            </li>
            <li>
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">requested_by</code> —
              who posted it, needed so the poster can edit or withdraw their own wish later.
            </li>
            <li>
              <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">department</code> — the
              one deliberate design call. It would be more &ldquo;normal&rdquo; to look this up later by
              joining to the poster&rsquo;s own user profile. Instead it&rsquo;s copied onto the wish
              itself at the moment it&rsquo;s posted. The reason: a join would mean giving{" "}
              <i>every</i> viewer some way to read the poster&rsquo;s user record to find their
              department — which reopens the exact door the privacy requirement was trying to close.
              Copying the value once, at write time, means nobody ever needs read-access to someone
              else&rsquo;s profile at all.
            </li>
          </ul>
        </Card>

        <Card className="gap-3">
          <CardHeader title="Step 3 — write the policy, then let the server code do the rest" />
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            The table&rsquo;s security policy is actually simple: <i>any signed-in user can read this
            table.</i> That surprises people — where&rsquo;s the privacy rule? It&rsquo;s one layer up:
            the server code that turns database rows into what the browser receives has a single yes/no
            switch — <code className="rounded bg-background px-1 py-0.5 text-[12.5px]">include the department field or don&rsquo;t</code> —
            and that switch is only ever flipped on for an Officer or Admin. Everyone else&rsquo;s copy
            of the response never has the field in it at all.
          </p>
          <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            The lesson worth landing on: not every rule belongs in a database policy. Sometimes the
            right design is &ldquo;the database allows reading this row, and our own server code decides
            what&rsquo;s actually worth including in the answer.&rdquo; Knowing which layer should own a
            given rule is most of what schema design actually is.
          </p>
        </Card>
      </section>
    </AppShell>
  );
}

function SectionHead({ n, title, dek }: { n: string; title: string; dek: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border pb-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] font-semibold text-gold">{n}</span>
        <h2 className={`${serif.className} text-[22px] text-foreground sm:text-[25px]`}>{title}</h2>
      </div>
      <p className="max-w-[62ch] text-[13.5px] text-muted-2">{dek}</p>
    </div>
  );
}

function Th({ children, first, last }: { children: React.ReactNode; first?: boolean; last?: boolean }) {
  return (
    <th
      className={`border-b border-border px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-2 ${
        first ? "rounded-tl-xl" : last ? "rounded-tr-xl" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, strong, muted }: { children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <td className={strong ? "font-semibold text-foreground" : muted ? "text-muted" : ""}>{children}</td>
  );
}

function GlanceRow({
  label,
  plan,
  built,
  tone,
  tip,
  isLast,
}: {
  label: React.ReactNode;
  plan: string;
  built: string;
  tone: "gold" | "ok" | "navy";
  tip: React.ReactNode;
  isLast?: boolean;
}) {
  const dotClass =
    tone === "gold" ? "bg-gold" : tone === "ok" ? "bg-[#15803d]" : "bg-navy";
  return (
    <tr className="border-t border-border">
      <td className={`px-4 py-3 align-top text-[12.5px] font-bold uppercase tracking-wide text-muted-2 ${isLast ? "rounded-bl-xl" : ""}`}>
        <Tip label={label}>{tip}</Tip>
      </td>
      <td className="px-4 py-3 align-top text-muted">{plan}</td>
      <td className={`px-4 py-3 align-top ${isLast ? "rounded-br-xl" : ""}`}>
        <span className={`mr-2 inline-block size-1.5 rounded-full align-middle ${dotClass}`} />
        <span className="font-medium text-foreground">{built}</span>
      </td>
    </tr>
  );
}

// Pure-CSS hover tooltip — no client component needed, works the same way
// in the (also client-rendered) slide deck. Don't nest one Tip inside
// another's popup content — the floating box has a fixed width and isn't
// built to host a second floating box of its own.
function Tip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-block cursor-help">
      <span className="border-b border-dotted border-muted-2">{label}</span>
      <span className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 max-w-[80vw] rounded-lg border border-border bg-foreground p-3.5 text-[12.5px] font-normal normal-case leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:visible group-hover/tip:opacity-100">
        {children}
      </span>
    </span>
  );
}

function DecisionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2 !border-l-[3px] !border-l-navy">
      <CardHeader title={title} />
      <div className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">{children}</div>
    </Card>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2">
      <CardHeader title={title} />
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">{children}</p>
    </Card>
  );
}

function Callout({
  tone,
  tag,
  title,
  children,
}: {
  tone: "critical" | "low";
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  const borderColor = tone === "critical" ? "!border-l-critical-text" : "!border-l-low-text";
  return (
    <Card className={`gap-2 !border-l-[3px] ${borderColor}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardHeader title={title} />
        <Badge tone={tone}>{tag}</Badge>
      </div>
      <div className="max-w-[68ch] text-[13.5px] leading-relaxed text-muted">{children}</div>
    </Card>
  );
}

function FlowRow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-navy-border bg-navy-bg px-3.5 py-2 text-[13px] font-bold text-navy">
            <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
            {step}
          </div>
          {i < steps.length - 1 && <span className="text-muted-2">→</span>}
        </div>
      ))}
    </div>
  );
}
