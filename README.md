# Trimurya Corporation Pvt. Ltd. | Script Recording Platform

Enterprise web application for single and dual-participant script recording operations.

## Structure

- `backend` - Node.js JavaScript API with MongoDB/Mongoose, RBAC, auth, QA, uploads, reports, audit logs, and Socket.IO realtime sessions.
- `frontend` - React JavaScript + Tailwind enterprise UI.
- `docker-compose.yml` - MongoDB, Redis, backend, and frontend services.

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Redis 7+
- npm 10+

## Setup

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:4000`
API docs: `http://localhost:4000/api/docs`

User accounts can only be created by an authenticated admin or super admin from the Users screen. Public registration is disabled. Passwords are hashed before they are stored in MongoDB.

## Implemented Workflows

- Admin-managed user creation, login/logout, JWT access tokens, and secure password hashing.
- RBAC middleware for admin, vendor, QA, recorder roles.
- Project creation with client/vendor assignment and recording type.
- Script creation with version records.
- Recording task assignment with single/dual participant fields.
- Secure invitation token generation and acceptance.
- Dual recording sessions with participant readiness, Socket.IO state broadcasts, and backend state transition validation.
- Single recorder browser screen using `MediaRecorder`, local preview, upload initiation, checksum metadata, and upload completion.
- Storage abstraction with local mock adapter and S3-compatible signed upload adapter.
- QA queue, scoring, approval/rejection, mandatory rejection reason, QA history.
- Dashboard and reports backed by database counts and groupings.
- Audit log capture for key operational events.

## Database

MongoDB collections cover users, clients, vendors, projects, scripts, script versions, recording tasks, recording sessions, participants, recordings, tracks, media files, invitations, QA criteria/reviews, notifications, and audit logs.

For local development, keep `backend/.env` set to `MONGO_URI=mongodb://localhost:27017/trimurya_recording` and start MongoDB before running the backend. The app does not download or run an in-memory MongoDB server. To use MongoDB Atlas, set `MONGO_URI` in `backend/.env` to the Atlas URI and make sure the current machine IP is allowed in Atlas Network Access. Frontend-only Vite config belongs in `frontend/.env`.

## Production Notes

- Replace all `backend/.env` secrets before deployment.
- Use `STORAGE_PROVIDER=s3` with S3-compatible credentials for real media storage.
- Serve media through expiring signed URLs only.
- Put the backend behind TLS and set strict CORS origins.

## Tests

```bash
npm test
```

Current critical tests cover recording task and dual session state machines. Extend API integration tests once the target deployment database is available.
# recordings
