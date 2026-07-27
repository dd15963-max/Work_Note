# Safe Data Migration and Rollback

## Before starting

1. Open the current Work Note at the existing personal URL.
2. Run `첨부 원본 점검`.
3. Create `전체 백업 ZIP` and keep it outside the repository.
4. Do not clear browser data, localStorage, or IndexedDB.
5. Keep the current personal GitHub Pages app available throughout verification.

## Path A: same browser origin

Use this when the full-stack preview is hosted under the same `dd15963-max.github.io` origin.

1. Log in to the preview.
2. The app checks `salesNoteAppDataV1` and `salesNoteAttachmentDbV1` without deleting either.
3. Review customer, task, settlement, schedule, and attachment counts.
4. Click `서버로 안전하게 이전`.
5. A pre-migration JSON download is created automatically.
6. Records are transactionally upserted by existing ID.
7. IndexedDB blobs upload to the private Storage bucket.
8. Server counts are compared with local counts.
9. Retry only failed attachments when needed.
10. Local data remains intact after success until manually cleared.

## Path B: different origin such as Vercel

A different website origin cannot read GitHub Pages localStorage or IndexedDB. This is browser security behavior, not a Work Note limitation.

1. Export `전체 백업 ZIP` from the current app.
2. Log in to the new full-stack URL.
3. Open Settings, then `전체 백업·복원 센터`.
4. On an empty server choose `ZIP 교체`.
5. Review the import preview and enter `서버 전체 교체`.
6. The new app makes a pre-replace ZIP backup of its current state and restores the selected ZIP.
7. Wait for the sync indicator to show `동기화 완료`.
8. Compare counts and inspect several linked records and attachments.

## Backup import modes

- `병합`: adds new records and updates matching records while retaining server-only records.
- `동일 ID만`: updates only records whose IDs already exist; no new top-level records are added.
- `교체`: replaces the workspace record set. On a server-connected app it requires typing `서버 전체 교체` and creates a full ZIP first.

All modes use the existing backup normalization chain. ZIP restores also queue original files for Supabase Storage upload.

## Required spot checks

- Equipment and material sales records
- Output and other task titles
- Customer and internal-contact links
- Settlement installment and advance-deduction rows
- Tax-invoice/card-payment status and planned dates
- Calendar navigation to exact settlement row
- Important flags and completed status
- Attachment preview and download on a second device
- JSON, ZIP, CSV ZIP, and Excel export
- Mobile layout

## Failure behavior

- A failed dataset save stays in `workNotePendingServerSyncV1`.
- Failed attachment uploads stay in `workNotePendingAttachmentSyncV1`.
- Failed attachment soft deletes stay in `workNotePendingAttachmentDeleteV1`.
- Reconnection retries queues before loading the server dataset.
- Closing the page with pending saves or a dirty editor triggers a browser warning.
- Local source data is never automatically deleted.

## Rollback

1. Stop using the preview URL.
2. Continue using the unchanged existing GitHub Pages app.
3. Import the pre-migration/full ZIP backup there if needed.
4. Do not drop the Supabase project until all backup checks are complete.
5. Soft-deleted server rows remain recoverable by an administrator by clearing `deleted_at`; no browser client has physical-delete permission.

The company repository is not part of this migration and must remain untouched unless explicitly requested later.