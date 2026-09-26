# API Architecture

The backend is organized around thin route modules, service-style helpers, Mongoose models, validation middleware, auth guards, and shared state machines.

Large recordings are never sent as JSON. The browser asks `/api/uploads/initiate` for a provider URL and persists `media_files` metadata. After upload, `/api/uploads/:id/complete` attaches metadata and optional session track data.

Dual sessions store one `recording_sessions` row and separate `recording_tracks` rows for participant A and participant B. Synchronization metadata stores server countdown and timestamp details.
