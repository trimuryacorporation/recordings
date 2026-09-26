import { Download, RefreshCcw } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Button, Card, ErrorState, PageHeader } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";

export function ReportsPage() {
  const projects = useApiResource("/api/reports/projects");

  function exportCsv() {
    const csv = [
      "Project,Client,Vendor,Tasks,Scripts,Sessions",
      ...projects.data.map((project) =>
        [
          project.name,
          project.client?.name ?? "",
          project.vendor?.companyName ?? "",
          project._count?.tasks ?? 0,
          project._count?.scripts ?? 0,
          project._count?.sessions ?? 0
        ].join(",")
      )
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "trimurya-project-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Reports"
        title="Reports"
        action={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={projects.reload}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" onClick={exportCsv} disabled={!projects.data.length}>
              <Download className="h-4 w-4" />
              CSV Export
            </Button>
          </div>
        }
      />
      {projects.error && <ErrorState message={projects.error} onRetry={projects.reload} />}
      <Card title="Project Report">
        <DataTable
          loading={projects.loading}
          rows={projects.data}
          columns={[
            { header: "Project", cell: (row) => row.name },
            { header: "Client", cell: (row) => row.client?.name ?? "-" },
            { header: "Vendor", cell: (row) => row.vendor?.companyName ?? "-" },
            { header: "Tasks", cell: (row) => row._count?.tasks ?? 0 },
            { header: "Scripts", cell: (row) => row._count?.scripts ?? 0 },
            { header: "Sessions", cell: (row) => row._count?.sessions ?? 0 }
          ]}
        />
      </Card>
    </div>
  );
}
