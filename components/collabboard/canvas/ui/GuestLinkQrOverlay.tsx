'use client';

/**
 * PATCH-365. A full-screen white QR overlay, for a projector in a room.
 *
 * Escape closes ONLY this overlay: its key listener runs in the CAPTURE phase
 * and stops propagation, so the Share modal's own window Escape handler never
 * fires underneath.
 */

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

export interface GuestLinkQrOverlayProps {
  readonly url: string;
  readonly title: string;
  readonly onClose: () => void;
}

const FALLBACK_SIZE = 320;

export default function GuestLinkQrOverlay({ url, title, onClose }: GuestLinkQrOverlayProps) {
  const [size, setSize] = useState(FALLBACK_SIZE);

  useEffect(() => {
    const compute = () => {
      if (typeof window === 'undefined') return;
      const value = Math.min(window.innerHeight * 0.7, window.innerWidth * 0.7);
      setSize(Number.isFinite(value) && value > 0 ? Math.round(value) : FALLBACK_SIZE);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    // Capture phase, so it runs before the Share modal's window listener and
    // stopPropagation keeps the event from reaching it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      data-guest-qr-overlay="true"
      role="dialog"
      aria-modal="true"
      aria-label="QR code for the guest link"
      className="fixed inset-0 z-[3200] flex flex-col items-center justify-center gap-6 bg-white p-6"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        data-guest-qr-close="true"
        onClick={onClose}
        aria-label="Close QR code"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100"
      >
        <X className="h-5 w-5" />
      </button>

      <QRCodeSVG value={url} level="M" size={size} marginSize={2} />

      <p className="text-center text-xl font-semibold text-gray-900">Scan to join {title}</p>
      <p className="max-w-full break-all text-center text-sm text-gray-500">{url}</p>
    </div>
  );
}
