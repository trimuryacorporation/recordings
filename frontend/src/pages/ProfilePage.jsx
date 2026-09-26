import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Pencil, Save, UserCircle } from "lucide-react";
import { Button, Card, Input, PageHeader } from "../components/ui/primitives";
import { api, currentUser, updateCurrentUser } from "../services/api";

function PasswordInput({ label, value, onChange, autoComplete, className = "" }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <span className="relative mt-2 block">
        <Input type={visible ? "text" : "password"} minLength="8" autoComplete={autoComplete} value={value} onChange={onChange} className="pr-11" />
        <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? `Hide ${label}` : `Show ${label}`}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}
export function ProfilePage() {
  const [profile, setProfile] = useState(currentUser());
  const [form, setForm] = useState({ name: "", email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/auth/me")
      .then((user) => {
        setProfile(user);
        setForm((current) => ({ ...current, name: user.name ?? "", email: user.email ?? "" }));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function beginEditing() {
    setMessage("");
    setError("");
    setForm({ name: profile?.name ?? "", email: profile?.email ?? "", currentPassword: "", newPassword: "", confirmPassword: "" });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError("");
    setForm({ name: profile?.name ?? "", email: profile?.email ?? "", currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.newPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {})
        })
      });
      setProfile(updated);
      updateCurrentUser(updated);
      setForm((current) => ({ ...current, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setEditing(false);
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My Profile" eyebrow="Account" />
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}
      {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-success">{message}</div>}
      <Card
        title="Profile details"
        action={!editing && !loading ? <Button type="button" variant="secondary" onClick={beginEditing}><Pencil size={16} />Edit profile</Button> : null}
      >
        {loading ? <p className="text-sm text-muted">Loading profile…</p> : (
          <form className="space-y-5" onSubmit={save}>
            <div className="flex items-center gap-3 border-b border-line pb-5">
              <UserCircle className="h-12 w-12 text-brand" />
              <div><p className="font-semibold">{profile?.name}</p><p className="text-sm text-muted">{profile?.role?.replace("_", " ")}</p></div>
            </div>
            <label className="block text-sm font-medium">Name
              <Input className="mt-2" value={editing ? form.name : profile?.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} readOnly={!editing} required />
            </label>
            <label className="block text-sm font-medium">Email address
              <Input className="mt-2" type="email" value={editing ? form.email : profile?.email ?? ""} onChange={(event) => setForm({ ...form, email: event.target.value })} readOnly={!editing} required />
            </label>
            <div className="rounded-md border border-line bg-slate-50 p-4">
              <div className="flex items-center gap-2"><KeyRound size={17} className="text-muted" /><p className="text-sm font-semibold">Password</p></div>
              {!editing ? <p className="mt-2 text-sm text-muted">•••••••• &nbsp; Password is securely protected. Select Edit profile to change it.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <PasswordInput label="Current password" className="sm:col-span-2" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
                <PasswordInput label="New password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
                <PasswordInput label="Confirm new password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
                <p className="text-xs text-muted sm:col-span-2">Leave password fields empty if you only want to update name or email.</p>
              </div>}
            </div>
            {editing && <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={cancelEditing}>Cancel</Button><Button type="submit" disabled={saving}><Save size={16} />{saving ? "Saving…" : "Save changes"}</Button></div>}
          </form>
        )}
      </Card>
    </div>
  );
}