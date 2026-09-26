import { Radio, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, PageHeader } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";

function elapsed(startedAt, now) {
  if (!startedAt) return "00:00:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return new Date(seconds * 1000).toISOString().substring(11, 19);
}

export function LiveRecordingsPage() {
  const sessions = useApiResource("/api/recording-sessions/live?recordingType=SINGLE");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = window.setInterval(sessions.reload, 5000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, [sessions.reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Operations"
        title="Single Recording Status"
        action={<Button type="button" variant="secondary" onClick={sessions.reload}><RefreshCw size={16} />Refresh</Button>}
      />
      {sessions.error && <ErrorState message={sessions.error} onRetry={sessions.reload} />}
      <div className="flex items-center gap-3 border-y border-line bg-white px-1 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-danger"><Radio size={20} /></span>
        <div><p className="text-2xl font-bold">{sessions.data.length}</p><p className="text-sm text-muted">Live single recordings</p></div>
      </div>
      <Card title="Currently recording">
        <DataTable
          loading={sessions.loading}
          rows={sessions.data}
          empty="No single recording is live right now"
          columns={[
            { header: "User", cell: (row) => <div><p className="font-semibold">{row.participantAId?.name ?? "-"}</p><p className="text-xs text-muted">{row.participantAId?.email ?? ""}</p></div> },
            { header: "Task", cell: (row) => row.taskId?.taskCode ?? "-" },
            { header: "Project", cell: (row) => row.projectId?.name ?? "-" },
            { header: "Script", cell: (row) => row.scriptId?.title ?? "Non-scripted" },
            { header: "Duration", cell: (row) => <span className="font-semibold tabular-nums">{elapsed(row.startedAt, now)}</span> },
            { header: "Status", cell: () => <Badge tone="danger">LIVE</Badge> }
          ]}
        />
      </Card>
    </div>
  );
}
