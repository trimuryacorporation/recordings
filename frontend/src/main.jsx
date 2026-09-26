import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AppLayout } from "./layouts/AppLayout";
import { ApiManagementPage } from "./pages/ApiManagementPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DualSessionPage } from "./pages/DualSessionPage";
import { DualRecordingsPage } from "./pages/DualRecordingsPage";
import { LandingPage } from "./pages/LandingPage";
import { LiveRecordingsPage } from "./pages/LiveRecordingsPage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { BillingPage, NotificationsPage, SettingsPage, VendorPaymentsPage } from "./pages/OperationsPages";
import { ProjectsPage } from "./pages/ProjectsPage";
import { QaPage } from "./pages/QaPage";
import { RecorderPage } from "./pages/RecorderPage";
import { RecordingDashboardPage } from "./pages/RecordingDashboardPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ScriptsPage } from "./pages/ScriptsPage";
import { ScriptRecordingPage } from "./pages/ScriptRecordingPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";
import { VendorsPage } from "./pages/VendorsPage";
import { currentUser, platformHome } from "./services/api";

function Protected({ children }) {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "RECORDER" ? <Navigate to={platformHome(user)} replace /> : <>{children}</>;
}

function PlatformProtected({ platformType, children }) {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  const actualPlatform = user.platformType ?? "SCRIPT_RECORDING";
  return actualPlatform === platformType ? <>{children}</> : <Navigate to={platformHome(user)} replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/single" element={<Navigate to="/login" replace />} />
        <Route path="/login/dual" element={<Navigate to="/login" replace />} />
        <Route path="/login/script" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/single-dashboard" element={<PlatformProtected platformType="SINGLE_RECORDING"><RecordingDashboardPage platformType="SINGLE_RECORDING" /></PlatformProtected>} />
        <Route path="/single-assigned-work" element={<PlatformProtected platformType="SINGLE_RECORDING"><RecordingDashboardPage platformType="SINGLE_RECORDING" view="work" /></PlatformProtected>} />
        <Route path="/dual-dashboard" element={<PlatformProtected platformType="DUAL_RECORDING"><RecordingDashboardPage platformType="DUAL_RECORDING" /></PlatformProtected>} />
        <Route path="/dual-assigned-work" element={<PlatformProtected platformType="DUAL_RECORDING"><RecordingDashboardPage platformType="DUAL_RECORDING" view="work" /></PlatformProtected>} />
        <Route path="/script-dashboard" element={<PlatformProtected platformType="SCRIPT_RECORDING"><ScriptRecordingPage /></PlatformProtected>} />
        <Route path="/record/:taskId" element={<PlatformProtected platformType="SINGLE_RECORDING"><RecorderPage mode="single" /></PlatformProtected>} />
        <Route path="/dual-record/:taskId" element={<PlatformProtected platformType="DUAL_RECORDING"><DualSessionPage /></PlatformProtected>} />
        <Route path="/dual-session/:sessionId" element={<PlatformProtected platformType="DUAL_RECORDING"><DualSessionPage /></PlatformProtected>} />
        <Route path="/invite/dual/:token" element={<DualSessionPage />} />
        <Route
          path="/app"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="scripts" element={<ScriptsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="record-single" element={<LiveRecordingsPage />} />
          <Route path="dual-sessions" element={<DualRecordingsPage />} />
          <Route path="qa" element={<QaPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="users" element={<UsersPage fixedRole={currentUser()?.role === "VENDOR" ? "RECORDER" : ""} title={currentUser()?.role === "VENDOR" ? "Recorder Users" : "Users"} />} />
          <Route path="clients" element={<PlaceholderPage title="Clients" />} />
          <Route path="qa-team" element={<UsersPage fixedRole="QA" title="QA Team" eyebrow="Quality Team" />} />
          <Route path="approved" element={<QaPage filter="APPROVED" />} />
          <Route path="rejected" element={<QaPage filter="REJECTED" />} />
          <Route path="reports/*" element={<ReportsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="api-management" element={<ApiManagementPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="payments" element={<VendorPaymentsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
