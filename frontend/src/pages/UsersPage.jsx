import { Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api, currentUser } from "../services/api";

const roles = ["RECORDER", "QA", "VENDOR", "ADMIN", "SUPER_ADMIN"];
const platforms = ["SINGLE_RECORDING", "DUAL_RECORDING", "SCRIPT_RECORDING"];
const emptyUser = { name: "", email: "", mobile: "", password: "", role: "RECORDER", platformType: "SINGLE_RECORDING", recordingMode: "SCRIPTED", languages: "", vendorId: "", status: "ACTIVE" };
const label = (value) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

function Modal({ title, children, busy, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-white shadow-xl ${wide ? "max-w-6xl" : "max-w-3xl"}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><h2 className="font-semibold text-ink">{title}</h2><button type="button" className="focus-ring rounded-md p-2 text-muted hover:bg-slate-100" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button></header>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}

function UserFields({ value, vendors, editing, fixedRole, vendorScoped, onChange }) {
  const field = (name) => (event) => onChange({ ...value, [name]: event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Input aria-label="Name" placeholder="Full name" value={value.name} onChange={field("name")} required />
      <Input aria-label="Email" type="email" placeholder="Email address" value={value.email} onChange={field("email")} required />
      <Input aria-label="Mobile" type="tel" placeholder="Mobile number" value={value.mobile} onChange={field("mobile")} minLength={8} maxLength={20} required />
      <Input aria-label="Password" type="password" minLength={8} placeholder={editing ? "New password (optional)" : "Password (minimum 8 characters)"} value={value.password} onChange={field("password")} required={!editing} />
      {vendorScoped && <Input aria-label="Role" value="Recorder" readOnly />}
      {!fixedRole && !vendorScoped && <Select aria-label="Role" value={value.role} onChange={field("role")}>{roles.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>}
      <Select aria-label="Platform" value={value.platformType} onChange={field("platformType")}>{platforms.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>
      <Select aria-label="Recording mode" value={value.recordingMode} onChange={field("recordingMode")}><option value="SCRIPTED">Scripted</option><option value="NON_SCRIPTED">Non-scripted</option></Select>
      <Input aria-label="Languages" placeholder="Languages: Hindi, English" value={value.languages} onChange={field("languages")} />
      {!vendorScoped && <Select aria-label="Vendor" value={value.vendorId} onChange={field("vendorId")}><option value="">No vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}</Select>}
      <Select aria-label="Status" value={value.status} onChange={field("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
    </div>
  );
}

function payload(row) {
  return { ...row, languages: typeof row.languages === "string" ? row.languages.split(",").map((item) => item.trim()).filter(Boolean) : row.languages };
}

export function UsersPage({ fixedRole = "", title = "Users", eyebrow = "Access Control" }) {
  const users = useApiResource(`/api/users?pageSize=100${fixedRole ? `&role=${fixedRole}` : ""}`);
  const vendors = useApiResource("/api/vendors");
  const canManage = ["SUPER_ADMIN", "ADMIN", "VENDOR"].includes(currentUser()?.role);
  const [search, setSearch] = useState("");
  const isVendor = currentUser()?.role === "VENDOR";
  const [filters, setFilters] = useState({ role: fixedRole, platformType: "", status: "", vendorId: "" });
  const [formMode, setFormMode] = useState("");
  const [form, setForm] = useState(emptyUser);
  const [bulkRows, setBulkRows] = useState([{ ...emptyUser }]);
  const [deleteUser, setDeleteUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.data.filter((user) => {
      const vendorId = user.vendorId?.id ?? user.vendorId;
      return (!query || [user.name, user.email, user.mobile, user.phone].some((value) => String(value ?? "").toLowerCase().includes(query)))
        && (!filters.role || user.role === filters.role)
        && (!filters.platformType || user.platformType === filters.platformType)
        && (!filters.status || user.status === filters.status)
        && (!filters.vendorId || vendorId === filters.vendorId);
    });
  }, [filters, search, users.data]);

  function openCreate() { setForm({ ...emptyUser, role: fixedRole || emptyUser.role }); setFormMode("create"); setError(""); }
  function openEdit(user) {
    setForm({ ...emptyUser, ...user, role: fixedRole || user.role, password: "", languages: user.languages?.join(", ") ?? "", vendorId: user.vendorId?.id ?? user.vendorId ?? "" });
    setFormMode("edit"); setError("");
  }

  async function saveUser(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(formMode === "edit" ? `/api/users/${form.id}` : "/api/users", { method: formMode === "edit" ? "PATCH" : "POST", body: JSON.stringify(payload({ ...form, role: fixedRole || form.role })) });
      setFormMode(""); await users.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save user."); }
    finally { setBusy(false); }
  }

  async function saveBulk(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/users/bulk", { method: "POST", body: JSON.stringify({ users: bulkRows.map((row) => payload({ ...row, role: fixedRole || row.role })) }) });
      setFormMode(""); setBulkRows([{ ...emptyUser }]); await users.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add users."); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    setBusy(true); setError("");
    try { await api(`/api/users/${deleteUser.id}`, { method: "DELETE" }); setDeleteUser(null); await users.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete user."); setDeleteUser(null); }
    finally { setBusy(false); }
  }

  const setFilter = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} action={canManage && <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setBulkRows([{ ...emptyUser, role: fixedRole || emptyUser.role }]); setFormMode("bulk"); setError(""); }}><Upload size={16} />Bulk Add</Button><Button type="button" onClick={openCreate}><Plus size={16} />Add {fixedRole ? "Member" : "User"}</Button></div>} />
      {(users.error || vendors.error || error) && <ErrorState message={users.error || vendors.error || error} onRetry={users.error ? users.reload : undefined} />}

      <div className={`grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm md:grid-cols-2 ${fixedRole ? "xl:grid-cols-[minmax(220px,1fr)_190px_150px_190px_auto]" : "xl:grid-cols-[minmax(220px,1fr)_160px_190px_150px_190px_auto]"}`}>
        <label className="relative"><span className="sr-only">Search users</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Search name, email or mobile" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {!fixedRole && <Select aria-label="Role filter" value={filters.role} onChange={setFilter("role")}><option value="">All roles</option>{roles.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>}
        <Select aria-label="Platform filter" value={filters.platformType} onChange={setFilter("platformType")}><option value="">All platforms</option>{platforms.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>
        <Select aria-label="Status filter" value={filters.status} onChange={setFilter("status")}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
        <Select aria-label="Vendor filter" value={filters.vendorId} onChange={setFilter("vendorId")}><option value="">All vendors</option>{vendors.data.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}</Select>
        <p className="self-center text-right text-sm text-muted">{filteredUsers.length} results</p>
      </div>

      <Card title="User Directory"><DataTable loading={users.loading} rows={filteredUsers} empty="No users match these filters" columns={[
        { header: "User", cell: (row) => <div><p className="font-semibold">{row.name}</p><p className="text-xs text-muted">{row.email}</p></div> },
        { header: "Mobile", cell: (row) => row.mobile ?? row.phone ?? "-" },
        ...(!fixedRole ? [{ header: "Role", cell: (row) => <Badge tone="accent">{label(row.role)}</Badge> }] : []),
        { header: "Platform", cell: (row) => label(row.platformType ?? "SCRIPT_RECORDING") },
        { header: "Vendor", cell: (row) => row.vendorId?.companyName ?? "-" },
        { header: "Languages", cell: (row) => row.languages?.join(", ") || "-" },
        { header: "Status", cell: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge> },
        { id: "actions", header: "Actions", sortable: false, cell: (row) => canManage && <div className="flex gap-2"><Button type="button" variant="secondary" className="h-8 !px-2.5" title="Edit user" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}><Pencil size={14} /></Button><Button type="button" variant="danger" className="h-8 !px-2.5" title="Delete user" aria-label={`Delete ${row.name}`} onClick={() => { setDeleteUser(row); setError(""); }}><Trash2 size={14} /></Button></div> }
      ]} /></Card>

      {(formMode === "create" || formMode === "edit") && <Modal title={formMode === "edit" ? `Edit ${fixedRole ? "QA Member" : "User"}` : `Add ${fixedRole ? "QA Member" : "User"}`} busy={busy} onClose={() => setFormMode("")}><form onSubmit={saveUser} className="space-y-4"><UserFields value={form} vendors={vendors.data} editing={formMode === "edit"} fixedRole={fixedRole} vendorScoped={isVendor} onChange={setForm} /><div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={() => setFormMode("")}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : formMode === "edit" ? "Save Changes" : `Add ${fixedRole ? "Member" : "User"}`}</Button></div></form></Modal>}

      {formMode === "bulk" && <Modal title={fixedRole ? "Bulk Add Quality Team" : "Bulk Add Users"} busy={busy} wide onClose={() => setFormMode("")}><form onSubmit={saveBulk} className="space-y-4"><p className="text-sm text-muted">Add up to 100 users. Every user needs a unique email and an 8-character password.</p><div className="space-y-3">{bulkRows.map((row, index) => <div key={index} className={`grid gap-2 border-b border-line pb-3 sm:grid-cols-2 ${fixedRole ? "xl:grid-cols-[1fr_1.2fr_0.8fr_1fr_40px]" : "xl:grid-cols-[1fr_1.2fr_0.8fr_1fr_1fr_40px]"}`}>
        <Input aria-label={`Name ${index + 1}`} placeholder="Name" value={row.name} onChange={(event) => setBulkRows((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} required />
        <Input aria-label={`Email ${index + 1}`} type="email" placeholder="Email" value={row.email} onChange={(event) => setBulkRows((items) => items.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} required />
        <Input aria-label={`Mobile ${index + 1}`} placeholder="Mobile" value={row.mobile} onChange={(event) => setBulkRows((items) => items.map((item, i) => i === index ? { ...item, mobile: event.target.value } : item))} required />
        <Input aria-label={`Password ${index + 1}`} type="password" minLength={8} placeholder="Password" value={row.password} onChange={(event) => setBulkRows((items) => items.map((item, i) => i === index ? { ...item, password: event.target.value } : item))} required />
        {!fixedRole && !isVendor && <Select aria-label={`Role ${index + 1}`} value={row.role} onChange={(event) => setBulkRows((items) => items.map((item, i) => i === index ? { ...item, role: event.target.value } : item))}>{roles.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>}
        <Button type="button" variant="ghost" className="h-10 !px-2 text-danger" aria-label={`Remove row ${index + 1}`} disabled={bulkRows.length === 1} onClick={() => setBulkRows((items) => items.filter((_, i) => i !== index))}><X size={16} /></Button>
      </div>)}</div><div className="flex flex-col justify-between gap-3 sm:flex-row"><Button type="button" variant="secondary" disabled={bulkRows.length >= 100} onClick={() => setBulkRows((rows) => [...rows, { ...emptyUser, role: fixedRole || emptyUser.role }])}><Plus size={15} />Add Row</Button><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setFormMode("")}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding..." : `Add ${bulkRows.length} ${fixedRole ? "Members" : "Users"}`}</Button></div></div></form></Modal>}

      {deleteUser && <Modal title="Delete User" busy={busy} onClose={() => setDeleteUser(null)}><p className="text-sm leading-6 text-muted">Are you sure you want to delete <strong className="text-ink">{deleteUser.name}</strong>? Their active task and session assignments will be removed.</p><div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={() => setDeleteUser(null)}>No</Button><Button type="button" variant="danger" disabled={busy} onClick={confirmDelete}><Trash2 size={15} />{busy ? "Deleting..." : "Yes, Delete"}</Button></div></Modal>}
    </div>
  );
}
