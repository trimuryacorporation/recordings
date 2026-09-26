import { Card, PageHeader } from "../components/ui/primitives";

export function PlaceholderPage({ title }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Module" title={title} />
      <Card title={title}>
        <p className="text-sm text-muted">
          This navigation target is ready for expansion. Database-backed workflows are live in projects, scripts, tasks, recording,
          dual sessions, QA, reports, vendors, users, and audit logs.
        </p>
      </Card>
    </div>
  );
}
