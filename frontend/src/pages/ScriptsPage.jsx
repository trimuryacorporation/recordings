import { ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "../components/DataTable";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select, Textarea } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

const emptyForm = {
  projectId: "",
  title: "",
  category: "Read-aloud",
  language: "Hindi",
  currentText: "",
  expectedDuration: 30,
  recordingType: "SINGLE"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  return rows;
}

function scriptRowsFromCsv(text, recordingType) {
  const rows = parseCsv(text);
  const headers = (rows[0] ?? []).map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase());
  const required = ["recording_type", "title", "script_text", "expected_duration"];
  if (required.some((header, index) => headers[index] !== header)) throw new Error("Please upload the downloaded CSV format without changing its column names.");
  return rows.slice(1).filter((row) => row.some((value) => value.trim())).map((row, index) => {
    const type = row[0]?.trim().toUpperCase();
    const scriptText = row[2]?.trim();
    const duration = Number(row[3]);
    if (type !== recordingType) throw new Error(`Row ${index + 2} must use recording type ${recordingType}.`);
    if (!scriptText) throw new Error(`Row ${index + 2} is missing script_text.`);
    if (!Number.isInteger(duration) || duration <= 0) throw new Error(`Row ${index + 2} has an invalid expected_duration.`);
    return { title: row[1]?.trim() || undefined, text: scriptText, expectedDuration: duration };
  });
}

function LanguageSelect({ catalog, value, onChange }) {
  return (
    <Select value={value} onChange={onChange} required>
      <option value="">Select language</option>
      <optgroup label="Indian Languages">
        {(catalog.indian ?? []).map((language) => <option key={`in-${language.code}`} value={language.name}>{language.name}</option>)}
      </optgroup>
      <optgroup label="International Languages">
        {(catalog.international ?? []).map((language) => <option key={`world-${language.code}-${language.name}`} value={language.name}>{language.name}</option>)}
      </optgroup>
    </Select>
  );
}

