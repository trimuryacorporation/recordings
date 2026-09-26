const operation = (summary, tag, secured = true) => ({
    summary,
    tags: [tag],
    ...(secured ? { security: [{ bearerAuth: [] }] } : {}),
    responses: {
        200: { description: "Successful response" },
        201: { description: "Resource created" },
        401: { description: "Authentication required" },
        422: { description: "Validation failed" }
    }
});

export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "Trimurya Script Recording Platform API",
        version: "1.1.0",
        description: "REST API for users, projects, scripts, recording operations, QA, and reports."
    },
    servers: [{ url: "http://localhost:4000", description: "Local API" }],
    components: {
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
        }
    },
    paths: {
        "/health": { get: operation("Basic service health", "System", false) },
        "/api/status": { get: operation("API and database status", "System", false) },
        "/api/openapi.json": { get: operation("OpenAPI specification", "System", false) },
        "/api/auth/login": { post: operation("Login and receive access tokens", "Authentication", false) },
        "/api/auth/refresh": { post: operation("Refresh an access token", "Authentication", false) },
        "/api/auth/logout": { post: operation("Logout current user", "Authentication") },
        "/api/auth/me": { get: operation("Get current user", "Authentication") },
        "/api/dashboard": { get: operation("Dashboard metrics and activity", "Dashboard") },
        "/api/languages": { get: operation("List Indian and international languages", "System") },
        "/api/clients": { get: operation("List clients", "People") },
        "/api/vendors": { get: operation("List vendors", "People") },
        "/api/users": { get: operation("List users", "People"), post: operation("Create a user", "People") },
        "/api/projects": { get: operation("List projects", "Projects"), post: operation("Create a project", "Projects") },
        "/api/projects/{id}": { get: operation("Get project details", "Projects"), patch: operation("Update a project", "Projects") },
        "/api/scripts": { get: operation("List scripts", "Scripts"), post: operation("Create a script", "Scripts") },
        "/api/scripts/search": { get: operation("Search and filter paginated scripts", "Scripts") },
        "/api/scripts/bulk": { post: operation("Bulk upload single or dual scripts", "Scripts") },
        "/api/scripts/{id}": { patch: operation("Update and version a script", "Scripts") },
        "/api/tasks": { get: operation("List recording tasks", "Tasks"), post: operation("Create a recording task", "Tasks") },
        "/api/tasks/search": { get: operation("Search and filter paginated tasks", "Tasks") },
        "/api/tasks/assign-selection": { patch: operation("Assign selected recording tasks", "Tasks") },
        "/api/tasks/bulk": { post: operation("Bulk assign project scripts", "Tasks") },
        "/api/tasks/{id}": { get: operation("Get assigned task details", "Tasks") },
        "/api/tasks/{id}/assign": { post: operation("Assign a recording task", "Tasks") },
        "/api/invitations": { post: operation("Create a participant invitation", "Invitations") },
        "/api/invitations/{token}/accept": { post: operation("Accept an invitation", "Invitations") },
        "/api/recording-sessions": { post: operation("Create a recording session", "Recordings") },
        "/api/recording-sessions/live": { get: operation("List live recording sessions", "Recordings") },
        "/api/recording-sessions/{id}": { get: operation("Get recording session", "Recordings") },
        "/api/recording-sessions/{id}/join": { post: operation("Join a recording session", "Recordings") },
        "/api/recording-sessions/{id}/ready": { post: operation("Mark participant ready", "Recordings") },
        "/api/recording-sessions/{id}/start": { post: operation("Start synchronized recording", "Recordings") },
        "/api/recording-sessions/{id}/stop": { post: operation("Stop recording", "Recordings") },
        "/api/uploads/initiate": { post: operation("Initiate media upload", "Uploads") },
        "/api/uploads/{id}/complete": { post: operation("Complete media upload", "Uploads") },
        "/api/recordings": { get: operation("List recordings", "Recordings") },
        "/api/recordings/{id}": { get: operation("Get recording details", "Recordings") },
        "/api/qa/reviews": { post: operation("Submit a QA review", "Quality") },
        "/api/qa/queue": { get: operation("List pending QA recordings", "Quality") },
        "/api/reports/projects": { get: operation("Project report", "Reports") },
        "/api/reports/vendors": { get: operation("Vendor report", "Reports") },
        "/api/reports/users": { get: operation("User report", "Reports") },
        "/api/audit-logs": { get: operation("List audit logs", "System") }
    }
};
