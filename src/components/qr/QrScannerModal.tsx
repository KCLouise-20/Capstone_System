"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Shared camera + jsQR scanning modal. Manual getUserMedia +
 * requestAnimationFrame polling loop rather than a full barcode-scanning
 * library — every caller here only ever needs to read back one plain-text
 * QR payload (an item_code or a RIS ref no) and match it against data it
 * already has client-side. Originally built inline in Inventory (item
 * lookup); Releases' "Scan to Verify" needs the exact same camera
 * lifecycle, so it now lives here once instead of duplicated in both
 * places.
 */
export function QrScannerModal({
  open,
  onClose,
  title,
  instructions,
  onDetect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  instructions: string;
  /** Called with each decoded QR payload (trimmed). Return an error message
   *  to show inline and keep scanning; return null/undefined once handled
   *  — the caller is then responsible for closing the modal itself (see
   *  Inventory/Releases: both close on match before doing anything else). */
  onDetect: (code: string) => string | null | undefined;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  // Reset the error left over from a previous scan the moment the modal
  // re-opens — done during render (React's documented pattern for
  // "adjusting state when a prop changes") rather than in the effect below,
  // since setState directly in an effect body triggers an avoidable extra
  // render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError("");
  }

  useEffect(() => {
    if (!open) return;
    let stopped = false;

    function stopScanCamera() {
      if (scanFrameRef.current !== null) {
        cancelAnimationFrame(scanFrameRef.current);
        scanFrameRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play().catch(() => {});

        const tick = () => {
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
            scanFrameRef.current = requestAnimationFrame(tick);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code?.data) {
            const message = onDetect(code.data.trim());
            if (message) {
              setError(message);
            } else {
              return;
            }
          }
          scanFrameRef.current = requestAnimationFrame(tick);
        };
        scanFrameRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        setError("Couldn't access the camera — check your browser's camera permission for this site.");
      });

    return () => {
      stopped = true;
      stopScanCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#18181b]">
          <video ref={videoRef} muted playsInline className="size-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <button
            onClick={onClose}
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
        <p className="text-center text-[12px] text-muted-2">{instructions}</p>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-center text-[12.5px] font-medium text-critical-text"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
