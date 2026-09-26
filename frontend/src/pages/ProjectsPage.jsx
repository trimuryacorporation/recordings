import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

const emptyForm = {
  name: "",
  code: "",
  clientId: "",
  recordingType: "SINGLE",
  scriptLanguage: "Hindi",
  targetRecordings: 100,
  vendorId: "",
  status: "ACTIVE"
};

export function ProjectsPage() {
  const projects = useApiResource("/api/projects");
  const clients = useApiResource("/api/clients");
  const vendors = useApiResource("/api/vendors");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!form.clientId && clients.data[0]?.id) setForm((current) => ({ ...current, clientId: clients.data[0].id }));
  }, [clients.data, form.clientId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          targetRecordings: Number(form.targetRecordings),
          vendorId: form.vendorId || undefined
        })
      });
      setForm((current) => ({ ...emptyForm, clientId: current.clientId, vendorId: current.vendorId }));
      await projects.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dynamic Workspace"
        title="Projects"
        action={
          <Button type="button" variant="secondary" onClick={projects.reload}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {(projects.error || clients.error || vendors.error || error) && (
        <ErrorState message={projects.error || clients.error || vendors.error || error} onRetry={projects.reload} />
      )}

      <Card title="Create Project">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Project Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <Input placeholder="Project Code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
          <Select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} required>
            <option value="">Client</option>
            {clients.data.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
          <Select value={form.recordingType} onChange={(event) => setForm({ ...form, recordingType: event.target.value })}>
            <option>SINGLE</option>
            <option>DUAL</option>
          </Select>
          <Input placeholder="Language" value={form.scriptLanguage} onChange={(event) => setForm({ ...form, scriptLanguage: event.target.value })} />
          <Input
            type="number"
            placeholder="Target"
            value={form.targetRecordings}
            onChange={(event) => setForm({ ...form, targetRecordings: Number(event.target.value) })}
          />
          <Select value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
            <option value="">Vendor</option>
            {vendors.data.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.companyName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </Button>
        </form>
      </Card>

      <Card title="Project Overview">
        <DataTable
          loading={projects.loading}
          rows={projects.data}
          columns={[
            {
              header: "Project",
              cell: (row) => (
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-muted">{row.code}</p>
                </div>
              )
            },
            { header: "Client", cell: (row) => row.client?.name ?? "-" },
            { header: "Type", cell: (row) => <Badge tone="accent">{row.recordingType}</Badge> },
            { header: "Language", cell: (row) => row.scriptLanguage },
            { header: "Progress", cell: (row) => `${row._count?.tasks ?? 0}/${row.targetRecordings}` },
            { header: "Status", cell: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge> }
          ]}
        />
      </Card>
    </div>
  );
}
