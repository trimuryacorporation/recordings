import { Pencil, RefreshCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
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
  const [editingProject, setEditingProject] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!form.clientId && clients.data[0]?.id) setForm((current) => ({ ...current, clientId: clients.data[0].id }));
  }, [clients.data, form.clientId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, targetRecordings: Number(form.targetRecordings), vendorId: form.vendorId || undefined };
      await api(editingProject ? `/api/projects/${editingProject.id}` : "/api/projects", {
        method: editingProject ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setForm((current) => ({ ...emptyForm, clientId: current.clientId, vendorId: current.vendorId }));
      await projects.reload();
      setEditingProject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  }

  function editProject(project) {
    setEditingProject(project);
    setForm({
      name: project.name ?? "", code: project.code ?? "", clientId: project.client?.id ?? project.clientId ?? "",
      recordingType: project.recordingType ?? "SINGLE", scriptLanguage: project.scriptLanguage ?? "Hindi",
      targetRecordings: project.targetRecordings ?? 100, vendorId: project.vendor?.id ?? project.vendorId ?? "", status: project.status ?? "ACTIVE"
    });
    setError("");
  }

  function cancelEdit() {
    setEditingProject(null);
    setForm((current) => ({ ...emptyForm, clientId: current.clientId }));
  }

  async function confirmDelete() {
    const project = pendingDelete;
    if (!project) return;
    setDeleting(true);
    setError("");
    try {
      await api(project.type === "all" ? "/api/projects" : `/api/projects/${project.id}`, { method: "DELETE" });
      if (editingProject && (project.type === "all" || editingProject.id === project.id)) cancelEdit();
      setPendingDelete(null);
      await projects.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete project.");
    } finally {
      setDeleting(false);
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

      <Card title={editingProject ? "Edit Project" : "Create Project"}>
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
            <option value="">{vendors.loading ? "Loading vendors..." : vendors.data.length ? "Select vendor" : "No vendors available"}</option>
            {vendors.data.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.companyName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : editingProject ? "Save Changes" : "Create"}
          </Button>
        </form>
      </Card>

      <Card title="Project Overview" action={<Button type="button" variant="danger" className="h-8 !px-3" disabled={!projects.data.length || deleting} onClick={() => setPendingDelete({ type: "all", count: projects.data.length })}><Trash2 size={14} />Delete All</Button>}>
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
            { header: "Status", cell: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge> },
            { header: "Action", sortable: false, cell: (row) => <div className="flex items-center gap-2"><Button type="button" variant="secondary" className="h-8 !px-2.5" onClick={() => editProject(row)}><Pencil size={14} />Edit</Button><Button type="button" variant="ghost" className="h-8 !px-2.5 text-danger hover:bg-red-50" disabled={deleting} onClick={() => setPendingDelete(row)}><Trash2 size={14} />Delete</Button></div> }
          ]}
        />
      </Card>
      {pendingDelete && <ConfirmDeleteModal
        title={pendingDelete.type === "all" ? "Delete All Projects" : "Delete Project"}
        message={pendingDelete.type === "all" ? `Are you sure you want to delete all ${pendingDelete.count} projects and their related scripts, tasks, recordings, and audio files?` : <>Are you sure you want to delete <strong className="text-ink">{pendingDelete.name}</strong> and its related data?</>}
        confirmLabel={pendingDelete.type === "all" ? "Yes, Delete All" : "Yes, Delete"}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />}
    </div>
  );
}
