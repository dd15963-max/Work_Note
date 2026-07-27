import { database, emptyDataset, ensureSchema } from "@/db/runtime";
import { getSiteUser } from "@/app/site-user";

type JsonRecord = Record<string, unknown>;

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function nestedCount(records: JsonRecord[], key: string): number {
  return records.reduce((sum, record) => sum + asArray(record[key]).length, 0);
}

async function currentUserEmail(): Promise<string | null> {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || null;
}

async function readDataset(email: string): Promise<JsonRecord> {
  const row = await database()
    .prepare(`SELECT payload FROM work_note_datasets
      WHERE user_email = ? AND deleted_at IS NULL`)
    .bind(email)
    .first<{ payload: string }>();
  if (!row?.payload) return emptyDataset();
  try {
    return { ...emptyDataset(), ...asRecord(JSON.parse(row.payload)) };
  } catch {
    throw new Error("서버 업무 데이터의 JSON 형식이 올바르지 않습니다.");
  }
}

export async function GET(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();

    const data = await readDataset(email);
    const url = new URL(request.url);
    if (url.searchParams.get("counts") !== "1") return Response.json(data);

    const companies = asArray(data.companies);
    const internalContacts = asArray(data.internalContacts);
    const equipmentSales = asArray(data.notes);
    const materialSales = asArray(data.materialSalesNotes);
    const settlements = asArray(data.settlementTasks);
    const outputTasks = asArray(data.outputTasks);
    const otherTasks = asArray(data.otherTasks);
    const accounts = asArray(data.accounts);
    const taskSchedules = asArray(data.taskSchedules);
    const attachmentRow = await database()
      .prepare(`SELECT COUNT(*) AS count FROM work_note_attachments
        WHERE user_email = ? AND deleted_at IS NULL`)
      .bind(email)
      .first<{ count: number }>();

    const counts = {
      companies: companies.length,
      companyContacts: nestedCount(companies, "contacts"),
      internalContacts: internalContacts.length,
      equipmentSales: equipmentSales.length,
      materialSales: materialSales.length,
      settlements: settlements.length,
      settlementEntries: nestedCount(settlements, "paymentSchedule"),
      outputTasks: outputTasks.length,
      otherTasks: otherTasks.length,
      taskSchedules: taskSchedules.length,
      accounts: accounts.length,
      attachments: Number(attachmentRow?.count || 0),
      totalRecords: 0,
    };
    counts.totalRecords =
      counts.companies +
      counts.companyContacts +
      counts.internalContacts +
      counts.equipmentSales +
      counts.materialSales +
      counts.settlements +
      counts.settlementEntries +
      counts.outputTasks +
      counts.otherTasks +
      counts.taskSchedules +
      counts.accounts;
    return Response.json(counts);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function PUT(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();

    const payload = asRecord(await request.json());
    const updatedAt = String(payload.updatedAt || new Date().toISOString());
    payload.updatedAt = updatedAt;
    const serialized = JSON.stringify(payload);
    await database()
      .prepare(`INSERT INTO work_note_datasets
        (user_email, payload, data_version, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(user_email) DO UPDATE SET
          payload = excluded.payload,
          data_version = excluded.data_version,
          updated_at = excluded.updated_at,
          deleted_at = NULL`)
      .bind(
        email,
        serialized,
        String(payload.version || "sites-work-note-v1"),
        updatedAt,
      )
      .run();
    return Response.json({ ok: true, updatedAt });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const payload = asRecord(await request.json());
    await database()
      .prepare(`INSERT INTO work_note_migration_logs
        (id, user_email, payload, created_at) VALUES (?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        email,
        JSON.stringify(payload),
        new Date().toISOString(),
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE() {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const now = new Date().toISOString();
    await database().batch([
      database()
        .prepare(`UPDATE work_note_datasets SET deleted_at = ?, updated_at = ?
          WHERE user_email = ? AND deleted_at IS NULL`)
        .bind(now, now, email),
      database()
        .prepare(`UPDATE work_note_attachments SET deleted_at = ?, updated_at = ?
          WHERE user_email = ? AND deleted_at IS NULL`)
        .bind(now, now, email),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
