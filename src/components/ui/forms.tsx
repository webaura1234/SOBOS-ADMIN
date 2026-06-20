"use client";

import { useEffect, useRef } from "react";
import { BtnPrimary, BtnSecondary } from "./shared";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    open ? d.showModal() : d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="fixed inset-0 z-[150] m-auto max-w-md w-full bg-white border-2 border-border rounded-2xl p-0 backdrop:bg-black/40"
      onClose={onCancel}
    >
      <div className="p-6">
        <h2 className="text-lg font-bold text-black mb-2">{title}</h2>
        <p className="text-base text-muted font-medium mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <BtnSecondary onClick={onCancel}>Cancel</BtnSecondary>
          <button
            type="button"
            onClick={() => { onConfirm(); onCancel(); }}
            className={destructive ? "btn-primary !bg-red-600 !border-red-600 !text-white" : "btn-primary"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}

export function FormField({ label, children, required, hint }: FormFieldProps) {
  return (
    <label className="block mb-5">
      <span className="text-base font-bold text-black block mb-2">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {hint && <span className="text-sm font-medium text-muted block mb-2">{hint}</span>}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full h-12 px-4 border-2 border-border rounded-xl text-base font-semibold bg-white focus-ring text-black";

export const selectClass =
  "w-full h-12 px-4 border-2 border-border rounded-xl text-base font-semibold bg-white focus-ring text-black";

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