export function ScriptsPage() {
  const [filters, setFilters] = useState({ search: "", projectId: "", language: "", recordingType: "" });
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(filters.search);
  const scriptsPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.language) params.set("language", filters.language);
    if (filters.recordingType) params.set("recordingType", filters.recordingType);
    return `/api/scripts/search?${params}`;
  }, [deferredSearch, filters.projectId, filters.language, filters.recordingType, page]);
  const scripts = useApiResource(scriptsPath, { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const projects = useApiResource("/api/projects?pageSize=100");
  const languages = useApiResource("/api/languages", { indian: [], international: [] });
  const [form, setForm] = useState(emptyForm);
  const [editingScriptId, setEditingScriptId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createResult, setCreateResult] = useState("");
  const [uploadForm, setUploadForm] = useState({ projectId: "", recordingType: "SINGLE", language: "Hindi" });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    const availableTypes = [...new Set(projects.data.map((project) => project.recordingType).filter(Boolean))];
    if (!availableTypes.length) return;
    setForm((current) => availableTypes.includes(current.recordingType) ? current : { ...current, recordingType: availableTypes[0], projectId: "" });
    setUploadForm((current) => availableTypes.includes(current.recordingType) ? current : { ...current, recordingType: availableTypes[0], projectId: "" });
  }, [projects.data]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setCreateResult("");
    try {
      const payload = { ...form, expectedDuration: Number(form.expectedDuration) };
      const saved = await api(editingScriptId ? `/api/scripts/${editingScriptId}` : "/api/scripts", {
        method: editingScriptId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setCreateResult(editingScriptId ? `Script updated: ${saved.scriptCode}` : `Script created: ${saved.scriptCode}`);
      setEditingScriptId("");
      setForm(emptyForm);
      await scripts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save script.");
    } finally {
      setSaving(false);
    }
  }

  function editScript(row) {
    setEditingScriptId(row.id);
    setCreateResult("");
    setError("");
    setForm({
      projectId: row.project?.id ?? row.projectId?.id ?? row.projectId ?? "",
      title: row.title ?? "",
      category: row.category ?? "Read-aloud",
      language: row.language ?? "Hindi",
      currentText: row.currentText ?? "",
      expectedDuration: row.expectedDuration ?? 30,
      recordingType: row.recordingType ?? "SINGLE"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingScriptId("");
    setForm(emptyForm);
    setCreateResult("");
  }

  function requestDeleteScript(row) {
    setPendingDelete({ type: "single", row });
  }

  function requestDeleteAll() {
    if (scripts.data.total) setPendingDelete({ type: "all", count: scripts.data.total });
  }

  async function confirmDelete() {
    const pending = pendingDelete;
    if (!pending) return;
    setDeleting(true);
    setError("");
    setCreateResult("");
    try {
      if (pending.type === "single") {
        await api(`/api/scripts/${pending.row.id}`, { method: "DELETE" });
        if (editingScriptId === pending.row.id) cancelEdit();
        setCreateResult(`Script deleted: ${pending.row.scriptCode}`);
      } else {
        const params = new URLSearchParams();
        if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
        if (filters.projectId) params.set("projectId", filters.projectId);
        if (filters.language) params.set("language", filters.language);
        if (filters.recordingType) params.set("recordingType", filters.recordingType);
        const result = await api(`/api/scripts?${params.toString()}`, { method: "DELETE" });
        if (editingScriptId) cancelEdit();
        setCreateResult(`${result.deleted} scripts deleted.`);
      }
      setPendingDelete(null);
      await scripts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete script.");
    } finally {
      setDeleting(false);
    }
  }

  async function uploadScripts(event) {
    event.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError("");
    setUploadResult("");
    try {
      const text = await uploadFile.text();
      const parsedScripts = scriptRowsFromCsv(text, uploadForm.recordingType);
      if (!parsedScripts.length) throw new Error("The selected file does not contain any scripts.");
      const result = await api("/api/scripts/bulk", {
        method: "POST",
        body: JSON.stringify({ ...uploadForm, sourceName: uploadFile.name, scripts: parsedScripts })
      });
      setUploadResult(`${result.count} ${uploadForm.recordingType.toLowerCase()} scripts uploaded.`);
      setUploadFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await scripts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload scripts.");
    } finally {
      setUploading(false);
    }
  }

  function downloadFormat() {
    const duration = uploadForm.recordingType === "DUAL" ? 90 : 30;
    const csv = `recording_type,title,script_text,expected_duration\r\n${uploadForm.recordingType},,,${duration}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${uploadForm.recordingType.toLowerCase()}-script-upload-format.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Versioned Content" title="Scripts" />
      {(scripts.error || projects.error || languages.error || error) && <ErrorState message={scripts.error || projects.error || languages.error || error} onRetry={() => { scripts.reload(); projects.reload(); languages.reload(); }} />}

      <Card title="Upload Scripts">
        <form onSubmit={uploadScripts} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Project<Select className="mt-1" required value={uploadForm.projectId} onChange={(event) => setUploadForm({ ...uploadForm, projectId: event.target.value })}><option value="">Select project</option>{projects.data.filter((project) => project.recordingType === uploadForm.recordingType).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></label>
          <label className="text-sm font-medium">Recording type<Select className="mt-1" value={uploadForm.recordingType} onChange={(event) => setUploadForm({ ...uploadForm, recordingType: event.target.value, projectId: "" })}><option value="SINGLE">Single</option><option value="DUAL">Dual</option></Select></label>
          <label className="text-sm font-medium">Language<div className="mt-1"><LanguageSelect catalog={languages.data} value={uploadForm.language} onChange={(event) => setUploadForm({ ...uploadForm, language: event.target.value })} /></div></label>
          <label className="text-sm font-medium">Script file<Input ref={fileInput} className="mt-1 py-2" type="file" accept=".csv,text/csv" required onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-4">
            <Button type="button" variant="secondary" onClick={downloadFormat}><Download size={16} />Download {uploadForm.recordingType === "DUAL" ? "Dual" : "Single"} Format</Button>
            <Button type="submit" disabled={uploading || !uploadFile}><Upload size={16} />{uploading ? "Uploading..." : `Upload ${uploadForm.recordingType === "DUAL" ? "Dual" : "Single"} Scripts`}</Button>
            {uploadResult && <p className="text-sm font-semibold text-success">{uploadResult}</p>}
          </div>
        </form>
      </Card>

      <Card title={editingScriptId ? "Edit Script" : "Create Script"}>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
          <Select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} required>
            <option value="">Project</option>
            {projects.data.filter((project) => project.recordingType === form.recordingType).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <Select value={form.recordingType} onChange={(event) => setForm({ ...form, recordingType: event.target.value, projectId: "" })}>
            <option>SINGLE</option>
            <option>DUAL</option>
          </Select>
          <LanguageSelect catalog={languages.data} value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} />
          <Input type="number" value={form.expectedDuration} onChange={(event) => setForm({ ...form, expectedDuration: Number(event.target.value) })} />
          <Textarea
            className="md:col-span-3"
            placeholder="Script text"
            value={form.currentText}
            onChange={(event) => setForm({ ...form, currentText: event.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingScriptId ? "Update Script" : "Create Versioned Script"}
            </Button>
            {editingScriptId && <Button type="button" variant="secondary" onClick={cancelEdit}><X size={16} />Cancel</Button>}
          </div>
          {createResult && <p className="self-center text-sm font-semibold text-success">{createResult}</p>}
        </form>
      </Card>

      <Card title="Script Library" action={<div className="flex items-center gap-3"><span className="text-xs font-medium text-muted">{scripts.data.total} results</span><Button type="button" variant="danger" className="h-8 !px-3" disabled={!scripts.data.total || deleting} onClick={requestDeleteAll}><Trash2 size={14} />Delete All</Button></div>}>
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative md:col-span-2 xl:col-span-1"><span className="sr-only">Search scripts</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Search scripts" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} /></label>
          <Select value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}><option value="">All projects</option>{projects.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
          <Select value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}><option value="">All languages</option><optgroup label="Indian Languages">{languages.data.indian.map((language) => <option key={`filter-in-${language.code}`} value={language.name}>{language.name}</option>)}</optgroup><optgroup label="International Languages">{languages.data.international.map((language) => <option key={`filter-world-${language.code}-${language.name}`} value={language.name}>{language.name}</option>)}</optgroup></Select>
          <Select value={filters.recordingType} onChange={(event) => updateFilter("recordingType", event.target.value)}><option value="">All types</option><option value="SINGLE">Single</option><option value="DUAL">Dual</option></Select>
        </div>
        <DataTable
          loading={scripts.loading}
          rows={scripts.data.items}
          tableClassName="min-w-[1040px]"
          columns={[
            {
              header: "Script",
              cell: (row) => (
                <div>
                  <p className="font-semibold">{row.title}</p>
                  <p className="text-xs text-muted">{row.scriptCode}</p>
                </div>
              )
            },
            { header: "Project", cell: (row) => row.project?.name ?? "-" },
            { header: "Language", cell: (row) => row.language },
            { header: "Type", cell: (row) => <Badge tone="accent">{row.recordingType}</Badge> },
            { header: "Version", cell: (row) => `v${row.version}` },
            { header: "Duration", cell: (row) => `${row.expectedDuration}s` },
            {
              header: "Action",
              sortable: false,
              headerClassName: "w-[190px]",
              cellClassName: "w-[190px]",
              cell: (row) => (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Button type="button" variant="secondary" className="h-8 !px-3" onClick={() => editScript(row)}>
                    <Pencil size={14} /> Edit
                  </Button>
                  <Button type="button" variant="ghost" className="h-8 !px-3 text-danger hover:bg-red-50" onClick={() => requestDeleteScript(row)}>
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              )
            }
          ]}
        />
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Page {scripts.data.page} of {scripts.data.totalPages} | 10 per page</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1 || scripts.loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} />Previous</Button>
            <Button type="button" variant="secondary" disabled={page >= scripts.data.totalPages || scripts.loading} onClick={() => setPage((value) => Math.min(scripts.data.totalPages, value + 1))}>Next<ChevronRight size={16} /></Button>
          </div>
        </div>
      </Card>
      {pendingDelete && <ConfirmDeleteModal
        title={pendingDelete.type === "all" ? "Delete All Scripts" : "Delete Script"}
        message={pendingDelete.type === "all"
          ? `Are you sure you want to delete all ${pendingDelete.count} scripts matching the current filters? Their tasks, recordings, version history, and audio files will also be permanently deleted.`
          : <>Are you sure you want to delete <strong className="text-ink">{pendingDelete.row.title}</strong>? Its task records and version history will also be permanently deleted.</>}
        confirmLabel={pendingDelete.type === "all" ? "Yes, Delete All" : "Yes, Delete"}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />}
    </div>
  );
}
