"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

type Option = { id: string; label: string };

type PickerGroupContext = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const PickerGroupContext = createContext<PickerGroupContext | null>(null);

/** Only one PickerField inside the group can be expanded at a time. */
export function PickerGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <PickerGroupContext.Provider value={{ openId, setOpenId }}>
      {children}
    </PickerGroupContext.Provider>
  );
}

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
  const group = useContext(PickerGroupContext);
  const fieldId = useId();
  const [soloOpen, setSoloOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.id === value);

  const open = group ? group.openId === fieldId : soloOpen;

  function setOpen(next: boolean) {
    if (group) {
      group.setOpenId(next ? fieldId : null);
    } else {
      setSoloOpen(next);
    }
  }

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
        onClick={() => setOpen(!open)}
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
