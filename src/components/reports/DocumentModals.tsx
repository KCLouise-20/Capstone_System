"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, ShieldCheck, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { RequestStatus, DeliveryRecord } from "@/lib/types";
import type { DocumentLetterhead } from "@/lib/letterhead";
import { formatPhDate } from "@/lib/datetime";

/**
 * Shared "proper document" rendering for RIS/Delivery records — the same
 * letterhead + signature-block format Reports' own "RIS / Release Form" tab
 * established (PrintHeader/PrintTable/SignatureBlock), reused everywhere a
 * record needs to be viewed or printed instead of each place inventing its
 * own summary table.
 *
 * Two ways this gets used:
 *  - *Panel* (RisDocumentPanel/DeliveryDocumentPanel): an inline swap-in
 *    for wherever a "New X Record" form normally sits (Deliveries,
 *    Releases, Request Supplies) — clicking a history row replaces the
 *    form with the actual document, Back returns to the form. Since this
 *    is plain page content (nothing marks it .no-print), what you see on
 *    screen is exactly what prints — no separate hidden copy needed.
 *  - *Modal* (RisDocumentModal/DeliveryDocumentModal): for places with no
 *    natural form to swap out (Reports' Stock Card/Transaction History
 *    rows). Modal.tsx's own wrapper is marked .no-print so its chrome
 *    (backdrop, title bar) never bleeds into a print — which means content
 *    nested inside it is also hidden from print, so the Modal variant
 *    keeps a second, hidden .print-area copy of the same content outside
 *    the modal for window.print() to actually use.
 */

export interface RisDocumentRecord {
  refNo: string;
  department?: string;
  date: string;
  status: RequestStatus;
  scio?: string;
  purpose?: string;
  // Appendix 63 header block
  deliveryUnit?: string;
  fundCluster?: string;
  responsibilityCenterCode?: string;
  poNo?: string;
  items: {
    itemName: string;
    qty: number;
    unit?: string;
    stockOnHand?: number;
    stockNo?: string;
    /** Computed: stockOnHand >= qty. undefined when stock was never measured. */
    stockAvailable?: boolean;
    /** Free-text note for the Issue column on the printed form. */
    remarks?: string;
  }[];
  requestedBy?: string;
  requestedByDesignation?: string;
  approvedBy?: string;
  approvedByDesignation?: string;
  issuedBy?: string;
  issuedByDesignation?: string;
  receivedBy?: string;
  receivedByDesignation?: string;
  approvedOn?: string;
  issuedOn?: string;
  /** Record-level notes, printed in the header block. */
  remarks?: string;
  
}


export function PrintHeader({
  letterhead,
  title,
  subtitle,
  generatedOn,
}: {
  letterhead: DocumentLetterhead;
  title: string;
  subtitle?: string;
  generatedOn: string;
}) {
  const { institutionName, systemTitle, officeName, address, contactInfo } = letterhead;
  return (
    <div className="mb-5 flex flex-col items-center gap-1 border-b-2 border-black pb-3 text-center">
      <div className="flex items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- print output
            needs a plain, eagerly-loaded <img>; next/image's lazy-loading
            wrapper can leave the logo unfetched while this area sits
            display:none off-screen (its normal state outside @media print). */}
        <img src="/ustp-logo.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
        <div className="flex flex-col items-center">
          <div className="text-[13px] font-bold uppercase">{institutionName}</div>
          <div className="text-[11px]">{systemTitle}</div>
          {officeName && <div className="text-[11px] font-semibold">{officeName}</div>}
          {address && <div className="text-[10px] text-[#3f3f46]">{address}</div>}
          {contactInfo && <div className="text-[10px] text-[#3f3f46]">{contactInfo}</div>}
        </div>
      </div>
      <div className="mt-2 text-[16px] font-extrabold uppercase">{title}</div>
      {subtitle && <div className="text-[12.5px] text-[#3f3f46]">{subtitle}</div>}
      {/* suppressHydrationWarning: this is computed fresh from new Date() on
          both the server render and the client hydration pass. Those two
          can land on different calendar days whenever the server's clock
          (UTC, on Vercel) and the viewer's local clock (Philippines,
          UTC+8) disagree about what day it is -- true for ~8 hours out of
          every 24. That's a real, expected text mismatch, not a bug to
          chase — it's exactly the case this prop exists for. Confirmed
          this was the source of a live "React error #418" a Supply
          Officer hit in production (couldn't reproduce locally, since a
          local dev server and browser always share one clock/timezone —
          the mismatch only manifests when they're genuinely different
          machines in different timezones, i.e. real deployed usage). */}
      <div className="mt-1 text-[10px] text-[#71717a]" suppressHydrationWarning>
        Generated on {generatedOn}
      </div>
    </div>
  );
}

