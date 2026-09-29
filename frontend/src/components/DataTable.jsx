import { ArrowUpDown } from "lucide-react";
import { clsx } from "clsx";
import { EmptyState, Skeleton } from "./ui/primitives";

export function DataTable({ rows = [], columns = [], empty = "No records found", loading = false, tableClassName, onRowClick, rowActionLabel = "Open record" }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (!rows.length) return <EmptyState title={empty} />;

  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full min-w-[760px] border-collapse text-left text-sm", tableClassName)}>
        <thead>
          <tr className="border-b border-line bg-slate-50 text-xs uppercase text-muted">
            {columns.map((column) => (
              <th key={column.id ?? column.header} className={clsx("px-4 py-3 font-semibold", column.headerClassName)}>
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {column.sortable !== false && <ArrowUpDown className="h-3.5 w-3.5" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? row._id ?? index} className={clsx("border-b border-slate-100 hover:bg-slate-50", onRowClick && "cursor-pointer focus:bg-teal-50 focus:outline-none")} onClick={() => onRowClick?.(row)} onKeyDown={(event) => { if (onRowClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); } }} tabIndex={onRowClick ? 0 : undefined} role={onRowClick ? "button" : undefined} aria-label={onRowClick ? rowActionLabel : undefined}>
              {columns.map((column) => (
                <td key={column.id ?? column.header} className={clsx("px-4 py-3 align-top", column.cellClassName)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
