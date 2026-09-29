import { DataTable } from "../components/DataTable";
import { Card, ErrorState, PageHeader } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";

export function AuditLogsPage() {
  const logs = useApiResource("/api/audit-logs");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="System" title="Audit Logs" />
      {logs.error && <ErrorState message={logs.error} onRetry={logs.reload} />}
      <Card title="Audit Trail">
        <DataTable
          loading={logs.loading}
          rows={logs.data}
          columns={[
            { header: "Actor", cell: (row) => row.actor?.email ?? "System" },
            { header: "Action", cell: (row) => row.action },
            { header: "Entity", cell: (row) => `${row.entity}${row.entityId ? ` / ${row.entityId}` : ""}` },
            { header: "Location", cell: (row) => row.metadata?.location ? `${row.metadata.location.latitude.toFixed(5)}, ${row.metadata.location.longitude.toFixed(5)} (${Math.round(row.metadata.location.accuracy ?? 0)}m)` : row.ip ?? "-" },
            { header: "Timestamp", cell: (row) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </Card>
    </div>
  );
}
