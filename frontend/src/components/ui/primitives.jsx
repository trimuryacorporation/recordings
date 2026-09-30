import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

export function Button({ className, variant = "primary", ...props }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-teal-800",
    secondary: "border border-line bg-white text-ink hover:bg-slate-50",
    danger: "bg-danger text-white hover:bg-red-800",
    ghost: "text-ink hover:bg-slate-100"
  };

  return (
    <button
      className={clsx(
        "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, type, ...props }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      type={isPassword && visible ? "text" : type}
      className={clsx(
        "focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted",
        isPassword && "pr-10",
        className
      )}
      {...props}
    />
  );
  if (!isPassword) return input;
  return <span className="relative block">{input}<button type="button" className="focus-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-ink" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={clsx("focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={clsx("focus-ring min-h-28 w-full rounded-md border border-line bg-white p-3 text-sm text-ink", className)}
      {...props}
    />
  );
}

export function Card({ title, action, children, className, bodyClassName, headerClassName }) {
  return (
    <section className={clsx("rounded-lg border border-line bg-white shadow-sm", className)}>
      {(title || action) && (
        <div className={clsx("flex items-center justify-between gap-3 border-b border-line px-5 py-4", headerClassName)}>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={clsx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral" }) {
  const styles = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-success",
    warning: "bg-amber-50 text-warning",
    danger: "bg-red-50 text-danger",
    accent: "bg-blue-50 text-accent"
  };

  return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", styles[tone])}>{children}</span>;
}

export function EmptyState({ title = "No records found", body = "Create or adjust filters to see records here." }) {
  return (
    <div className="rounded-md border border-dashed border-line p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx("animate-pulse rounded-md bg-slate-200", className)} />;
}

export function PageHeader({ title, eyebrow, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-sm font-medium text-muted">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-normal text-ink">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-danger">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{message}</p>
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