export function PrintTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className="border border-black px-2 py-1.5 text-left font-bold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border border-black px-2 py-1.5">
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={headers.length} className="border border-black px-2 py-4 text-center">
              No records.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function SignatureBlock({ lines }: { lines: { label: string; name?: string }[] }) {
  return (
    <div className="mt-10 grid gap-8" style={{ gridTemplateColumns: `repeat(${lines.length}, 1fr)` }}>
      {lines.map((l) => (
        <div key={l.label} className="flex flex-col items-center gap-1 text-center">
          <div className="h-10 w-full border-b border-black" />
          <div className="text-[12px] font-semibold">{l.name || " "}</div>
          <div className="text-[10.5px] text-[#71717a]">{l.label}</div>
        </div>
      ))}
    </div>
  );
}

export function FieldView({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-2">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// Explicit timeZone: "Asia/Manila" rather than leaving it to whichever
// machine happens to be formatting — the earlier hydration-mismatch fix
// (see PrintHeader's suppressHydrationWarning) only suppressed the warning
// this same server/client clock disagreement causes; this actually
// eliminates the disagreement, since both now compute the identical string.
function now() {
  return formatPhDate(new Date());
}

/** RIS refs are readable, low-security convenience QR payloads (plain
 *  text, same as Inventory's item_code QR) — the actual verification value
 *  isn't in the code being unguessable, it's in the Supply Officer's scan
 *  looking the number up against the live system record (current status,
 *  requester, items) rather than trusting anything printed on paper. */
const CLAIM_SLIP_STATUSES: RequestStatus[] = ["Approved", "Released"];

function useClaimSlipQr(record: RisDocumentRecord | null): string {
  const [qrUrl, setQrUrl] = useState("");
  const claimSlipKey =
    record && CLAIM_SLIP_STATUSES.includes(record.status) ? `${record.refNo}:${record.status}` : null;

  // Render-time reset (React's documented pattern for "adjusting state when
  // a prop changes") for the no-QR case, rather than calling setState
  // directly in the effect body below — the effect only ever sets qrUrl
  // from inside its async .then(), which isn't synchronous effect-body
  // setState and doesn't trigger the same cascading-render concern.
  const [lastClaimSlipKey, setLastClaimSlipKey] = useState(claimSlipKey);
  if (claimSlipKey !== lastClaimSlipKey) {
    setLastClaimSlipKey(claimSlipKey);
    if (!claimSlipKey) setQrUrl("");
  }

  useEffect(() => {
    if (!claimSlipKey || !record) return;
    let cancelled = false;
    QRCode.toDataURL(record.refNo, { margin: 1, width: 160 }).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [claimSlipKey, record]);

  return qrUrl;
}

function RisDocumentContent({
  record,
  letterhead,
  qrUrl,
}: {
  record: RisDocumentRecord;
  letterhead: DocumentLetterhead;
  qrUrl: string;
}) {
  return (
    <div>
      <PrintHeader
        letterhead={letterhead}
        title="Requisition and Issue Slip"
        subtitle={`RIS No. ${record.refNo}`}
        generatedOn={now()}
      />
        <div className="mb-3 text-[11.5px]">
        <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
          <div className="flex gap-1">
            <span className="font-bold">Entity Name:</span>
            <span className="flex-1 border-b border-dotted border-black">{letterhead.institutionName}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">Fund Cluster:</span>
            <span className="flex-1 border-b border-dotted border-black">{record.fundCluster ?? ""}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">Office:</span>
            <span className="flex-1 border-b border-dotted border-black">{letterhead.officeName}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">Responsibility Center Code:</span>
            <span className="flex-1 border-b border-dotted border-black">{record.responsibilityCenterCode ?? ""}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">Delivery Unit:</span>
            <span className="flex-1 border-b border-dotted border-black">{record.deliveryUnit ?? ""}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">RIS No.:</span>
            <span className="flex-1 border-b border-dotted border-black">{record.refNo}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">Status:</span>
            <span className="flex-1">{record.status}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold">PO No.:</span>
            <span className="flex-1 border-b border-dotted border-black">{record.poNo ?? ""}</span>
          </div>
        </div>
        {record.remarks && (
          <div className="mt-1.5 flex gap-1">
            <span className="font-bold">Remarks:</span>
            <span className="flex-1">{record.remarks}</span>
          </div>
        )}
      </div>


            <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th rowSpan={2} className="border border-black px-1.5 py-1 text-left font-bold">Stock No</th>
            <th rowSpan={2} className="border border-black px-1.5 py-1 text-left font-bold">Unit</th>
            <th rowSpan={2} className="border border-black px-1.5 py-1 text-left font-bold">Item / Description</th>
            <th colSpan={2} className="border border-black px-1.5 py-1 text-center font-bold italic">Requisition</th>
            <th colSpan={2} className="border border-black px-1.5 py-1 text-center font-bold italic">Stock Available?</th>
            <th colSpan={2} className="border border-black px-1.5 py-1 text-center font-bold italic">Issue</th>
          </tr>
          <tr>
            <th className="border border-black px-1.5 py-1 text-left font-bold">Quantity</th>
            <th className="border border-black px-1.5 py-1 text-left font-bold">&nbsp;</th>
            <th className="border border-black px-1.5 py-1 text-left font-bold">Yes</th>
            <th className="border border-black px-1.5 py-1 text-left font-bold">No</th>
            <th className="border border-black px-1.5 py-1 text-left font-bold">Quantity</th>
            <th className="border border-black px-1.5 py-1 text-left font-bold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {record.items.map((it, i) => (
            <tr key={i}>
              <td className="border border-black px-1.5 py-1">{it.stockNo ?? ""}</td>
              <td className="border border-black px-1.5 py-1">{it.unit ?? ""}</td>
              <td className="border border-black px-1.5 py-1">{it.itemName}</td>
              <td className="border border-black px-1.5 py-1 text-right">{it.qty.toFixed(2)}</td>
              <td className="border border-black px-1.5 py-1">&nbsp;</td>
              <td className="border border-black px-1.5 py-1 text-center">{it.stockAvailable === true ? "Yes" : ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{it.stockAvailable === false ? "No" : ""}</td>
              <td className="border border-black px-1.5 py-1 text-right">
                {it.stockAvailable === true ? it.qty.toFixed(2) : ""}
              </td>
              <td className="border border-black px-1.5 py-1">{it.remarks ?? ""}</td>
            </tr>
          ))}
          {record.items.length === 0 && (
            <tr>
              <td colSpan={9} className="border border-black px-2 py-4 text-center">No records.</td>
            </tr>
          )}
        </tbody>
      </table>
      {record.purpose && (
        <div className="mt-3 flex gap-1 text-[11.5px]">
          <span className="font-bold">Purpose:</span>
          <span className="flex-1 border-b border-dotted border-black">{record.purpose}</span>
        </div>
      )}
      <div className="mt-6 grid grid-cols-4 border border-black text-[10.5px]">
      </div>
            <div className="mt-6 grid grid-cols-4 border border-black text-[10.5px]">
        {[
          {
    head: "Requested by:",
    name: record.requestedBy,
    designation: record.requestedByDesignation,
    date: "",
  },
  {
    head: "Approved by:",
    name: record.approvedBy,
    designation: record.approvedByDesignation,
    date: record.approvedOn ? formatPhDate(record.approvedOn) : "",
  },
    // Only a released record has been issued. Until then this cell
    // prints blank, regardless of what the caller passed in.
  {
    head: "Issued by:",
    name: record.status === "Released" ? record.issuedBy : undefined,
    designation: record.status === "Released" ? record.issuedByDesignation : undefined,
    date:
      record.status === "Released" && record.issuedOn
        ? formatPhDate(record.issuedOn)
        : "",
  },
  {
    head: "Received by:",
    name: record.receivedBy,
    designation: record.receivedByDesignation,
    date: "",
  },
        ].map((col) => (
          <div key={col.head} className="flex flex-col border-r border-black last:border-r-0">
            <div className="border-b border-black px-2 py-1 font-bold">{col.head}</div>
            {[
              { label: "Signature:", value: "" },
              { label: "Printed Name:", value: col.name },
              { label: "Designation:", value: col.designation },
              { label: "Date:", value: col.date },
            ].map((row) => (
              <div key={row.label} className="flex gap-1 border-b border-black px-2 py-1 last:border-b-0">
                <span className="w-[62px] shrink-0 font-bold">{row.label}</span>
                <span className="flex-1">{row.value ?? ""}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-around text-[11px] font-bold uppercase">
        <span>RIS DATE RECEIVED: __________________</span>
        <span>RIS DATE RETURNED: __________________</span>
      </div>

      {qrUrl && (
        <div className="mt-6 flex flex-col items-center gap-1 border-t border-black pt-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- same
              reasoning as PrintHeader's logo: a data-URL QR generated
              client-side has no next/image benefit and needs to be
              reliably present the moment print media kicks in. */}
          <img src={qrUrl} alt="" className="size-24" />
          <div className="text-[10px] font-bold uppercase">Claim Slip — Present With Valid ID</div>
          <div className="max-w-xs text-[9px] text-[#71717a]">
            To be scanned by the Supply Office to verify this request before releasing items.
          </div>
        </div>
      )}
    </div>
  );
}

function DeliveryDocumentContent({ record, letterhead }: { record: DeliveryRecord; letterhead: DocumentLetterhead }) {
  return (
    <div>
      <PrintHeader
        letterhead={letterhead}
        title="Delivery Receipt"
        subtitle={`Ref. No. ${record.refNo}`}
        generatedOn={now()}
      />
      <div className="mb-3 grid grid-cols-3 gap-4 text-[12px]">
        <div>
          <span className="font-semibold">Supplier: </span>
          {record.supplier}
        </div>
        <div>
          <span className="font-semibold">Date delivered: </span>
          {record.date}
        </div>
        {record.poNumber && (
          <div>
            <span className="font-semibold">OR / PO number: </span>
            {record.poNumber}
          </div>
        )}
        {record.remarks && (
          <div className="col-span-3">
            <span className="font-semibold">Remarks: </span>
            {record.remarks}
          </div>
        )}
      </div>
      <PrintTable
        headers={["Item", "Qty", "Unit Cost", "Line Total"]}
        rows={record.items.map((it) => [
          it.itemName,
          `${it.qty} ${it.unit}`,
          `₱${it.unitCost.toLocaleString()}`,
          `₱${(it.qty * it.unitCost).toLocaleString()}`,
        ])}
      />
      <div className="mt-2 text-right text-[13px] font-bold">Total: ₱{record.totalCost.toLocaleString()}</div>
      <SignatureBlock lines={[{ label: "Received by", name: record.receivedBy }, { label: "Checked by" }]} />
    </div>
  );
}

function ScanVerifiedBanner({ status }: { status: RequestStatus }) {
  return (
    <div
      className={
        status === "Approved"
          ? "flex items-center gap-2 rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-[12.5px] font-semibold text-ok-text"
          : status === "Released"
            ? "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] font-semibold text-muted"
            : "flex items-center gap-2 rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-semibold text-critical-text"
      }
    >
      <ShieldCheck size={15} strokeWidth={1.8} />
      {status === "Approved"
        ? "Verified — matches a current Approved request. Safe to release."
        : status === "Released"
          ? "Verified — but this request was already marked Released."
          : `Verified — but this request is ${status}, not Approved. Do not release.`}
    </div>
  );
}

function DocumentActionBar({ onClose, extra }: { onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div className="no-print flex flex-col gap-3 border-b border-border-soft pb-3.5">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-foreground"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Back
        </button>
        <Button variant="dark" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.8} />
          Print
        </Button>
      </div>
      {extra}
    </div>
  );
}

/**
 * Inline swap-in for a "New RIS Form"-style panel — used by Releases and
 * Request Supplies. Not a popup: it takes the same slot the form normally
 * occupies, so what's on screen is the actual document, not a generic
 * summary, and it's exactly what prints (no hidden duplicate needed).
 */
export function RisDocumentPanel({
  record,
  onClose,
  letterhead,
  scanVerified,
}: {
  record: RisDocumentRecord | null;
  onClose: () => void;
  letterhead: DocumentLetterhead;
  /** Set when this panel was opened by the Supply Officer scanning the
   *  requester's printed claim slip (see ReleasesClient's "Scan to
   *  Verify") — shows a status-aware banner confirming the scanned code
   *  matched a real, current system record instead of the officer having
   *  to just take the requester's word for it. */
  scanVerified?: boolean;
}) {
  const qrUrl = useClaimSlipQr(record);
  if (!record) return null;
  return (
    <Card className="document-panel">
      <DocumentActionBar onClose={onClose} extra={scanVerified && <ScanVerifiedBanner status={record.status} />} />
      <RisDocumentContent record={record} letterhead={letterhead} qrUrl={qrUrl} />
    </Card>
  );
}

/** Same idea as RisDocumentPanel, for Deliveries. */
export function DeliveryDocumentPanel({
  record,
  onClose,
  letterhead,
}: {
  record: DeliveryRecord | null;
  onClose: () => void;
  letterhead: DocumentLetterhead;
}) {
  if (!record) return null;
  return (
    <Card className="document-panel">
      <DocumentActionBar onClose={onClose} />
      <DeliveryDocumentContent record={record} letterhead={letterhead} />
    </Card>
  );
}

/**
 * Popup variant — for places with no natural form-panel to swap out
 * (Reports' Stock Card/Transaction History rows). Keeps a second, hidden
 * .print-area copy of the content outside the Modal, since Modal.tsx's own
 * .no-print wrapper would otherwise hide anything nested inside it from
 * print too.
 */
export function RisDocumentModal({
  record,
  onClose,
  letterhead,
  scanVerified,
}: {
  record: RisDocumentRecord | null;
  onClose: () => void;
  letterhead: DocumentLetterhead;
  scanVerified?: boolean;
}) {
  const qrUrl = useClaimSlipQr(record);
  return (
    <>
      <Modal open={record !== null} onClose={onClose} title={record ? `RIS No. ${record.refNo}` : "RIS"} widthClassName="max-w-2xl">
        {record && (
          <div className="no-print flex flex-col gap-4">
            {scanVerified && <ScanVerifiedBanner status={record.status} />}
            <RisDocumentContent record={record} letterhead={letterhead} qrUrl={qrUrl} />
            <div className="flex justify-end">
              <Button variant="dark" onClick={() => window.print()}>
                <Printer size={14} strokeWidth={1.8} />
                Print
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {record && (
        <div className="print-area hidden print:block">
          <RisDocumentContent record={record} letterhead={letterhead} qrUrl={qrUrl} />
        </div>
      )}
    </>
  );
}

export function DeliveryDocumentModal({
  record,
  onClose,
  letterhead,
}: {
  record: DeliveryRecord | null;
  onClose: () => void;
  letterhead: DocumentLetterhead;
}) {
  return (
    <>
      <Modal
        open={record !== null}
        onClose={onClose}
        title={record ? `Delivery — ${record.refNo}` : "Delivery"}
        widthClassName="max-w-2xl"
      >
        {record && (
          <div className="no-print flex flex-col gap-4">
            <DeliveryDocumentContent record={record} letterhead={letterhead} />
            <div className="flex justify-end">
              <Button variant="dark" onClick={() => window.print()}>
                <Printer size={14} strokeWidth={1.8} />
                Print
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {record && (
        <div className="print-area hidden print:block">
          <DeliveryDocumentContent record={record} letterhead={letterhead} />
        </div>
      )}
    </>
  );
}
