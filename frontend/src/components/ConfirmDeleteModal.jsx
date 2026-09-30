import { Trash2, X } from "lucide-react";
import { Button } from "./ui/primitives";

export function ConfirmDeleteModal({ title = "Delete", message, confirmLabel = "Yes, Delete", busy = false, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onCancel}>
      <section className="w-full max-w-md rounded-lg border border-line bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="confirm-delete-title" className="font-semibold text-ink">{title}</h2>
          <button type="button" className="focus-ring rounded p-1 text-muted hover:bg-slate-100" aria-label="Close" disabled={busy} onClick={onCancel}><X size={18} /></button>
        </header>
        <div className="p-5">
          <p className="text-sm leading-6 text-muted">{message}</p>
          <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>No</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}><Trash2 size={15} />{busy ? "Deleting..." : confirmLabel}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
