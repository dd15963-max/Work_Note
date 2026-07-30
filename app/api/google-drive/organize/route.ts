import { ensureSchema } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import {
  cleanupAllManagedEmptyFolders,
  loadWorkNoteDataset,
  previewAttachmentOrganization,
  previewManagedEmptyFolders,
  recentDriveOperations,
  synchronizeAttachmentFoldersForDataset,
} from "@/app/google-drive/managed-folders";
import { getSiteUser } from "@/app/site-user";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

async function currentUserEmail() {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || "";
}

export async function GET(request: Request) {
  const email = await currentUserEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  try {
    await ensureSchema();
    if (!await getDriveConnection(email)) return jsonError("Google Drive 연결이 필요합니다.", 409);
    const mode = new URL(request.url).searchParams.get("mode") || "structure";
    if (mode === "cleanup") return Response.json(await previewManagedEmptyFolders(email));
    if (mode === "migration") return Response.json(await previewAttachmentOrganization(email));
    if (mode === "logs") return Response.json({ operations: await recentDriveOperations(email) });
    const [migration, cleanup] = await Promise.all([
      previewAttachmentOrganization(email),
      previewManagedEmptyFolders(email),
    ]);
    return Response.json({ migration, cleanup });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: Request) {
  const email = await currentUserEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  try {
    await ensureSchema();
    if (!await getDriveConnection(email)) return jsonError("Google Drive 연결이 필요합니다.", 409);
    const payload = await request.json().catch(() => ({})) as { action?: string };
    const action = String(payload.action || "");
    if (action === "cleanup-preview") {
      return Response.json(await previewManagedEmptyFolders(email));
    }
    if (action === "cleanup") {
      return Response.json(await cleanupAllManagedEmptyFolders(email));
    }
    if (action === "migration-preview") {
      return Response.json(await previewAttachmentOrganization(email));
    }
    if (action === "migrate" || action === "retry") {
      const dataset = await loadWorkNoteDataset(email);
      const result = await synchronizeAttachmentFoldersForDataset(email, dataset, 500);
      const remaining = await previewAttachmentOrganization(email);
      return Response.json({ ...result, remaining });
    }
    return jsonError("지원하지 않는 Google Drive 정리 작업입니다.", 400);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
