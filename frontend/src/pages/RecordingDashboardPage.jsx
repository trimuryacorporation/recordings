import { ChevronDown, Copy, ExternalLink, FileText, LayoutDashboard, ListChecks, LogOut, Mic, Radio, RefreshCw, Share2, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { Badge, Button, Card, ErrorState, Select } from "../components/ui/primitives";
import { useApiResource } from "../hooks/useApiResource";
import { api, currentUser, logout } from "../services/api";

const config = {
  SINGLE_RECORDING: { title: "Single Recording Dashboard", eyebrow: "Single Recording", query: "?recordingType=SINGLE", icon: Mic, home: "/single-dashboard", work: "/single-assigned-work" },
  DUAL_RECORDING: { title: "Dual Recording Dashboard", eyebrow: "Dual Recording", query: "?recordingType=DUAL", icon: Radio, home: "/dual-dashboard", work: "/dual-assigned-work" },
  SCRIPT_RECORDING: { title: "Script Recording Dashboard", eyebrow: "Script Recording", query: "", icon: FileText, home: "/script-dashboard", work: "/script-dashboard" }
};

export function RecordingDashboardPage({ platformType, view = "dashboard" }) {
  const settings = config[platformType];
  const tasks = useApiResource(`/api/tasks${settings.query}`);
  const navigate = useNavigate();
  const user = currentUser();
  const Icon = settings.icon;
  const [inviteTaskId, setInviteTaskId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteSessionId, setInviteSessionId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenu = useRef(null);

  useEffect(() => {
    function closeProfile(event) {
      if (event.key === "Escape" || (event.type === "pointerdown" && !profileMenu.current?.contains(event.target))) setProfileOpen(false);
    }
    document.addEventListener("pointerdown", closeProfile);
    document.addEventListener("keydown", closeProfile);
    return () => {
      document.removeEventListener("pointerdown", closeProfile);
      document.removeEventListener("keydown", closeProfile);
    };
  }, []);

  function signOut() {
    logout();
    navigate("/login");
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  async function copyInviteLink() {
    const selectedTaskId = inviteTaskId || hostTasks[0]?.id;
    setInviteBusy(true);
    setInviteMessage("");
    try {
      let invitation;
      if (selectedTaskId) {
        const session = await api("/api/recording-sessions", { method: "POST", body: JSON.stringify({ taskId: selectedTaskId }) });
        invitation = await api(`/api/recording-sessions/${session.id}/invite`, { method: "POST", body: "{}" });
      } else {
        invitation = await api("/api/dual-invitations", { method: "POST", body: "{}" });
      }
      await copyText(invitation.inviteUrl);
      setInviteUrl(invitation.inviteUrl);
      setInviteSessionId(invitation.sessionId ?? "");
      setInviteMessage(invitation.email ? `Invite link copied for ${invitation.email}` : "Invite link generated and copied.");
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Unable to create invite link.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Dual recording invitation", text: "Join my dual recording session", url: inviteUrl }).catch(() => undefined);
    } else {
      await copyText(inviteUrl);
      setInviteMessage("Invite link copied.");
    }
  }

  const hostTasks = platformType === "DUAL_RECORDING" ? tasks.data.filter((task) => task.participantA?.id === user?.id && !["APPROVED", "COMPLETED"].includes(task.status)) : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:h-16 sm:px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-2"><Icon className="h-5 w-5 shrink-0 text-brand" /><div className="min-w-0"><p className="truncate text-sm font-bold text-brand">{settings.eyebrow} Recorder</p><p className="hidden truncate text-xs text-muted sm:block">TRT Tools</p></div></div>
        <div className="relative" ref={profileMenu}>
          <button className="focus-ring flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-slate-100 sm:px-2" type="button" aria-expanded={profileOpen} aria-label="Open profile menu" onClick={() => setProfileOpen((open) => !open)}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-bold text-brand">{(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}</span>
            <span className="hidden max-w-44 text-left sm:block"><span className="block truncate text-sm font-semibold text-ink">{user?.name ?? "Recording User"}</span><span className="block truncate text-xs text-muted">{user?.email}</span></span>
            <ChevronDown className={`h-4 w-4 text-muted transition ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-line bg-white p-2 shadow-lg">
              <div className="flex items-start gap-3 border-b border-line p-3">
                <UserCircle className="h-9 w-9 shrink-0 text-brand" />
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.name ?? "Recording User"}</p><p className="truncate text-xs text-muted">{user?.email}</p><Badge tone="accent">{settings.eyebrow}</Badge></div>
              </div>
              <nav className="py-2">
                <Link className="focus-ring flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-slate-50" to={settings.home} onClick={() => setProfileOpen(false)}><LayoutDashboard size={16} />Dashboard</Link>
                <Link className="focus-ring flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-slate-50" to={settings.work} onClick={() => setProfileOpen(false)}><ListChecks size={16} />My assigned work</Link>
              </nav>
              <button className="focus-ring flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold text-danger hover:bg-red-50" type="button" onClick={signOut}><LogOut size={16} />Logout</button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:space-y-6 sm:p-5 lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-medium text-muted sm:text-sm">{settings.eyebrow}</p><h1 className="truncate text-xl font-bold text-ink sm:text-2xl">{view === "work" ? "My Assigned Work" : settings.title}</h1></div>
          <Button className="h-10 shrink-0 px-3 sm:px-4" type="button" variant="secondary" onClick={tasks.reload} title="Refresh tasks" aria-label="Refresh tasks"><RefreshCw size={16} /><span className="hidden sm:inline">Refresh</span></Button>
        </div>
        {tasks.error && <ErrorState message={tasks.error} onRetry={tasks.reload} />}
        {view === "dashboard" && platformType === "DUAL_RECORDING" && (
          <Card title="Invite Participant B" headerClassName="px-4 py-3 sm:px-5 sm:py-4" bodyClassName="p-4 sm:p-5">
            <div className="grid gap-2.5 sm:grid-cols-[1fr_auto] sm:gap-3">
              <Select value={inviteTaskId} onChange={(event) => { setInviteTaskId(event.target.value); setInviteMessage(""); setInviteUrl(""); setInviteSessionId(""); }} disabled={!hostTasks.length} aria-label="Select dual task for invitation">
                <option value="">{hostTasks.length ? "Manual session or select assigned task" : "Manual dual session"}</option>
                {hostTasks.map((task) => <option key={task.id} value={task.id}>{task.taskCode} - {task.script?.title ?? task.project?.name}</option>)}
              </Select>
              <Button type="button" onClick={copyInviteLink} disabled={inviteBusy}>
                <Copy size={16} />
                {inviteBusy ? "Creating..." : "Copy invite link"}
              </Button>
            </div>
            {inviteMessage && <p className="mt-3 text-sm font-medium text-brand" aria-live="polite">{inviteMessage}</p>}
            {inviteUrl && <div className="mt-3 rounded-md border border-line bg-slate-50 p-2.5">
              <p className="truncate text-xs text-muted">{inviteUrl}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Button className="h-9 px-2 text-xs" type="button" variant="secondary" onClick={async () => { await copyText(inviteUrl); setInviteMessage("Invite link copied."); }}><Copy size={14} />Copy</Button>
                <Button className="h-9 px-2 text-xs" type="button" variant="secondary" onClick={shareInvite}><Share2 size={14} />Share</Button>
                {inviteSessionId && <Link className="focus-ring inline-flex h-9 items-center justify-center gap-1 rounded-md bg-brand px-2 text-xs font-semibold text-white" to={`/dual-session/${inviteSessionId}`}><ExternalLink size={14} />Open</Link>}
              </div>
            </div>}
          </Card>
        )}
        {view === "work" && <Card title="My assigned work">
          <DataTable
            loading={tasks.loading}
            rows={tasks.data}
            empty="No tasks are assigned to this account"
            columns={[
              { header: "Task", cell: (row) => <span className="font-semibold">{row.taskCode}</span> },
              { header: "Project", cell: (row) => row.project?.name ?? "-" },
              { header: "Script", cell: (row) => <div><p className="font-medium">{row.script?.title ?? "-"}</p><p className="max-w-md truncate text-xs text-muted">{row.script?.currentText ?? ""}</p></div> },
              { header: "Status", cell: (row) => <Badge tone={row.status === "APPROVED" ? "success" : "accent"}>{row.status}</Badge> },
              { header: "Action", cell: (row) => platformType === "SINGLE_RECORDING" ? <Link className="font-semibold text-brand" to={`/record/${row.id}`}>Record</Link> : platformType === "DUAL_RECORDING" ? <Link className="font-semibold text-brand" to={`/dual-record/${row.id}`}>{row.participantA?.id === user?.id ? "Host & invite" : "Join invitation"}</Link> : <span className="text-muted">View script</span> }
            ]}
          />
        </Card>}
      </div>
    </main>
  );
}
