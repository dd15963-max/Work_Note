import { database, ensureSchema } from "@/db/runtime";
import {
  accessTokenForUser,
  getDriveConnection,
  hasGoogleSheetsScope,
  invalidateDriveAccessToken,
} from "@/app/google-drive/auth";

import {
  DEFAULT_TEAM_SHEET_NAME,
  TEAM_SHEET_HEADERS,
  TEAM_SHEET_ID_COLUMN,
  equipmentSalesRow,
  findSharedIdRows,
  parseSpreadsheetId,
  quoteSheetName,
  validateHeaderRow,
  type EquipmentSalesShareNote,
  type TeamShareSettings,
} from "./team-share-contract";

export {
  DEFAULT_TEAM_SHEET_NAME,
  TEAM_SHEET_HEADERS,
  TEAM_SHEET_ID_COLUMN,
  equipmentSalesRow,
  findSharedIdRows,
  parseSpreadsheetId,
  quoteSheetName,
  validateHeaderRow,
  type EquipmentSalesShareNote,
  type TeamShareSettings,
} from "./team-share-contract";

type SettingsRow = {
  spreadsheet_id: string;
  sheet_name: string;
  display_name: string;
  verified_at: string;
};

type LedgerRow = {
  shared_id: string;
  status: string;
  lock_token: string;
  lock_expires_at: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function spreadsheetUrl(spreadsheetId: string): string {
  return spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : "";
}

async function settingsRow(userEmail: string): Promise<SettingsRow | null> {
  await ensureSchema();
  return database().prepare(`SELECT spreadsheet_id, sheet_name, display_name, verified_at
    FROM work_note_team_share_settings WHERE user_email = ?`)
    .bind(userEmail)
    .first<SettingsRow>();
}

export async function getTeamShareSettings(userEmail: string): Promise<TeamShareSettings> {
  const [row, connection] = await Promise.all([
    settingsRow(userEmail),
    getDriveConnection(userEmail),
  ]);
  return {
    configured: Boolean(row?.spreadsheet_id),
    spreadsheetId: row?.spreadsheet_id || "",
    spreadsheetUrl: spreadsheetUrl(row?.spreadsheet_id || ""),
    sheetName: row?.sheet_name || DEFAULT_TEAM_SHEET_NAME,
    displayName: row?.display_name || "",
    verifiedAt: row?.verified_at || "",
    googleConnected: Boolean(connection),
    sheetsAuthorized: Boolean(connection && hasGoogleSheetsScope(connection.scope)),
    googleEmail: connection?.googleEmail || "",
  };
}

export async function saveTeamShareSettings(
  userEmail: string,
  input: { spreadsheet: string; sheetName?: string; displayName?: string },
): Promise<TeamShareSettings> {
  await ensureSchema();
  const spreadsheetId = parseSpreadsheetId(input.spreadsheet);
  const sheetName = text(input.sheetName) || DEFAULT_TEAM_SHEET_NAME;
  const displayName = text(input.displayName);
  if (sheetName.length > 100) throw new Error("시트 탭 이름이 너무 깁니다.");
  if (displayName.length > 80) throw new Error("담당자 이름이 너무 깁니다.");
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO work_note_team_share_settings
    (user_email, spreadsheet_id, sheet_name, display_name, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', ?, ?)
    ON CONFLICT(user_email) DO UPDATE SET
      spreadsheet_id = excluded.spreadsheet_id,
      sheet_name = excluded.sheet_name,
      display_name = excluded.display_name,
      verified_at = CASE
        WHEN spreadsheet_id = excluded.spreadsheet_id AND sheet_name = excluded.sheet_name
        THEN verified_at ELSE '' END,
      updated_at = excluded.updated_at`)
    .bind(userEmail, spreadsheetId, sheetName, displayName, now, now)
    .run();
  return getTeamShareSettings(userEmail);
}

async function sheetsError(response: Response): Promise<Error> {
  let message = `Google Sheets 요청 실패 (${response.status})`;
  try {
    const payload = await response.json() as { error?: { message?: string } };
    if (payload.error?.message) message = payload.error.message;
  } catch { /* Keep status fallback. */ }
  if (response.status === 401) message = "Google Sheets 권한이 만료되었습니다. 다시 권한을 승인해 주세요.";
  if (response.status === 403) message = "이 Google 계정에 시트 편집 권한이 없거나 Sheets 권한 승인이 필요합니다.";
  if (response.status === 404) message = "Google Sheets 파일 또는 지정한 탭을 찾지 못했습니다.";
  return new Error(message);
}

async function sheetsFetch(userEmail: string, url: string, init: RequestInit = {}): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await accessTokenForUser(userEmail)}`);
    const response = await fetch(url, { ...init, headers });
    if (response.ok) return response;
    last = response;
    if (response.status === 401 && attempt === 0) {
      await invalidateDriveAccessToken(userEmail);
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw await sheetsError(last!);
}

function valuesUrl(spreadsheetId: string, range: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
}

async function readValues(userEmail: string, spreadsheetId: string, range: string): Promise<unknown[][]> {
  const response = await sheetsFetch(userEmail, valuesUrl(spreadsheetId, range));
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values || [];
}

async function writeValues(
  userEmail: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  await sheetsFetch(userEmail, `${valuesUrl(spreadsheetId, range)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

async function appendValues(
  userEmail: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  await sheetsFetch(
    userEmail,
    `${valuesUrl(spreadsheetId, range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    },
  );
}

async function updateSpreadsheet(
  userEmail: string,
  spreadsheetId: string,
  requests: Record<string, unknown>[],
): Promise<void> {
  await sheetsFetch(
    userEmail,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
  );
}

async function verifySheetAccess(
  userEmail: string,
  setting: SettingsRow,
): Promise<void> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("먼저 Google 계정을 연결해 주세요.");
  if (!hasGoogleSheetsScope(connection.scope)) {
    throw new Error("Google Sheets 권한 승인이 필요합니다. ‘Google Sheets 권한 승인’을 눌러 주세요.");
  }
  const response = await sheetsFetch(
    userEmail,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(setting.spreadsheet_id)}?fields=spreadsheetId,sheets.properties(sheetId,title,gridProperties.columnCount)`,
  );
  const payload = await response.json() as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }>;
  };
  const targetSheet = (payload.sheets || []).find(
    (sheet) => text(sheet.properties?.title) === setting.sheet_name,
  );
  if (targetSheet?.properties?.sheetId === undefined) {
    throw new Error(`‘${setting.sheet_name}’ 탭을 찾지 못했습니다. 탭 이름을 그대로 확인해 주세요.`);
  }

  const sheetId = targetSheet.properties.sheetId;
  const columnCount = Number(targetSheet.properties.gridProperties?.columnCount || 0);
  const requests: Record<string, unknown>[] = [];
  if (columnCount < 13) {
    requests.push({
      appendDimension: {
        sheetId,
        dimension: "COLUMNS",
        length: 13 - columnCount,
      },
    });
  }
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  });
  await updateSpreadsheet(userEmail, setting.spreadsheet_id, requests);

  const headerRange = `${quoteSheetName(setting.sheet_name)}!A1:M1`;
  const headerValues = await readValues(userEmail, setting.spreadsheet_id, headerRange);
  const headerState = validateHeaderRow(headerValues);
  if (headerState === "empty") {
    await writeValues(userEmail, setting.spreadsheet_id, headerRange, [[...TEAM_SHEET_HEADERS]]);
  } else if (headerState === "needs_shared_id") {
    await writeValues(
      userEmail,
      setting.spreadsheet_id,
      `${quoteSheetName(setting.sheet_name)}!${TEAM_SHEET_ID_COLUMN}1`,
      [[TEAM_SHEET_HEADERS[12]]],
    );
  }
}

export async function testTeamShareConnection(userEmail: string): Promise<TeamShareSettings> {
  const setting = await settingsRow(userEmail);
  if (!setting) throw new Error("공유할 Google Sheets 주소를 먼저 저장해 주세요.");
  await verifySheetAccess(userEmail, setting);
  const now = new Date().toISOString();
  await database().prepare(`UPDATE work_note_team_share_settings
    SET verified_at = ?, updated_at = ? WHERE user_email = ?`)
    .bind(now, now, userEmail)
    .run();
  return getTeamShareSettings(userEmail);
}

export async function upsertEquipmentSalesShare(
  userEmail: string,
  note: EquipmentSalesShareNote,
): Promise<{ sharedId: string; rowNumber: number; syncedAt: string; operation: "append" | "update" }> {
  await ensureSchema();
  const taskLocalId = text(note.id);
  const sharedId = text(note.sharedId);
  if (!taskLocalId || !sharedId) throw new Error("공유 업무 식별자가 없습니다.");
  const setting = await settingsRow(userEmail);
  if (!setting) throw new Error("팀 공유 설정을 먼저 완료해 주세요.");

  const existing = await database().prepare(`SELECT shared_id, status, lock_token, lock_expires_at
    FROM work_note_team_share_syncs
    WHERE user_email = ? AND task_type = 'equipment_sales' AND task_local_id = ?`)
    .bind(userEmail, taskLocalId)
    .first<LedgerRow>();
  if (existing && existing.shared_id !== sharedId) {
    throw new Error("이 업무는 이미 다른 공유 ID로 등록되어 있습니다.");
  }

  const lockToken = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockExpiresAt = new Date(now.getTime() + 60_000).toISOString();
  let hadLedger = Boolean(existing);

  if (!existing) {
    try {
      await database().prepare(`INSERT INTO work_note_team_share_syncs
        (user_email, task_type, task_local_id, shared_id, spreadsheet_id, sheet_name,
          status, lock_token, lock_expires_at, last_error, last_synced_at, created_at, updated_at)
        VALUES (?, 'equipment_sales', ?, ?, ?, ?, 'syncing', ?, ?, '', '', ?, ?)`)
        .bind(userEmail, taskLocalId, sharedId, setting.spreadsheet_id, setting.sheet_name,
          lockToken, lockExpiresAt, nowIso, nowIso)
        .run();
    } catch {
      const raced = await database().prepare(`SELECT shared_id, status, lock_token, lock_expires_at
        FROM work_note_team_share_syncs
        WHERE user_email = ? AND task_type = 'equipment_sales' AND task_local_id = ?`)
        .bind(userEmail, taskLocalId)
        .first<LedgerRow>();
      if (!raced || raced.shared_id !== sharedId) {
        throw new Error("같은 공유 ID가 이미 다른 업무에서 사용 중입니다.");
      }
      hadLedger = true;
    }
  }

  if (hadLedger) {
    const acquired = await database().prepare(`UPDATE work_note_team_share_syncs
      SET status = 'syncing', lock_token = ?, lock_expires_at = ?,
        spreadsheet_id = ?, sheet_name = ?, last_error = '', updated_at = ?
      WHERE user_email = ? AND task_type = 'equipment_sales' AND task_local_id = ?
        AND (lock_token = '' OR lock_expires_at <= ?)`)
      .bind(lockToken, lockExpiresAt, setting.spreadsheet_id, setting.sheet_name,
        nowIso, userEmail, taskLocalId, nowIso)
      .run();
    if (!Number(acquired.meta?.changes || 0)) {
      throw new Error("이미 이 업무를 공유하는 중입니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  try {
    await verifySheetAccess(userEmail, setting);
    const idRange = `${quoteSheetName(setting.sheet_name)}!${TEAM_SHEET_ID_COLUMN}2:${TEAM_SHEET_ID_COLUMN}`;
    const matchedRows = findSharedIdRows(
      await readValues(userEmail, setting.spreadsheet_id, idRange),
      sharedId,
    );
    if (matchedRows.length > 1) {
      throw new Error("시트에 같은 sharedId가 여러 개 있습니다. 중복 행을 확인해 주세요.");
    }
    if (!hadLedger && matchedRows.length === 1) {
      throw new Error("이 sharedId가 시트에 이미 존재합니다. 원본 업무에서 다시 시도해 주세요.");
    }

    const connection = await getDriveConnection(userEmail);
    const row = equipmentSalesRow(note, connection?.googleEmail || userEmail);
    const operation = matchedRows.length === 1 ? "update" : "append";
    let rowNumber = matchedRows[0] || 0;
    if (operation === "update") {
      await writeValues(
        userEmail,
        setting.spreadsheet_id,
        `${quoteSheetName(setting.sheet_name)}!A${rowNumber}:M${rowNumber}`,
        [row],
      );
    } else {
      await appendValues(
        userEmail,
        setting.spreadsheet_id,
        `${quoteSheetName(setting.sheet_name)}!A:M`,
        [row],
      );
      const rowsAfterAppend = findSharedIdRows(
        await readValues(userEmail, setting.spreadsheet_id, idRange),
        sharedId,
      );
      if (rowsAfterAppend.length !== 1) {
        throw new Error("공유 행을 기록했지만 결과를 확인하지 못했습니다. 다시 시도해 주세요.");
      }
      rowNumber = rowsAfterAppend[0];
    }

    const syncedAt = new Date().toISOString();
    await database().prepare(`UPDATE work_note_team_share_syncs
      SET status = 'synced', lock_token = '', lock_expires_at = '',
        last_error = '', last_synced_at = ?, updated_at = ?
      WHERE user_email = ? AND task_type = 'equipment_sales' AND task_local_id = ?
        AND lock_token = ?`)
      .bind(syncedAt, syncedAt, userEmail, taskLocalId, lockToken)
      .run();
    return { sharedId, rowNumber, syncedAt, operation };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    await database().prepare(`UPDATE work_note_team_share_syncs
      SET status = 'failed', lock_token = '', lock_expires_at = '',
        last_error = ?, updated_at = ?
      WHERE user_email = ? AND task_type = 'equipment_sales' AND task_local_id = ?
        AND lock_token = ?`)
      .bind(message, failedAt, userEmail, taskLocalId, lockToken)
      .run();
    throw error;
  }
}
