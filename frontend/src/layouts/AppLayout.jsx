import {
  Bell,
  ClipboardCheck,
  FileText,
  Gauge,
  Home,
  ListChecks,
  LogOut,
  Menu,
  Mic,
  Search,
  Settings,
  Shield,
  Users,
  UserCircle,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, currentUser, logout } from "../services/api";
import trimuryaLogo from "../assets/trimurya-corporation-logo.png";

const sections = [
  { title: "Dashboard", items: [{ label: "Dashboard", to: "/app", icon: Home }] },
  {
    title: "Operations",
    items: [
      { label: "Projects", to: "/app/projects", icon: Gauge },
      { label: "Recording Tasks", to: "/app/tasks", icon: ListChecks },
      { label: "Live Recordings", to: "/app/record-single", icon: Mic },
      { label: "Dual Sessions", to: "/app/dual-sessions", icon: Users },
      { label: "Scripts", to: "/app/scripts", icon: FileText }
    ]
  },
  {
    title: "People",
    items: [
      { label: "Users", to: "/app/users", icon: Users },
    ]
  },
  {
    title: "Quality",
    items: [
      { label: "QA Queue", to: "/app/qa", icon: ClipboardCheck },
      { label: "Approved", to: "/app/approved", icon: ClipboardCheck },
      { label: "Rejected", to: "/app/rejected", icon: ClipboardCheck },
      { label: "Quality Reports", to: "/app/reports/quality", icon: Gauge }
    ]
  },
  {
    title: "Analytics",
    items: [
      { label: "Productivity", to: "/app/reports/productivity", icon: Gauge },
      { label: "Recording Analytics", to: "/app/reports/recordings", icon: Gauge },
      { label: "Vendor Performance", to: "/app/reports/vendors", icon: Gauge },
      { label: "User Performance", to: "/app/reports/users", icon: Gauge },
      { label: "QA Analytics", to: "/app/reports/qa", icon: Gauge }
    ]
  },
  {
    title: "Finance",
    items: [
      { label: "Billing", to: "/app/billing", icon: WalletCards },
      { label: "Vendor Payments", to: "/app/payments", icon: WalletCards },
      { label: "Reports", to: "/app/reports", icon: FileText }
    ]
  },
  {
    title: "System",
    items: [
      { label: "Notifications", to: "/app/notifications", icon: Bell },
      { label: "API Management", to: "/app/api-management", icon: Settings },
      { label: "Access Control", to: "/app/access-control", icon: Shield },
      { label: "Audit Logs", to: "/app/audit-logs", icon: Shield },
      { label: "Settings", to: "/app/settings", icon: Settings }
    ]
  }
];

const vendorRoutes = new Set(["/app", "/app/tasks", "/app/record-single", "/app/users", "/app/reports"]);

function Sidebar({ user, onNavigate }) {
  const visibleSections = user?.role === "VENDOR"
    ? sections.map((section) => ({ ...section, items: section.items.filter((item) => vendorRoutes.has(item.to)) })).filter((section) => section.items.length)
    : sections;
  return (
    <aside className="flex h-full flex-col border-r border-line bg-white">
      <div className="border-b border-line px-5 py-5">
        <img src={trimuryaLogo} alt="Trimurya Corporation" className="h-9 w-auto max-w-full object-contain object-left" />
      </div>
      <nav className="app-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase text-muted">{section.title}</p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/app"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? "bg-teal-50 text-brand" : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = currentUser();

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setSearchResults([]); return undefined; }
    const timer = window.setTimeout(async () => {
      try { setSearchResults(await api(`/api/search?q=${encodeURIComponent(query)}`)); }
      catch { setSearchResults([]); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  function openSearchResult(result) {
    setSearchQuery("");
    setSearchResults([]);
    navigate(result.path);
  }

  const unreadNotifications = notifications.filter((notification) => !notification.readAt);

  async function openNotification(notification) {
    if (!notification.readAt) {
      try { await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" }); }
      catch { /* Navigation should still work if marking read fails. */ }
    }
    setNotificationsOpen(false);
    navigate("/app/notifications");
    try { setNotifications(await api("/api/notifications")); } catch { /* Keep current list. */ }
  }
  function signOut() {
    logout();
    navigate("/login");
  }

  if (user?.role === "VENDOR" && !vendorRoutes.has(location.pathname)) {
    return <Navigate to="/app/tasks" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed inset-y-0 left-0 hidden w-72 lg:block">
        <Sidebar user={user} />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-slate-900/40" type="button" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-80 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-2 text-muted hover:bg-slate-100"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar user={user} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 flex min-h-[72px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 shadow-sm shadow-slate-950/[0.03] backdrop-blur lg:px-8">
          <button
            type="button"
            className="rounded-xl border border-line bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="focus-ring h-10 w-full rounded-xl border border-line bg-slate-50/80 py-2 pl-10 pr-3 text-sm text-ink shadow-inner shadow-slate-950/[0.02] placeholder:text-muted transition focus:bg-white" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchResults[0]) openSearchResult(searchResults[0]); if (event.key === "Escape") { setSearchQuery(""); setSearchResults([]); } }} placeholder="Search projects, tasks, users, vendors..." aria-label="Global search" />
            {searchQuery.trim().length >= 2 && <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-md border border-line bg-white shadow-lg">{searchResults.length ? <div className="max-h-80 overflow-y-auto py-1">{searchResults.map((result) => <button key={`${result.type}-${result.id}`} type="button" onMouseDown={(event) => { event.preventDefault(); openSearchResult(result); }} className="flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left hover:bg-teal-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{result.title}</span><span className="block truncate text-xs text-muted">{result.detail}</span></span><span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{result.type}</span></button>)}</div> : <p className="px-3 py-3 text-sm text-muted">No matching records found.</p>}</div>}
          </div>
          <div className="relative">
            <button type="button" className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-slate-600 shadow-sm transition hover:bg-teal-50 hover:text-brand" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Open notifications">
              <Bell className="h-4 w-4" />
              {unreadNotifications.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-5 text-white">{unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}</span>}
            </button>
            {notificationsOpen && <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-80 overflow-hidden rounded-xl border border-line bg-white shadow-xl"><div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="text-sm font-bold text-ink">Notifications</p><button type="button" className="text-xs font-semibold text-brand hover:text-teal-800" onClick={() => { setNotificationsOpen(false); navigate("/app/notifications"); }}>View all</button></div>{notifications.length ? <div className="max-h-96 overflow-y-auto">{notifications.slice(0, 6).map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-teal-50 ${notification.readAt ? "opacity-65" : "bg-white"}`}><span className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden={!notification.readAt}>{notification.readAt ? "" : ""}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{notification.title}</span><span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted">{notification.message}</span></span></span></button>)}</div> : <p className="px-4 py-6 text-center text-sm text-muted">You have no notifications.</p>}</div>}
          </div>          <button type="button" className="hidden min-w-0 rounded-xl border border-transparent px-3 py-2 text-right transition hover:border-line hover:bg-slate-50 md:block" onClick={() => navigate("/app/profile")} aria-label="Open my profile">
            <span className="flex items-center justify-end gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-sm font-bold text-brand">{(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}</span><span><span className="block truncate text-sm font-semibold">{user?.name ?? user?.email}</span><span className="block text-xs text-muted">{user?.role}</span></span></span>
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-danger" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </header>
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
