# Google Drive attachment storage

## Architecture

- Work Note business data remains in the Sites D1 `work_note_datasets` table.
- New attachment originals are private files in the connected user's Google Drive.
- D1 stores file IDs and metadata only.
- Existing R2 attachments remain readable as `site_storage` until the user migrates them.
- IndexedDB remains a local cache and retry source; it is not the shared source of truth.

## OAuth configuration

Google Cloud project: `work-note-504001`

Web application origin:

```text
https://work-note-private.dulbit.chatgpt.site
```

Redirect URI:

```text
https://work-note-private.dulbit.chatgpt.site/api/google-drive/oauth/callback
```

Scopes:

```text
openid
email
https://www.googleapis.com/auth/drive.file
```

The OAuth app must include every Google account used during Testing as a test user. Google Testing-mode refresh tokens can expire after seven days, so switch the OAuth app to Production before relying on long-lived connections.

## Sites environment variables

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY
```

`GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` must be Sites secrets. Never store them in Git, browser storage, or client code. The encryption key is a base64url-encoded 32-byte value.

The Drive root folder ID is intentionally not an environment variable. Each Work Note user connects a separate Google account, and that account's root folder ID is stored in D1.

## Drive folder layout

```text
Work Note/
  업무/<year>/<owner-id>/
  고객사/<year>/<owner-id>/
  일정/<year>/<owner-id>/
  정산/<year>/<owner-id>/
  공용 파일함/<year>/<owner-id>/
  미분류/<year>/<owner-id>/
```

Connections use Drive file IDs, so a user can rename or move a file in Drive without breaking the Work Note record.

## Existing file migration

The Settings panel shows the number of existing Site files. Migration runs in batches of 25:

1. Read the R2 original.
2. Upload to Google Drive.
3. Verify the Drive file size.
4. Update D1 to `google_drive`.
5. Retain the original R2 storage key and object.

Failed items stay on `site_storage`. No automatic deletion is performed.

## Recovery behavior

If Drive upload succeeds but the D1 update fails, Work Note sends the new Drive file to Trash. If cleanup also fails, it writes a row to `work_note_file_recovery` for later inspection.

## GitHub Pages

GitHub Pages is static and cannot safely hold Google OAuth client secrets or refresh tokens. Its portable build keeps IndexedDB attachment behavior. The authenticated Google Drive workflow runs only on the private ChatGPT Site backend. Shared UI changes remain synchronized across both builds.
