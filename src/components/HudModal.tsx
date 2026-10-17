"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  /** Tap backdrop to dismiss (optional modals only). */
  onBackdropClick?: () => void;
  /** Escape key. Defaults to onBackdropClick. */
  onEscape?: () => void;
  panelClassName?: string;
};

/** Bottom-sheet on mobile; centered on larger screens. Portaled + scroll-locked. */
export default function HudModal({
  open,
  title,
  children,
  onBackdropClick,
  onEscape,
  panelClassName,
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (onEscape ?? onBackdropClick)?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onEscape, onBackdropClick]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="hud-overlay"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className={`hud-panel hud-sheet${panelClassName ? ` ${panelClassName}` : ""}`}
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
