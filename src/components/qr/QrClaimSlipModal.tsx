"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/Modal";

/**
 * Claim-slip QR for a released RIS, opened from the RIS History row instead
 * of printed on the document itself. Payload is the RIS number, matching
 * what Releases' "Scan to Verify" already decodes (see QrScannerModal), so
 * both sides keep working with no server lookup.
 */
export function QrClaimSlipModal({
  open,
  onClose,
  risNumber,
  requestedBy,
}: {
  open: boolean;
  onClose: () => void;
  risNumber: string;
  requestedBy?: string;
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!open || !risNumber) {
      setDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(risNumber, { margin: 1, width: 320 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };  
  }, [open, risNumber]);

  return (
    <Modal open={open} onClose={onClose} title={`Claim Slip — ${risNumber}`}>
      <div className="flex flex-col items-center gap-3 text-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- client-side
          // data URL, same reasoning as the print header's logo.
          <img src={dataUrl} alt={`Claim slip QR for ${risNumber}`} className="size-64" />
        ) : (
          <p className="py-16 text-[12.5px] text-muted-2">Generating…</p>
        )}
        <div className="flex flex-col gap-0.5 text-[12.5px]">
          <span className="font-bold">{requestedBy ?? "—"}</span>
          <span className="text-muted-2">{risNumber}</span>
        </div>
        <p className="max-w-xs text-[11px] text-muted-2">
          Present this slip with a valid ID. The Supply Office scans it to verify the
          request before releasing the items.
        </p>
      </div>
    </Modal>
  );
}
