import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Badge, Card, ErrorState, PageHeader, Select } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";

const roles = ["RECORDER", "QA", "VENDOR", "ADMIN", "SUPER_ADMIN"];
const label = (value) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const permissions = {
  RECORDER: "Assigned recordings only",
  QA: "QA queue and reviews",
  VENDOR: "Own recorders and tasks",
  ADMIN: "Operational management",
  SUPER_ADMIN: "Full system access"
};

export function AccessControlPage() {
  const users = useApiResource("/api/access-control/users");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  async function changeRole(user, role) {
    setSavingId(user.id); setError("");
    try { await api(`/api/access-control/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role }) }); await users.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update access."); }
    finally { setSavingId(""); }
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="Super Admin" title="Access Control" />
    {(users.error || error) && <ErrorState message={users.error || error} onRetry={users.reload} />}
    <Card title="User roles and permissions" action={<span className="text-xs text-muted">New users appear here automatically</span>}>
      <p className="mb-4 text-sm text-muted">Assign each user a role. Role permissions are applied immediately on their next request.</p>
      <DataTable loading={users.loading} rows={users.data} columns={[
        { header: "User", cell: (row) => <div><p className="font-semibold">{row.name}</p><p className="text-xs text-muted">{row.email}</p></div> },
        { header: "Role", cell: (row) => <Select className="h-8 min-w-36" value={row.role} disabled={savingId === row.id} onChange={(event) => changeRole(row, event.target.value)}>{roles.map((role) => <option key={role} value={role}>{label(role)}</option>)}</Select> },
        { header: "Permissions", cell: (row) => <span className="text-sm text-muted">{permissions[row.role]}</span> },
        { header: "Status", cell: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge> }
      ]} />
    </Card>
  </div>;
}
