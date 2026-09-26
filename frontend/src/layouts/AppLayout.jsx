import {
  Bell,
  ClipboardCheck,
  FileText,
  Gauge,
  Home,
  Landmark,
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
import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { currentUser, logout } from "../services/api";

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
      { label: "Clients", to: "/app/clients", icon: Landmark },
      { label: "Vendors", to: "/app/vendors", icon: Users },
      { label: "Users", to: "/app/users", icon: Users },
      { label: "QA Team", to: "/app/qa-team", icon: Shield }
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
        <p className="text-sm font-bold text-brand">Trimurya Corporation Pvt. Ltd.</p>
        <p className="mt-1 text-xs text-muted">Script Recording Platform</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
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
  const navigate = useNavigate();
  const location = useLocation();
  const user = currentUser();

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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 lg:px-8">
          <button
            type="button"
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-muted">
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Global search</span>
          </div>
          <button type="button" className="hidden min-w-0 rounded-md px-3 py-2 text-right hover:bg-slate-100 md:block" onClick={() => navigate("/app/profile")} aria-label="Open my profile">
            <span className="flex items-center justify-end gap-2"><UserCircle className="h-5 w-5 text-brand" /><span><span className="block truncate text-sm font-semibold">{user?.name ?? user?.email}</span><span className="block text-xs text-muted">{user?.role}</span></span></span>
          </button>
          <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-slate-100" onClick={signOut}>
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
