import { RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

const cardRoutes = {
  totalProjects: "/app/projects",
  activeProjects: "/app/projects",
  totalRecordings: "/app/record-single",
  pendingQa: "/app/qa",
  approved: "/app/approved",
  rejected: "/app/rejected",
  activeUsers: "/app/users",
  activeVendors: "/app/vendors"
};

export function DashboardPage() {
  const { data, loading, error, reload } = useApiResource("/api/dashboard", null);
  const navigate = useNavigate();

  if (loading && !data) {
    return <div className="grid gap-4"><Skeleton className="h-20" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-80" /></div>;
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const taskStatus = data?.charts?.taskStatus?.map((row) => ({ name: row.status, count: row._count })) ?? [];
  const cards = Object.entries(data?.cards ?? {});

  return <div className="space-y-6">
    <PageHeader eyebrow="Live Operations" title="TRT Tools" action={<Button type="button" variant="secondary" onClick={reload}><RefreshCcw className="h-4 w-4" />Refresh</Button>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([key, value]) => {
        const destination = cardRoutes[key] ?? "/app";
        return <button key={key} type="button" onClick={() => navigate(destination)} className="group text-left focus-ring rounded-lg" aria-label={`View ${cardLabels[key] ?? key}`}><Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-teal-200 group-hover:shadow-md"><p className="text-sm text-muted">{cardLabels[key] ?? key}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="text-3xl font-bold">{value}</p><span className="text-xs font-semibold text-brand opacity-0 transition group-hover:opacity-100">View details</span></div></Card></button>;
      })}
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Recording and Task Status" action={<button type="button" onClick={() => navigate("/app/tasks")} className="text-xs font-semibold text-brand hover:text-teal-800">View tasks</button>}>
        <div className="cursor-pointer" role="button" tabIndex={0} onClick={() => navigate("/app/tasks")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate("/app/tasks"); }} aria-label="Open recording tasks">
          <ResponsiveContainer width="100%" height={280}><BarChart data={taskStatus}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </Card>

      <Card title="Pending QA" action={<button type="button" onClick={() => navigate("/app/qa")} className="text-xs font-semibold text-brand hover:text-teal-800">Open queue</button>}>
        <DataTable rows={data?.tables?.pendingQueue ?? []} onRowClick={() => navigate("/app/qa")} rowActionLabel="Open QA queue" columns={[{ header: "Task", cell: (row) => row.taskCode }, { header: "Project", cell: (row) => row.project?.name ?? "-" }, { header: "Script", cell: (row) => row.script?.title ?? "-" }, { header: "Status", cell: (row) => <Badge tone="warning">{row.status}</Badge> }]} />
      </Card>
    </div>

    <Card title="Active Dual Sessions" action={<button type="button" onClick={() => navigate("/app/dual-sessions")} className="text-xs font-semibold text-brand hover:text-teal-800">View sessions</button>}>
      <DataTable rows={data?.tables?.activeDualSessions ?? []} onRowClick={() => navigate("/app/dual-sessions")} rowActionLabel="Open dual sessions" columns={[{ header: "Session", cell: (row) => row.sessionCode }, { header: "Status", cell: (row) => <Badge tone="accent">{row.status}</Badge> }, { header: "Participants", cell: (row) => row.participants?.length ?? 0 }, { header: "Duration", cell: (row) => (row.durationSeconds ? `${row.durationSeconds}s` : "-") }]} />
    </Card>
  </div>;
}