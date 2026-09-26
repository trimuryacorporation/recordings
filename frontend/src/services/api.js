const API_URL = import.meta.env.VITE_API_URL
    ?? (import.meta.env.PROD ? "https://recordings-wz8u.onrender.com" : "");
let accessToken = localStorage.getItem("trimurya.accessToken") ?? "";
let refreshToken = localStorage.getItem("trimurya.refreshToken") ?? "";
export function setAccessToken(token) {
    accessToken = token;
    localStorage.setItem("trimurya.accessToken", token);
}
async function request(path, options = {}) {
    return fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...options.headers
        },
        credentials: "include"
    });
}
export async function api(path, options = {}) {
    let response = await request(path, options);
    if (response.status === 401 && refreshToken && path !== "/api/auth/refresh" && path !== "/api/auth/login") {
        const refreshed = await request("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) });
        if (refreshed.ok) {
            const result = await refreshed.json();
            setAccessToken(result.accessToken);
            response = await request(path, options);
        }
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(body.message ?? "Request failed. Please try again.");
        error.status = response.status;
        error.code = body.code;
        throw error;
    }
    return response.json();
}
export async function uploadBinary(path, blob) {
    const response = await fetch(`${API_URL}${path}`, { method: "PUT", headers: { "Content-Type": blob.type, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: blob, credentials: "include" });
    if (!response.ok) throw new Error("Recording upload failed.");
    return response.json();
}
export async function fetchBinary(path) {
    const external = path.startsWith("http://") || path.startsWith("https://");
    const url = external ? path : `${API_URL}${path}`;
    const response = await fetch(url, {
        headers: !external && accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: "include"
    });
    if (!response.ok) throw new Error("Unable to download the audio file.");
    return response.blob();
}
export async function login(email, password) {
    const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    setAccessToken(result.accessToken);
    refreshToken = result.refreshToken ?? "";
    localStorage.setItem("trimurya.refreshToken", refreshToken);
    localStorage.setItem("trimurya.user", JSON.stringify({ ...result.user, name: result.name }));
    return result;
}
export async function acceptGuestInvitation(token) {
    const result = await api(`/api/invitations/${token}/guest-accept`, { method: "POST", body: "{}" });
    setAccessToken(result.accessToken);
    refreshToken = "";
    localStorage.removeItem("trimurya.refreshToken");
    localStorage.setItem("trimurya.user", JSON.stringify(result.user));
    return result;
}
export function currentUser() {
    const raw = localStorage.getItem("trimurya.user");
    return raw ? JSON.parse(raw) : null;
}
export function updateCurrentUser(user) {
    const existing = currentUser() ?? {};
    localStorage.setItem("trimurya.user", JSON.stringify({ ...existing, ...user }));
}
export function platformHome(user = currentUser()) {
    if (user?.role === "GUEST" && user.sessionId) return `/dual-session/${user.sessionId}`;
    if (user && user.role !== "RECORDER") return "/app";
    const destinations = {
        SINGLE_RECORDING: "/single-dashboard",
        DUAL_RECORDING: "/dual-dashboard",
        SCRIPT_RECORDING: "/script-dashboard"
    };
    return destinations[user?.platformType] ?? "/script-dashboard";
}
export function logout() {
    localStorage.removeItem("trimurya.accessToken");
    localStorage.removeItem("trimurya.user");
    localStorage.removeItem("trimurya.refreshToken");
    accessToken = "";
    refreshToken = "";
}
