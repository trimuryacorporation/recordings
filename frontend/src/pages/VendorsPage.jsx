import { Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Select, Textarea } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

const emptyVendor = { companyName: "", contactPerson: "", email: "", phone: "", country: "", address: "", status: "ACTIVE", password: "" };

function Modal({ title, children, busy, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-white shadow-xl" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button type="button" className="focus-ring rounded-md p-2 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}

function VendorFields({ value, onChange, editing = false }) {
  const field = (name) => (event) => onChange({ ...value, [name]: event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input aria-label="Company name" placeholder="Company name" value={value.companyName} onChange={field("companyName")} required />
      <Input aria-label="Contact person" placeholder="Contact person" value={value.contactPerson} onChange={field("contactPerson")} required />
      <Input aria-label="Email" type="email" placeholder="Email address" value={value.email} onChange={field("email")} required />
      <Input aria-label="Login password" type="password" autoComplete="new-password" minLength={8} placeholder={editing ? "New password (leave blank to keep current)" : "Login password (minimum 8 characters)"} value={value.password} onChange={field("password")} required={!editing} />
      <Input aria-label="Phone" type="tel" placeholder="Phone number" value={value.phone} onChange={field("phone")} />
      <Input aria-label="Country" placeholder="Country" value={value.country} onChange={field("country")} />
      <Select aria-label="Status" value={value.status} onChange={field("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
      <Textarea aria-label="Address" className="min-h-20 sm:col-span-2" placeholder="Address" value={value.address} onChange={field("address")} />
    </div>
  );
}

export function VendorsPage() {
  const vendors = useApiResource("/api/vendors");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [formMode, setFormMode] = useState("");
  const [form, setForm] = useState(emptyVendor);
  const [bulkRows, setBulkRows] = useState([{ ...emptyVendor }]);
  const [deleteVendor, setDeleteVendor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const countries = useMemo(() => [...new Set(vendors.data.map((vendor) => vendor.country).filter(Boolean))].sort(), [vendors.data]);
  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vendors.data.filter((vendor) => {
      const matchesSearch = !query || [vendor.companyName, vendor.contactPerson, vendor.email, vendor.phone].some((value) => String(value ?? "").toLowerCase().includes(query));
      return matchesSearch && (!status || vendor.status === status) && (!country || vendor.country === country);
    });
  }, [country, search, status, vendors.data]);

  function openCreate() { setForm({ ...emptyVendor }); setFormMode("create"); setError(""); }
  function openEdit(vendor) { setForm({ ...emptyVendor, ...vendor }); setFormMode("edit"); setError(""); }

  async function saveVendor(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api(formMode === "edit" ? `/api/vendors/${form.id}` : "/api/vendors", { method: formMode === "edit" ? "PATCH" : "POST", body: JSON.stringify(form) });
      setFormMode("");
      await vendors.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save vendor."); }
    finally { setBusy(false); }
  }

  async function saveBulk(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/vendors/bulk", { method: "POST", body: JSON.stringify({ vendors: bulkRows }) });
      setFormMode(""); setBulkRows([{ ...emptyVendor }]);
      await vendors.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add vendors."); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    setBusy(true); setError("");
    try {
      await api(`/api/vendors/${deleteVendor.id}`, { method: "DELETE" });
      setDeleteVendor(null);
      await vendors.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete vendor."); setDeleteVendor(null); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="Vendors" action={<div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setBulkRows([{ ...emptyVendor }]); setFormMode("bulk"); setError(""); }}><Upload size={16} />Bulk Add</Button><Button type="button" onClick={openCreate}><Plus size={16} />Add Vendor</Button></div>} />
      {(vendors.error || error) && <ErrorState message={vendors.error || error} onRetry={vendors.error ? vendors.reload : undefined} />}

      <div className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_200px_200px_auto]">
        <label className="relative"><span className="sr-only">Search vendors</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Search company, contact or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <Select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
        <Select aria-label="Filter by country" value={country} onChange={(event) => setCountry(event.target.value)}><option value="">All countries</option>{countries.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
        <p className="self-center text-right text-sm text-muted">{filteredVendors.length} results</p>
      </div>

      <Card title="Vendor Network">
        <DataTable loading={vendors.loading} rows={filteredVendors} empty="No vendors match these filters" columns={[
          { header: "Company", cell: (row) => <div><p className="font-semibold">{row.companyName}</p><p className="text-xs text-muted">{row.contactPerson}</p></div> },
          { header: "Email", cell: (row) => <div><p>{row.email}</p><p className="text-xs text-muted">{row.phone || "No phone"}</p></div> },
          { header: "Country", cell: (row) => row.country || "-" },
          { header: "Users", cell: (row) => row._count?.users ?? 0 },
          { header: "Projects", cell: (row) => row._count?.projects ?? 0 },
          { header: "Status", cell: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge> },
          { id: "actions", header: "Actions", sortable: false, cell: (row) => <div className="flex gap-2"><Button type="button" variant="secondary" className="h-8 !px-2.5" title="Edit vendor" aria-label={`Edit ${row.companyName}`} onClick={() => openEdit(row)}><Pencil size={14} /></Button><Button type="button" variant="danger" className="h-8 !px-2.5" title="Delete vendor" aria-label={`Delete ${row.companyName}`} onClick={() => { setDeleteVendor(row); setError(""); }}><Trash2 size={14} /></Button></div> }
        ]} />
      </Card>

      {(formMode === "create" || formMode === "edit") && <Modal title={formMode === "edit" ? "Edit Vendor" : "Add Vendor"} busy={busy} onClose={() => setFormMode("")}><form onSubmit={saveVendor} className="space-y-4"><VendorFields value={form} onChange={setForm} editing={formMode === "edit"} /><p className="text-xs text-muted">The vendor can sign in with this email and password.</p><div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={() => setFormMode("")}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : formMode === "edit" ? "Save Changes" : "Add Vendor"}</Button></div></form></Modal>}

      {formMode === "bulk" && <Modal title="Bulk Add Vendors" busy={busy} onClose={() => setFormMode("")}><form onSubmit={saveBulk} className="space-y-4"><p className="text-sm text-muted">Add up to 100 vendors. Company, contact person and email are required.</p><div className="space-y-3">{bulkRows.map((row, index) => <div key={index} className="grid gap-2 border-b border-line pb-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_0.8fr_40px]">
        <Input aria-label={`Company ${index + 1}`} placeholder="Company" value={row.companyName} onChange={(event) => setBulkRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, companyName: event.target.value } : item))} required />
        <Input aria-label={`Contact ${index + 1}`} placeholder="Contact person" value={row.contactPerson} onChange={(event) => setBulkRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, contactPerson: event.target.value } : item))} required />
        <Input aria-label={`Email ${index + 1}`} type="email" placeholder="Email" value={row.email} onChange={(event) => setBulkRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} required />
        <Input aria-label={`Country ${index + 1}`} placeholder="Country" value={row.country} onChange={(event) => setBulkRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, country: event.target.value } : item))} />
        <Button type="button" variant="ghost" className="h-10 !px-2 text-danger" aria-label={`Remove row ${index + 1}`} disabled={bulkRows.length === 1} onClick={() => setBulkRows((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></Button>
      </div>)}</div><div className="flex flex-col justify-between gap-3 sm:flex-row"><Button type="button" variant="secondary" disabled={bulkRows.length >= 100} onClick={() => setBulkRows((rows) => [...rows, { ...emptyVendor }])}><Plus size={15} />Add Row</Button><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setFormMode("")}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding..." : `Add ${bulkRows.length} Vendors`}</Button></div></div></form></Modal>}

      {deleteVendor && <Modal title="Delete Vendor" busy={busy} onClose={() => setDeleteVendor(null)}><p className="text-sm leading-6 text-muted">Are you sure you want to delete <strong className="text-ink">{deleteVendor.companyName}</strong>? This action cannot be undone.</p><div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={() => setDeleteVendor(null)}>No</Button><Button type="button" variant="danger" disabled={busy} onClick={confirmDelete}><Trash2 size={15} />{busy ? "Deleting..." : "Yes, Delete"}</Button></div></Modal>}
    </div>
  );
}
