"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Option = { id: string; label: string };

type Props = {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

/** Tap-to-expand list — works reliably inside modals on iOS/Android. */
export default function PickerField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  required,
}: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`picker-field${open ? " picker-field-open" : ""}`}>
      <span className="picker-label">
        {label}
        {required ? " *" : ""}
      </span>
      <button
        type="button"
        disabled={disabled}
        className="picker-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "" : "picker-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="picker-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul id={listId} className="picker-list" role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === o.id}
                className={`picker-option${value === o.id ? " selected" : ""}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
