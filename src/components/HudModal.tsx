"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  /** Tap backdrop to dismiss (optional modals only). */
  onBackdropClick?: () => void;
};

/** Bottom-sheet on mobile; centered on larger screens. Portaled + scroll-locked. */
export default function HudModal({
  open,
  title,
  children,
  onBackdropClick,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open, title]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="hud-overlay"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="hud-panel hud-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "hud-title" : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2 id="hud-title" className="hud-title">
            {title}
          </h2>
        ) : null}
        <div className="hud-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
