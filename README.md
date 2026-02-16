# OpenApprove

OpenApprove — token-based approval workflows with tamper-evident audit trails.

OpenApprove is API-first and fully controlled via HTTP requests. Emails are optional side effects; external systems drive **all** functions through the API.

## Features (First Draft)
- Token-only access (no user accounts)
- Multi-file + versioning per process
- Separate per-version assets: `download` (required) and `view` (optional)
- Sequential approval cycles (ALL_APPROVE / ANY_APPROVE)
- Per-file toggle: approval required vs no-approval
- Tamper-evident audit trail (hash-chained, append-only)
- PDF viewing via PDF.js + annotation overlay via Fabric.js
- English + German email templates
- Viewer/Uploader portals by `customerNumber` and `uploaderId`
- Webhooks with HMAC signatures

## Architecture Notes
- Linux-first (Ubuntu/Debian). Run as non-root behind reverse proxy.
- API-first: **all** functions are HTTP endpoints.
- SQLite for dev, Prisma schema is Postgres-ready.
- Token hashes only (SHA-256). Raw tokens are never stored.

## Quickstart
1. Copy `.env.example` to `.env` and update values.
2. Install dependencies and generate Prisma client.
3. Run migrations and start server.

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Core Concepts
### Roles & Scopes (token-only)
- VIEWER: `CUSTOMER_PORTAL_VIEW`
- UPLOADER: `UPLOAD_PROCESS` + `CUSTOMER_PORTAL_VIEW`
- REVIEWER: `VIEW_PDF`, `DOWNLOAD_PDF`, optional `ANNOTATE_PDF`
- APPROVER: `VIEW_PDF`, `DOWNLOAD_PDF`, `DECIDE`, `INVITE_REVIEWER`
- ADMIN: full API access

**VIEWER / UPLOADER tokens are never emailed by OpenApprove.**

### Process Model
- A process contains multiple files.
- Uploading a file with the same original filename creates a new file **version**.
- Process and file versions can have typed attributes (stored as JSON).

### Approval Cycles
- Cycles are sequential.
- Each cycle has participants with role REVIEWER or APPROVER.
- Completion rule per cycle: `ALL_APPROVE` or `ANY_APPROVE`.
- Rejection requires a reason and stops the process.

### Audit Trail (Tamper-Evident)
- Append-only event log.
- Hash chaining: `event_hash = SHA256(canonical_json(event_payload_without_hashes) + prev_hash)`.
- Export NDJSON and verify hash chain via API.

### GDPR / DSGVO
- Data minimization: only required data stored.
- Retention: configurable deletion/archival (to be scheduled externally).
- Cookies: no non-essential cookies in MVP.
- Deletion/export: `DELETE /api/processes/:id` and audit export endpoints.

## API Overview (HTTP-Driven)
All endpoints accept and return JSON unless stated otherwise.

### Processes
- `POST /api/processes` create
- `PATCH /api/processes/:id` update attributes
- `GET /api/processes/:id` fetch (admin)

### Files & Versions
- `POST /api/files/upload` (multipart):
  - `downloadFile` required (fallback field: `file`)
  - `viewFile` optional (PDF only; if omitted and `downloadFile` is PDF, it is used as view file)
  - `uploaderCustomerNumber` required (or provided by token customer binding)
  - `approvalRequired=true|false` optional (default `true`)
- `GET /api/files/versions/:id/download` download
- `GET /api/files/versions/:id/view` stream view file (if available)

### Tokens
- `POST /api/tokens` generate token (returns raw token once)

### Approval Cycles
- `POST /api/approvals/cycles` configure
- `POST /api/approvals/start` start
- `POST /api/approvals/decide` approve/reject (reason required for rejection)
- `POST /api/approvals/invite` approver invites reviewer (optional handoff)

### Emails
- `POST /api/emails/invite` send invitation email (reviewer/approver only)

### Portals
- `GET /api/portal/processes` by customerNumber
- `GET /api/portal/my-uploads` by uploaderId
- `GET /api/portal/company-uploads` by customerNumber

### Audit
- `GET /api/audit/export` NDJSON export
- `GET /api/audit/verify` verify hash chain

### Webhooks
- `POST /api/webhooks` register
- Outgoing POST with `X-OpenApprove-Signature` (HMAC SHA-256)

## UI
- Project landing page: `/project/:token`
- Viewer/Uploader portal: `/portal?token=...`
- PDF rendering: PDF.js (Apache-2.0)
- Annotations: Fabric.js (MIT)

## Systemd (Example)
```
[Unit]
Description=OpenApprove
After=network.target

[Service]
Type=simple
User=openapprove
WorkingDirectory=/opt/openapprove
EnvironmentFile=/opt/openapprove/.env
ExecStart=/usr/bin/node /opt/openapprove/dist/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Docker
See `Dockerfile` and `docker-compose.yml`.

## Limitations (First Draft)
- Minimal UI and annotation tools; advanced editing and multi-page support are intentionally limited.
- Annotated PDF export is not implemented in this draft.
- Retention and deletion are API-driven; scheduling must be provided externally.

## Legal
This project includes GDPR/DSGVO-minded defaults and documentation, but it is **not a legal guarantee**. Consult legal counsel for compliance requirements.
