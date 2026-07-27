import { database, ensureSchema, fileBucket } from "@/db/runtime";
import { getSiteUser } from "@/app/site-user";

type AttachmentRow = {
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size: string;
  sha256: string | null;
  metadata_json: string;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

async function currentUserEmail(): Promise<string | null> {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || null;
}

function cleanId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

async function ownerKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function findAttachment(
  email: string,
  id: string,
): Promise<AttachmentRow | null> {
  return database()
    .prepare(`SELECT storage_key, file_name, mime_type, file_size, sha256,
      metadata_json FROM work_note_attachments
      WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
    .bind(email, id)
    .first<AttachmentRow>();
}

export async function GET(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();

    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return jsonError("첨부파일 ID가 필요합니다.", 400);
    const row = await findAttachment(email, id);
    if (!row) return jsonError("첨부파일을 찾을 수 없습니다.", 404);

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    if (url.searchParams.get("metadata") === "1") {
      return Response.json({
        ...metadata,
        id,
        fileName: row.file_name,
        fileType: row.mime_type,
        fileSize: Number(row.file_size || 0),
        sha256: row.sha256 || "",
      });
    }

    const object = await fileBucket().get(row.storage_key);
    if (!object) return jsonError("첨부 원본 파일을 찾을 수 없습니다.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": row.mime_type || "application/octet-stream",
        "Content-Length": row.file_size || String(object.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function PUT(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();

    const form = await request.formData();
    const id = String(form.get("id") || "");
    const file = form.get("file");
    if (!id || !(file instanceof File)) {
      return jsonError("첨부파일 ID와 원본 파일이 필요합니다.", 400);
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(String(form.get("metadata") || "{}")) as Record<string, unknown>;
    } catch {
      return jsonError("첨부파일 메타데이터 형식이 올바르지 않습니다.", 400);
    }

    const fileName = String(
      metadata.fileName || metadata.name || file.name || "attachment",
    );
    const mimeType = String(
      metadata.fileType || file.type || "application/octet-stream",
    );
    const storageKey =
      `users/${await ownerKey(email)}/attachments/${cleanId(id)}`;
    await fileBucket().put(storageKey, file.stream(), {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `attachment; filename="${cleanId(fileName)}"`,
      },
      customMetadata: {
        localId: id.slice(0, 180),
      },
    });

    const safeMetadata = { ...metadata };
    delete safeMetadata.blob;
    const now = new Date().toISOString();
    await database()
      .prepare(`INSERT INTO work_note_attachments
        (user_email, local_id, owner_kind, owner_local_id, storage_key,
          file_name, mime_type, file_size, sha256, metadata_json, updated_at,
          deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(user_email, local_id) DO UPDATE SET
          owner_kind = excluded.owner_kind,
          owner_local_id = excluded.owner_local_id,
          storage_key = excluded.storage_key,
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          file_size = excluded.file_size,
          sha256 = excluded.sha256,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at,
          deleted_at = NULL`)
      .bind(
        email,
        id,
        String(metadata.ownerType || metadata.backupOwnerType || "unknown"),
        String(metadata.ownerId || metadata.noteId || metadata.backupOwnerId || ""),
        storageKey,
        fileName,
        mimeType,
        String(file.size),
        String(metadata.sha256 || "") || null,
        JSON.stringify(safeMetadata),
        now,
      )
      .run();
    return Response.json({ ok: true, id, updatedAt: now });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return jsonError("첨부파일 ID가 필요합니다.", 400);
    const row = await findAttachment(email, id);
    if (row) await fileBucket().delete(row.storage_key);
    await database()
      .prepare(`UPDATE work_note_attachments SET deleted_at = ?, updated_at = ?
        WHERE user_email = ? AND local_id = ?`)
      .bind(new Date().toISOString(), new Date().toISOString(), email, id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
