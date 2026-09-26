import { ChevronLeft, ChevronRight, ExternalLink, Pencil, RefreshCcw, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api, currentUser } from "../services/api";

const emptyForm = {
  projectId: "",
  scriptId: "",
  recordingType: "SINGLE",
  vendorId: "",
  participantAId: "",
  participantBId: ""
};

export function TasksPage() {
  const isVendor = currentUser()?.role === "VENDOR";
  const [filters, setFilters] = useState({ search: "", projectId: "", vendorId: "", recordingType: "", status: "" });
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(filters.search);
  const tasksPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.vendorId) params.set("vendorId", filters.vendorId);
    if (filters.recordingType) params.set("recordingType", filters.recordingType);
    if (filters.status) params.set("status", filters.status);
    return `/api/tasks/search?${params.toString()}`;
  }, [deferredSearch, filters.projectId, filters.vendorId, filters.recordingType, filters.status, page]);
  const tasks = useApiResource(tasksPath, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 });
  const projects = useApiResource("/api/projects?pageSize=100");
  const scripts = useApiResource("/api/scripts?pageSize=100");
  const users = useApiResource("/api/users?pageSize=100");
  const vendors = useApiResource("/api/vendors");
  const [form, setForm] = useState(emptyForm);
  const [assignmentMode, setAssignmentMode] = useState("SINGLE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState({ vendorId: "", participantAId: "", participantBId: "" });
  const [assigningSelection, setAssigningSelection] = useState(false);
  const [selectionResult, setSelectionResult] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [editAssignment, setEditAssignment] = useState({ vendorId: "", participantAId: "" });
  const [updatingTask, setUpdatingTask] = useState(false);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
    setSelectedIds([]);
  }

  function toggleTask(taskId) {
    setSelectedIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  }

  async function assignSelection(event) {
    event.preventDefault();
    setAssigningSelection(true);
    setError("");
    setSelectionResult("");
    try {
      const response = await api("/api/tasks/assign-selection", {
        method: "PATCH",
        body: JSON.stringify({ taskIds: selectedIds, vendorId: selectedAssignment.vendorId, participantAId: selectedAssignment.participantAId })
      });
      setSelectionResult(`${response.assigned} selected tasks assigned${response.skipped ? `, ${response.skipped} skipped` : ""}.`);
      setSelectedIds([]);
      setSelectedAssignment({ vendorId: "", participantAId: "", participantBId: "" });
      await tasks.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign selected tasks.");
    } finally {
      setAssigningSelection(false);
    }
  }

  function startEditTask(task) {
    setEditingTask(task);
    setSelectionResult("");
    setError("");
    setEditAssignment({
      vendorId: task.vendor?.id ?? task.vendorId ?? "",
      participantAId: task.participantA?.id ?? task.participantAId ?? ""
    });
    setSelectedIds((current) => current.filter((id) => id !== task.id));
  }

  function cancelTaskEdit() {
    setEditingTask(null);
    setEditAssignment({ vendorId: "", participantAId: "" });
  }

  async function updateTask(event) {
    event.preventDefault();
    if (!editingTask) return;
    setUpdatingTask(true);
    setError("");
    setSelectionResult("");
    try {
      await api(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify(editAssignment)
      });
      setSelectionResult(`Task updated: ${editingTask.taskCode}`);
      cancelTaskEdit();
      await tasks.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update task.");
    } finally {
      setUpdatingTask(false);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete task "${task.taskCode}"?`)) return;
    setError("");
    setSelectionResult("");
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (editingTask?.id === task.id) cancelTaskEdit();
      setSelectedIds((current) => current.filter((id) => id !== task.id));
      await tasks.reload();
      setSelectionResult(`Task deleted: ${task.taskCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete task.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setResult("");
    try {
      const response = await api(assignmentMode === "BULK" ? "/api/tasks/bulk" : "/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          scriptId: assignmentMode === "SINGLE" ? form.scriptId : undefined,
          vendorId: form.vendorId || undefined,
          participantBId: undefined,
        })
      });
      setResult(assignmentMode === "BULK" ? `${response.created} tasks assigned, ${response.skipped} duplicates skipped.` : `Task assigned: ${response.taskCode}`);
      setForm(emptyForm);
      await tasks.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task.");
    } finally {
      setSaving(false);
    }
  }

  const pageError = tasks.error || projects.error || scripts.error || users.error || vendors.error || error;
  const matchingProjects = projects.data.filter((project) => project.recordingType === form.recordingType);
  const matchingScripts = scripts.data.filter((script) => script.recordingType === form.recordingType && (!form.projectId || script.project?.id === form.projectId || script.projectId?.id === form.projectId));
  const recorders = users.data.filter((user) => user.role === "RECORDER" && user.status === "ACTIVE");
  const assignableTasks = tasks.data.items.filter((task) => ["UNASSIGNED", "ASSIGNED"].includes(task.status));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Assignments"
        title="Recording Tasks"
        action={
          <Button type="button" variant="secondary" onClick={tasks.reload}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {pageError && <ErrorState message={pageError} onRetry={tasks.reload} />}

      <Card title="Create Recording Task">
        <div className="mb-4 inline-flex rounded-md border border-line bg-slate-50 p-1">
          <button className={`h-9 rounded px-4 text-sm font-semibold ${assignmentMode === "SINGLE" ? "bg-white text-brand shadow-sm" : "text-muted"}`} type="button" onClick={() => setAssignmentMode("SINGLE")}>Single assignment</button>
          <button className={`h-9 rounded px-4 text-sm font-semibold ${assignmentMode === "BULK" ? "bg-white text-brand shadow-sm" : "text-muted"}`} type="button" onClick={() => setAssignmentMode("BULK")}>Bulk assignment</button>
        </div>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
          <Select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value, scriptId: "" })} required>
            <option value="">Project</option>
            {matchingProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          {assignmentMode === "SINGLE" && <Select value={form.scriptId} onChange={(event) => setForm({ ...form, scriptId: event.target.value })} required disabled={!form.projectId}>
            <option value="">{form.projectId ? `Select ${form.recordingType.toLowerCase()} script` : "Select project first"}</option>
            {matchingScripts.map((script) => (
              <option key={script.id} value={script.id}>
                {script.scriptCode} - {script.title}
              </option>
            ))}
          </Select>}
          <Select value={form.recordingType} onChange={(event) => setForm({ ...form, recordingType: event.target.value, projectId: "", scriptId: "", participantBId: "" })}>
            <option>SINGLE</option>
            <option>DUAL</option>
          </Select>
          <Select value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
            <option value="">Vendor</option>
            {vendors.data.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.companyName}
              </option>
            ))}
          </Select>
          <Select value={form.participantAId} onChange={(event) => setForm({ ...form, participantAId: event.target.value })} required>
            <option value="">Assign to Participant A</option>
            {recorders.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={saving}>
            {saving ? "Assigning..." : assignmentMode === "BULK" ? "Assign Project Scripts" : "Assign Script"}
          </Button>
          {result && <p className="self-center text-sm font-semibold text-success md:col-span-2">{result}</p>}
        </form>
      </Card>

      <Card title="Tasks" action={<span className="text-xs font-medium text-muted">{tasks.data.total} results</span>}>
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search task, script, project, vendor, user"
              aria-label="Search tasks"
            />
          </div>
          <Select value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
          <Select value={filters.vendorId} onChange={(event) => updateFilter("vendorId", event.target.value)} aria-label="Filter by vendor">
            <option value="">All vendors</option>
            {vendors.data.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}
          </Select>
          <Select value={filters.recordingType} onChange={(event) => updateFilter("recordingType", event.target.value)} aria-label="Filter by recording type">
            <option value="">All types</option>
            <option value="SINGLE">Single</option>
            <option value="DUAL">Dual</option>
          </Select>
          <Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="RECORDING">Recording</option>
            <option value="QA_PENDING">QA pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        {selectionResult && <p className="mb-4 text-sm font-semibold text-success">{selectionResult}</p>}
        {editingTask && (
          <form onSubmit={updateTask} className="mb-4 grid gap-3 rounded-md border border-brand/30 bg-teal-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="text-sm">
              <p className="font-semibold">{editingTask.taskCode}</p>
              <p className="text-xs text-muted">{editingTask.script?.title ?? "-"} | {editingTask.project?.name ?? "-"}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={editAssignment.vendorId} onChange={(event) => setEditAssignment({ ...editAssignment, vendorId: event.target.value })} required>
                <option value="">Select vendor</option>
                {vendors.data.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}
              </Select>
              <Select value={editAssignment.participantAId} onChange={(event) => setEditAssignment({ ...editAssignment, participantAId: event.target.value })} required>
                <option value="">Assign to Participant A</option>
                {recorders.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={updatingTask}>{updatingTask ? "Saving..." : "Save"}</Button>
              <Button type="button" variant="secondary" onClick={cancelTaskEdit}><X className="h-4 w-4" />Cancel</Button>
            </div>
          </form>
        )}
        {!isVendor && selectedIds.length > 0 && (
          <form onSubmit={assignSelection} className="mb-4 grid gap-3 rounded-md border border-brand/30 bg-teal-50 p-3 md:grid-cols-3">
            <Select value={selectedAssignment.vendorId} onChange={(event) => setSelectedAssignment({ ...selectedAssignment, vendorId: event.target.value })} required>
              <option value="">Select vendor</option>
              {vendors.data.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}
            </Select>
            <Select value={selectedAssignment.participantAId} onChange={(event) => setSelectedAssignment({ ...selectedAssignment, participantAId: event.target.value })} required>
              <option value="">Assign to Participant A</option>
              {recorders.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
            <Button type="submit" disabled={assigningSelection}>
              {assigningSelection ? "Assigning..." : `Assign ${selectedIds.length} selected`}
            </Button>
          </form>
        )}
        <DataTable
          loading={tasks.loading}
          rows={tasks.data.items}
          tableClassName="min-w-[1240px]"
          columns={[
            ...(!isVendor ? [{
              id: "select",
              sortable: false,
              header: (
                <input
                  type="checkbox"
                  aria-label="Select all assignable tasks"
                  checked={assignableTasks.length > 0 && assignableTasks.every((task) => selectedIds.includes(task.id))}
                  onChange={(event) => setSelectedIds(event.target.checked ? assignableTasks.map((task) => task.id) : [])}
                  className="h-4 w-4 accent-teal-700"
                />
              ),
              cell: (row) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.taskCode}`}
                  checked={selectedIds.includes(row.id)}
                  disabled={!['UNASSIGNED', 'ASSIGNED'].includes(row.status)}
                  onChange={() => toggleTask(row.id)}
                  className="h-4 w-4 accent-teal-700"
                />
              )
            }] : []),
            {
              header: "Task",
              cell: (row) => (
                <div>
                  <p className="font-semibold">{row.taskCode}</p>
                  <p className="text-xs text-muted">{row.project?.name ?? "-"}</p>
                </div>
              )
            },
            { header: "Script", cell: (row) => row.script?.title ?? "-" },
            { header: "Type", cell: (row) => <Badge tone="accent">{row.recordingType}</Badge> },
            { header: "Vendor", cell: (row) => row.vendor?.companyName ?? "-" },
            { header: "Participants", cell: (row) => `${row.participantA?.name ?? "-"}${row.participantB ? ` + ${row.participantB.name}` : ""}` },
            {
              header: "Status",
              cell: (row) => (
                <Badge tone={row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>{row.status}</Badge>
              )
            },
            {
              header: "Action",
              sortable: false,
              headerClassName: "w-[250px]",
              cellClassName: "w-[250px]",
              cell: (row) => (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Link className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-semibold text-brand transition hover:bg-teal-50" to={row.recordingType === "DUAL" ? "/app/dual-sessions" : `/record/${row.id}`}>
                    <ExternalLink size={14} /> Open
                  </Link>
                  <Button type="button" variant="secondary" className="h-8 !px-3" disabled={!["UNASSIGNED", "ASSIGNED"].includes(row.status)} onClick={() => startEditTask(row)}>
                    <Pencil size={14} /> Edit
                  </Button>
                  {!isVendor && (
                    <Button type="button" variant="ghost" className="h-8 !px-3 text-danger hover:bg-red-50" disabled={!["UNASSIGNED", "ASSIGNED"].includes(row.status)} onClick={() => deleteTask(row)}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  )}
                </div>
              )
            }
          ]}
        />
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Page {tasks.data.page} of {tasks.data.totalPages} | 100 per page</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1 || tasks.loading} onClick={() => { setSelectedIds([]); setPage((current) => Math.max(1, current - 1)); }}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button type="button" variant="secondary" disabled={page >= tasks.data.totalPages || tasks.loading} onClick={() => { setSelectedIds([]); setPage((current) => current + 1); }}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
