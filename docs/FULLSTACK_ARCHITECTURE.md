# Work Note Full-stack Architecture

## Scope

This branch converts the existing React Work Note into a personal Supabase-backed application without replacing the current GitHub Pages app. The existing React UI, task editors, calendar navigation, settlement row navigation, backup center, responsive layout, and legacy compatibility migrations remain the product surface.

The company repository `carimatec-bsm/Work_Note` is explicitly outside this change.

## Existing storage audit

- Main browser dataset: `localStorage.salesNoteAppDataV1`
- Automatic snapshots: `localStorage.workNoteReactAutoSnapshotsV1`
- Attachment database: IndexedDB `salesNoteAttachmentDbV1`
- Attachment object store: `files`, key path `id`
- Record collections: `companies`, `internalContacts`, `notes`, `materialSalesNotes`, `settlementTasks`, `outputTasks`, `otherTasks`, `accounts`
- Attachment metadata remains on the owning record; original blobs are cached in IndexedDB.
- JSON, full ZIP, CSV ZIP, and Excel export continue to use the existing application code.
- Calendar navigation continues to use stable source record IDs and settlement row IDs.
- The current application implementation uses Monday through Sunday for the weekly range. This latest behavior is preserved even though an older request document mentions Sunday through Saturday.

## Runtime design

```text
Existing React UI
  -> localStorage write-through cache
  -> persistent retry queue
  -> Supabase transactional sync RPC
  -> normalized PostgreSQL tables

Attachment picker / ZIP restore
  -> IndexedDB local cache
  -> persistent attachment retry queue
  -> private Supabase Storage path: {user_id}/{attachment_id}/{filename}
  -> attachment metadata table
```

Local writes happen first so a network failure never clears the edited data. Supabase becomes authoritative after migration, while localStorage and IndexedDB remain a recovery cache. Other-device changes arrive through Supabase Realtime, focus refresh, and a 60-second visible-page refresh fallback.

## Database model

- `profiles`: allow-listed authenticated account
- `companies`: customer companies
- `company_contacts`: contacts linked to a company
- `head_office_contacts`: internal contacts
- `tasks`: equipment sales, material sales, output, and other work
- `settlements`: settlement header records
- `settlement_entries`: installment, advance deduction, and evidence-only rows
- `task_schedules`: derived dates with exact `source_local_id` and `source_row_local_id`
- `accounts`: account-note records
- `attachments`: private Storage metadata and integrity hash
- `settings`: workspace version and authoritative update timestamp
- `migration_logs`: migration batches, counts, and failures
- `activity_logs`: synchronization activity and Realtime signal

The original record shape is retained in `jsonb` for lossless compatibility, while searchable fields and parent-child relationships are normalized into columns and related tables.

## Security

- Supabase Auth is required before rendering Work Note data.
- `profiles.is_allowed` is the authoritative personal allow list.
- Every data table has `user_id` and Row Level Security.
- The browser has no physical-delete policy; normal deletion is soft deletion via `deleted_at`.
- Storage is private and restricted to the authenticated user's first path segment.
- Only the Supabase URL and anon key are used in the browser. A service-role key must never be added to Vite variables.
- Attachments are checked by size and SHA-256 when downloaded if a hash is available.

## Compatibility strategy

`loadWorkNoteData()` remains the canonical local/backup normalization path. Its migration chain preserves:

1. internal contact IDs and normalized fields
2. legacy equipment/material sales separation
3. settlement tax-invoice rows
4. settlement paid-date and advance-deduction statuses
5. required output/other titles
6. `isImportant` defaults

The server sync uses existing local IDs as `local_id` with a unique `(user_id, local_id)` constraint, making migration idempotent.