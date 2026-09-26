import { RefreshCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";

const cardLabels = {
  totalProjects: "Total Projects",
  activeProjects: "Active Projects",
  totalRecordings: "Recordings",
  pendingQa: "Pending QA",
  approved: "Approved",
  rejected: "Rejected",
  activeUsers: "Active Users",
  activeVendors: "Active Vendors"
};

export function DashboardPage() {
  const { data, loading, error, reload } = useApiResource("/api/dashboard", null);

  if (loading && !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const taskStatus = data?.charts?.taskStatus?.map((row) => ({ name: row.status, count: row._count })) ?? [];
  const cards = Object.entries(data?.cards ?? {});

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Operations"
        title="Trimurya Script Recording Platform"
        action={
          <Button type="button" variant="secondary" onClick={reload}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([key, value]) => (
          <Card key={key}>
            <p className="text-sm text-muted">{cardLabels[key] ?? key}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Recording and Task Status">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={taskStatus}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Pending QA">
          <DataTable
            rows={data?.tables?.pendingQueue ?? []}
            columns={[
              { header: "Task", cell: (row) => row.taskCode },
              { header: "Project", cell: (row) => row.project?.name ?? "-" },
              { header: "Script", cell: (row) => row.script?.title ?? "-" },
              { header: "Status", cell: (row) => <Badge tone="warning">{row.status}</Badge> }
            ]}
          />
        </Card>
      </div>

      <Card title="Active Dual Sessions">
        <DataTable
          rows={data?.tables?.activeDualSessions ?? []}
          columns={[
            { header: "Session", cell: (row) => row.sessionCode },
            { header: "Status", cell: (row) => <Badge tone="accent">{row.status}</Badge> },
            { header: "Participants", cell: (row) => row.participants?.length ?? 0 },
            { header: "Duration", cell: (row) => (row.durationSeconds ? `${row.durationSeconds}s` : "-") }
          ]}
        />
      </Card>
    </div>
  );
}
