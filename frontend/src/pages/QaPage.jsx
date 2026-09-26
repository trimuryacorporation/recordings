import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select, Textarea } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

export function QaPage({ filter }) {
  const path = filter ? "/api/recordings" : "/api/qa/queue";
  const resource = useApiResource(path);
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState("APPROVE");
  const [score, setScore] = useState(92);
  const [rejectionReason, setRejectionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => {
    return filter ? resource.data.filter((row) => row.qaStatus === filter) : resource.data;
  }, [filter, resource.data]);

  async function submit(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/qa/reviews", {
        method: "POST",
        body: JSON.stringify({
          recordingId: selected.id,
          decision,
          score: Number(score),
          rejectionReason,
          comments: "Reviewed from QA workspace."
        })
      });
      setSelected(null);
      await resource.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit QA decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Quality Control" title={filter ? `${filter} Recordings` : "QA Workspace"} />
      {(resource.error || error) && <ErrorState message={resource.error || error} onRetry={resource.reload} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card title="QA Queue">
          <DataTable
            loading={resource.loading}
            rows={rows}
            columns={[
              { header: "Recording", cell: (row) => row.recordingCode ?? row.taskCode },
              { header: "Project", cell: (row) => row.project?.name ?? row.task?.project?.name ?? "-" },
              { header: "Type", cell: (row) => <Badge tone="accent">{row.recordingType}</Badge> },
              { header: "QA Status", cell: (row) => <Badge tone="warning">{row.qaStatus ?? row.status}</Badge> },
              {
                header: "Action",
                cell: (row) => (
                  <button className="font-semibold text-brand" onClick={() => setSelected(row)}>
                    Review
                  </button>
                )
              }
            ]}
          />
        </Card>

        <Card title="Review Detail">
          {selected ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="aspect-video rounded-md bg-slate-900" />
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{selected.recordingCode ?? selected.taskCode}</p>
                <p className="mt-1 text-muted">
                  Inspect participant tracks, media metadata, script compliance, noise, clipping, pronunciation, and completeness.
                </p>
              </div>
              <Select value={decision} onChange={(event) => setDecision(event.target.value)}>
                <option>APPROVE</option>
                <option>REJECT</option>
                <option>RE_RECORD</option>
              </Select>
              <Input type="number" min="0" max="100" value={score} onChange={(event) => setScore(Number(event.target.value))} />
              <Textarea
                placeholder="Rejection reason is mandatory when rejected"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Submitting..." : "Submit QA Decision"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted">Select a recording to inspect participant tracks, media metadata, script compliance, and scoring.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
