import { ExternalLink, RefreshCw } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, PageHeader } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";

const methodTone = { GET: "success", POST: "accent", PATCH: "warning", PUT: "warning", DELETE: "danger" };

export function ApiManagementPage() {
  const status = useApiResource("/api/status", {});
  const specification = useApiResource("/api/openapi.json", {});
  const endpoints = Object.entries(specification.data.paths ?? {}).flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => ({
      id: `${method}:${path}`,
      method: method.toUpperCase(),
      path,
      summary: operation.summary,
      group: operation.tags?.[0] ?? "General",
      secured: Boolean(operation.security?.length)
    }))
  );

  function reload() {
    status.reload();
    specification.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="API Management"
        action={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={reload}><RefreshCw size={16} />Refresh</Button>
            <a className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800" href="/api/docs" target="_blank" rel="noreferrer"><ExternalLink size={16} />Swagger</a>
          </div>
        }
      />
      {(status.error || specification.error) && <ErrorState message={status.error || specification.error} onRetry={reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="API status"><Badge tone={status.data.ok ? "success" : "danger"}>{status.loading ? "Checking" : status.data.ok ? "Online" : "Offline"}</Badge></Card>
        <Card title="Database"><p className="text-lg font-semibold capitalize">{status.data.database ?? "Checking"}</p></Card>
        <Card title="Version"><p className="text-lg font-semibold">{status.data.version ?? "-"}</p></Card>
        <Card title="Endpoints"><p className="text-lg font-semibold">{endpoints.length}</p></Card>
      </div>
      <Card title="Endpoint catalog">
        <DataTable
          loading={specification.loading}
          rows={endpoints}
          columns={[
            { header: "Method", cell: (row) => <Badge tone={methodTone[row.method] ?? "neutral"}>{row.method}</Badge> },
            { header: "Endpoint", cell: (row) => <code className="text-xs font-semibold text-ink">{row.path}</code> },
            { header: "Group", cell: (row) => row.group },
            { header: "Description", cell: (row) => row.summary },
            { header: "Access", cell: (row) => <Badge tone={row.secured ? "warning" : "success"}>{row.secured ? "JWT" : "Public"}</Badge> }
          ]}
        />
      </Card>
    </div>
  );
}
