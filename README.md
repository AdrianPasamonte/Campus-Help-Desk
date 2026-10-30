# HelpDesk Pro

A campus help-desk and ticketing system for Students, Staff, and Admin.

**Website:** https://adrianpasamonte.github.io/Campus-Help-Desk/app.html

## Features

- Student Help Center with searchable articles and guided support requests.
- Department routing to IT, Registrar, Finance / Cashier, or Admin review.
- Role-based ticket access, assignment, replies, screenshots, and history.
- Resolution notes with Student confirmation or reopening.
- Admin account management, article publishing, and request reports.
- In-app notifications refreshed every 20 seconds while the page is visible.

## Run locally

Use Node.js 22 or newer. Double-click `Start-HelpDesk.cmd`, or run:

```sh
npm start
```

Open http://127.0.0.1:5504/app.html and keep the server running. Native JavaScript modules require HTTP(S); do not open `app.html` directly through `file://`.

No npm installation or frontend build is needed. Internet access is required for the Supabase SDK and backend. The hosted website works without a local server.

## Source structure

| Location | Purpose |
| --- | --- |
| `app.html` | Screens, forms, navigation, and dialogs |
| `css/` | Shared and feature styles, including responsive rules |
| `js/main.js` | Startup and module wiring |
| `js/core/` | Client, state, session, navigation, permissions, refresh |
| `js/features/` | Account, ticket, knowledge, notification, user, report workflows |
| `js/ui/` | Reusable display helpers and dialog wrappers |
| `assets/` | Images and icons |
| `tools/` | Local preview, launcher, and syntax checking |
| `tests/` | Small dependency-free permission, preview, and startup tests |

## Backend

This frontend uses the existing Supabase project configured in `js/core/client.js`. Authentication, database policies/triggers, private storage, and the deployed account-creation function remain backend responsibilities. A frontend publishable key is included; server secrets must never be placed in browser code.

Local and hosted versions share the same backend, so normal submissions save real records there. Backend schema/function deployment is not included in this frontend repository. Email recovery and email-change confirmation depend on backend settings and delivery.

## Checks

```sh
npm run check
npm test
```

These checks cover syntax and selected local behavior; they do not certify live email delivery or all database permissions. Tests are development support and are not loaded by the website.
