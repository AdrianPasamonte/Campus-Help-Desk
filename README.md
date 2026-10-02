# Campus Help Desk

Serve app.html through a local HTTP server or static website host. It connects to the configured Supabase project. Opening the file directly works for some flows, but email recovery requires an HTTP(S) address.

## Department queues

- Account access, eLMS & SIMS, and Computer lab route to IT.
- Student records & enrollment route to Registrar.
- Fees & payments route to Finance / Cashier.
- Something else / Not sure routes to Admin review.

The database derives the department from the selected support area. Staff can read their department queue and history and update unassigned tickets or their own assignments. Admins can oversee and reroute all tickets. Students can only access their own requests and replies.

## Manage staff

As an admin, open Users. When creating a Staff account, select its department. Admin accounts oversee all departments and do not require a department.

Student accounts cannot be promoted. Admins can promote an existing staff member by choosing Admin in the staff role dropdown and confirming the promotion; the department is then cleared because admins oversee all departments. For existing staff, choose Department in their row; the change saves automatically with an inline status. Use role filters and name/email search to find users. Staff without a department have no ticket queue access. When a role or department changes, assignments that no longer match return to their ticket queues. Staff should sign out and back in after a department change to refresh the interface; database restrictions use current profile settings immediately.

The two pre-existing staff accounts were left without a department. Assign their actual departments in Users. Existing tickets were retained and routed by their original categories; incompatible staff assignments were returned to the queues.

## Database and checks

The department changes have been applied to the configured Supabase project and recorded in its migration history. The SQL reference in database/department-routing.sql is intended for the original schema; do not rerun it on this already-updated project.

Run app logic checks with: node tests/department-ui.test.cjs

Database access checks are in database/department-routing-tests.sql. They create temporary test fixtures inside a transaction and roll everything back. They have been run successfully against the live schema. Test fixtures cover student privacy, department queues, assignment validation, cross-department replies, admin rerouting, role changes, and resolution reopening.

Staff/admin account creation uses the deployed create-staff-account Edge Function. It validates the caller session and current admin role, creates a new Auth user, and assigns its role server-side. Existing emails cannot be promoted. Its server-only service key is never sent to the browser.

Resolved/closed tickets are read-only, except the student confirmation/reopening workflow. Historical replies cannot be added.

Run server account-creation checks with: node tests/staff-creation.test.cjs

Browser appearance and manual account-login flows still need a visual check.

## Editable knowledge base

Admins use Manage Articles to create or edit articles, save drafts, publish, unpublish, archive, and restore drafts. Instructions are entered one per line. Publishing requires an instruction and contact guidance. A matching ticket concern and an official HTTPS guidance link are optional. Concurrent edits are detected to prevent overwriting another admin's work.

Students see published articles in Help Center; staff read the same content in Knowledge Base. Drafts and archived articles are restricted to admins by database policies. The ten existing articles were preserved. Last editor, update date, and revision are recorded by the database.

The help-articles migration is applied to the configured Supabase project. database/help-articles.sql is a reference, not a script to rerun. Permission and lifecycle tests in database/help-articles-tests.sql roll back all test fixtures. Run the editor checks with: node tests/help-articles.test.cjs

## Workflow fixes

Staff/admins mark a ticket Resolved with a resolution note. Only the requesting student can close it through Confirm fixed, or reopen it through the existing resolution response. The database rejects direct staff/admin closure. Previously closed tickets remain unchanged.

Reply loading discards results from older requests and other tickets. Sending locks the composer, preserves text on failure, and never clears the draft on a different ticket.

Save Profile persists the name to the current user's profile. Email changes use Supabase Auth confirmation; the profile email follows the confirmed Auth email through a database trigger. A name save can succeed while an email change fails, and the interface reports this explicitly. Confirmation links use the project's existing Auth Site URL settings.

Database references: database/workflow-fixes.sql and database/workflow-fixes-tests.sql. The migration is already applied; do not rerun it. Tests roll back their fixtures. Run frontend regression checks with: node tests/workflow-fixes.test.cjs

## Password recovery

Forgot password sends a Supabase Auth reset email with a redirect to the current app web URL plus ?recovery=1. Add that exact URL to Supabase Authentication > URL Configuration > Redirect URLs; configure Site URL to the app web address. Do this for each local/hosted address you use. Direct file URLs are rejected before requesting an email.

The PASSWORD_RECOVERY event opens a dedicated reset screen instead of the normal dashboard. New passwords require confirmation and a valid recovery session; successful updates sign out locally and return to login. Invalid or expired links require a new recovery email. Refreshing a reset page after its recovery link has been consumed requires reopening a fresh link.

Checks: node tests/password-recovery.test.cjs. Email delivery and redirect settings need an end-to-end check after a web URL is configured. No real recovery emails were sent during automated checks.
