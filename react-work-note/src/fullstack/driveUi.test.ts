import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AttachmentFailurePanel,
  DriveOpenButton,
  attachmentFailureCopy,
  normalizeAttachmentSyncStatus,
} from "./driveUi";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const fullstackSource = readFileSync(new URL("./FullstackRoot.tsx", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
const driveAuthSource = readFileSync(new URL("../../../app/google-drive/auth.ts", import.meta.url), "utf8");
const oauthCallbackSource = readFileSync(new URL("../../../app/api/google-drive/oauth/callback/route.ts", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const uxRefreshCss = readFileSync(new URL("../ux-refresh.css", import.meta.url), "utf8");

describe("Google Drive UI requirements", () => {
  it("[21] renders Google Drive folder opening as a formal secure button", () => {
    const html = renderToStaticMarkup(React.createElement(DriveOpenButton, {
      href: "https://drive.google.com/drive/folders/folder-1",
      label: "Google Drive 폴더 열기",
    }));
    expect(html).toContain('role="button"');
    expect(html).toContain('class="drive-open-button icon-text-button secondary"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Google Drive 폴더 열기");
  });

  it("[22] orders file-card actions as download, preview, then Drive", () => {
    const start = appSource.indexOf("function AttachmentActions(");
    const end = appSource.indexOf("function isPreviewableAttachment(", start);
    const attachmentActions = appSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(attachmentActions).toContain("<DriveOpenButton");
    expect(attachmentActions.indexOf("<Download")).toBeLessThan(attachmentActions.indexOf("<Eye"));
    expect(attachmentActions.indexOf("<Eye")).toBeLessThan(attachmentActions.indexOf("<DriveOpenButton"));
    expect(attachmentActions).toContain("disabledReason=");
  });

  it("removes cross-record file moves and right-aligns all remaining actions", () => {
    const managerStart = appSource.indexOf("function SalesFileManager(");
    const managerEnd = appSource.indexOf("function attachmentTypeGroup(", managerStart);
    const editorStart = appSource.indexOf("function AttachmentMetaEditor(");
    const editorEnd = appSource.indexOf("function createAttachmentHandlers(", editorStart);
    expect(appSource.slice(managerStart, managerEnd)).not.toContain('className="file-bulk-move"');
    expect(appSource.slice(editorStart, editorEnd)).not.toContain('className="attachment-move-row"');
    expect(uxRefreshCss).toContain("FILE_CARD_ACTIONS_START");
    expect(uxRefreshCss).toMatch(/\.attachment-card-actions\s*\{[\s\S]*justify-content:\s*flex-end/);
  });

  it("keeps settlement billing and delete controls inside separate grid columns", () => {
    expect(appSource).toContain('className="danger-button payment-row-delete"');
    expect(uxRefreshCss).toContain("SETTLEMENT_ROW_ACTIONS_START");
    expect(uxRefreshCss).toMatch(/\.payment-row > \.invoice-row-toggle,[\s\S]*min-width:\s*0/);
  });

  it("[23] keeps mobile file fields and actions from overlapping or forcing horizontal scroll", () => {
    expect(appCss).toContain("@media (max-width: 720px)");
    expect(appCss).toMatch(/\.attachment-header\s*\{[\s\S]*grid-template-columns:\s*30px minmax\(0,\s*1fr\)/);
    expect(appCss).toMatch(/\.file-bulk-actions\s*\{[\s\S]*grid-template-columns:\s*1fr/);
    expect(appCss).toContain(".attachment-actions > .drive-open-button-wrap");
    expect(appCss).toContain(".attachment-card-footer");
    expect(appCss).toContain("-webkit-line-clamp: 2");
    expect(appCss).toMatch(/\.local-settings-scroll\s*\{[\s\S]*overflow-x:\s*hidden/);
  });

  it("keeps file actions in the bottom card footer after editable metadata", () => {
    const start = appSource.indexOf("function AttachmentMetaEditor(");
    const end = appSource.indexOf("function createAttachmentHandlers(", start);
    const editor = appSource.slice(start, end);
    expect(editor.indexOf('className="attachment-edit-grid"')).toBeLessThan(
      editor.indexOf('className="attachment-card-footer"'),
    );
    expect(editor.indexOf('className="attachment-card-footer"')).toBeLessThan(
      editor.lastIndexOf("<AttachmentActions"),
    );
  });

  it("keeps synchronization and retry logs hidden until requested", () => {
    expect(fullstackSource).toContain("const [driveLogsOpen, setDriveLogsOpen] = useState(false);");
    expect(fullstackSource).toContain("driveLogsOpen && driveOperations.length > 0");
    expect(fullstackSource).toContain('aria-controls="drive-sync-retry-log"');
    expect(fullstackSource).toContain('driveLogsOpen ? "로그 접기" : "동기화·재시도 로그 보기"');
  });
  it("hard-resets revoked credentials and stale resumable sessions before reconnecting", () => {
    const reconnectStart = repositorySource.indexOf("export async function reconnectGoogleDrive");
    const reconnectBody = repositorySource.slice(reconnectStart, repositorySource.indexOf("}", reconnectStart) + 1);
    expect(reconnectBody.indexOf("await disconnectGoogleDrive()"))
      .toBeLessThan(reconnectBody.indexOf("connectGoogleDrive(returnTo)"));
    expect(driveAuthSource).toContain("encrypted_drive_session_uri = ''");
    expect(driveAuthSource).toContain("stored?.google_email === googleEmail ? stored.root_folder_id");
    expect(fullstackSource).toContain('run("reconnect"');
    expect(driveAuthSource).toContain("status = 'reconnect_required'");
    expect(driveAuthSource).toContain("error_code = '', user_message = ''");
    expect(oauthCallbackSource.indexOf("await ensureRootFolders(state.userEmail)"))
      .toBeLessThan(oauthCallbackSource.indexOf("await markDriveReconnectReady(state.userEmail)"));
    expect(appSource).toContain("void reconnectGoogleDrive(window.location.pathname");
  });

  it("keeps reconnect and disconnect controls visible outside advanced Drive management", () => {
    const cardStart = fullstackSource.indexOf('id="server-drive-settings-card"');
    const managementStart = fullstackSource.indexOf('className="settings-disclosure drive-management-disclosure"', cardStart);
    const visibleDriveControls = fullstackSource.slice(cardStart, managementStart);
    const advancedDriveControls = fullstackSource.slice(managementStart, fullstackSource.indexOf("</details>", managementStart));

    expect(cardStart).toBeGreaterThan(-1);
    expect(managementStart).toBeGreaterThan(cardStart);
    expect(visibleDriveControls).toContain("Google Drive 다시 연결");
    expect(visibleDriveControls).toContain("연결 해제");
    expect(visibleDriveControls).toContain("기존 파일과 폴더는 유지됩니다.");
    expect(advancedDriveControls).not.toContain('run("disconnect"');
    expect(uxRefreshCss).toContain("DRIVE_CONNECTION_ACTIONS_START");
  });

  it("[24] removes the fixed footer and integrates data controls into settings", () => {
    expect(appSource).not.toContain('<footer className="utility-footer"');
    expect(appSource).toContain("업무 데이터");
    expect(appSource).toContain("<LocalDataSettings");
    expect(fullstackSource).toContain('id="server-sync-status-card"');
    expect(fullstackSource).toContain('id="server-drive-settings-card"');
    expect(fullstackSource).toContain("<BackupSettingsPanel");
    expect(fullstackSource).toContain('value === undefined || value === null ? "확인 전"');
    expect(fullstackSource).toContain('formatOptionalDriveMetric(drive.mergePendingCount, "건")');
  });

  it("[25] shows cause, source, resolution, retry status, and actions on a failed file card", () => {
    const html = renderToStaticMarkup(React.createElement(AttachmentFailurePanel, {
      attachment: {
        id: "file-1",
        syncStatus: "재시도 필요" as never,
        syncErrorCode: "memory_limit",
        sourceAvailable: true,
        sourceLocation: "r2",
        retryCount: 2,
        syncFailedAt: "2026-07-31T01:02:03.000Z",
        lastRetryAt: "2026-07-31T01:04:03.000Z",
        lastRetryResult: "세션 만료",
      },
      onRetry: () => undefined,
    }));
    expect(normalizeAttachmentSyncStatus("재시도 필요")).toBe("retry_required");
    expect(normalizeAttachmentSyncStatus("저장 실패")).toBe("failed");
    expect(normalizeAttachmentSyncStatus("연결 필요")).toBe("reconnect_required");
    expect(normalizeAttachmentSyncStatus("")).toBe("local_only");
    expect(html).toContain("재시도 필요");
    expect(html).toContain("R2 원본이 안전하게 보관되어 있습니다.");
    expect(html).toContain("실패 시각");
    expect(html).toContain("재시도 횟수");
    expect(html).toContain("마지막 결과");
    expect(html).toContain("해결 방법");
    expect(html).toContain("다시 시도");
    expect(html).toContain("상세 보기");

    expect(html).toContain('class="attachment-failure-details-body"');
    expect(html).not.toContain("<details open");
  });

  it.each([
    ["WORKER_MEMORY_LIMIT", "파일 크기가 커서 기존 업로드 방식의 메모리 한도를 초과했습니다.", false],
    ["FILE_STREAM_ERROR", "파일 스트림을 전송하는 중 문제가 발생했습니다.", false],
    ["INVALID_FILE_METADATA", "파일 정보가 올바르지 않아 저장을 시작하지 못했습니다.", false],
    ["DRIVE_AUTH_EXPIRED", "Google 인증이 만료되어 Drive에 저장하지 못했습니다.", true],
    ["DRIVE_RECONNECT_REQUIRED", "Google Drive 연결이 해제되어 저장하지 못했습니다.", true],
    ["DRIVE_NOT_CONNECTED", "Google Drive 연결이 해제되어 저장하지 못했습니다.", true],
    ["DRIVE_PERMISSION_DENIED", "Google Drive에 파일을 저장할 권한이 없습니다.", true],
    ["DRIVE_FOLDER_NOT_FOUND", "파일을 저장할 Google Drive 폴더를 찾지 못했습니다.", false],
    ["DRIVE_STORAGE_QUOTA", "Google Drive 저장 공간이 부족합니다.", false],
    ["DRIVE_API_QUOTA", "Google Drive API 사용 한도에 도달했습니다.", false],
    ["NETWORK_TIMEOUT", "네트워크 응답 시간이 초과되어 저장을 완료하지 못했습니다.", false],
    ["UPLOAD_SESSION_EXPIRED", "분할 업로드 세션이 만료되었습니다.", false],
    ["DUPLICATE_OPERATION", "같은 파일의 저장 작업이 이미 진행 중이거나 완료되었습니다.", false],
    ["R2_SOURCE_MISSING", "보관된 원본 파일을 찾지 못했습니다.", false],
  ] as const)("normalizes persisted server error %s to the matching UI guidance", (code, message, reconnect) => {
    expect(attachmentFailureCopy({ syncErrorCode: code })).toEqual(expect.objectContaining({
      message,
      reconnect,
    }));
  });

  it("recognizes Google's revoked-token detail in existing unknown failure records", () => {
    expect(attachmentFailureCopy({
      syncErrorCode: "unknown",
      syncErrorMessage: "Google Drive 저장 중 알 수 없는 오류가 발생했습니다. 원본은 삭제되지 않았습니다.",
      syncErrorDetail: "GoogleDriveHttpError: Token has been expired or revoked.",
    }).reconnect).toBe(true);
    expect(attachmentFailureCopy({
      syncErrorCode: "unknown",
      syncErrorDetail: "GoogleDriveHttpError: Token has been expired or revoked.",
    }).message).toContain("인증이 만료");
  });

  it("keeps canonical lowercase and legacy server aliases compatible", () => {
    expect(attachmentFailureCopy({ syncErrorCode: "memory_limit" }).message)
      .toContain("메모리 한도");
    expect(attachmentFailureCopy({ syncErrorCode: "GOOGLE_AUTH_EXPIRED" }).reconnect)
      .toBe(true);
    expect(attachmentFailureCopy({
      syncErrorCode: "UNRECOGNIZED_CODE",
      syncStatus: "RECONNECT_REQUIRED" as never,
    }).reconnect).toBe(true);
  });

  it("renders reconnect for uppercase permission errors and precise storage recovery copy", () => {
    const permissionHtml = renderToStaticMarkup(React.createElement(AttachmentFailurePanel, {
      attachment: {
        id: "permission-file",
        syncStatus: "FAILED" as never,
        syncErrorCode: "DRIVE_PERMISSION_DENIED",
      },
      onRetry: () => undefined,
      onReconnect: () => undefined,
    }));
    const storageHtml = renderToStaticMarkup(React.createElement(AttachmentFailurePanel, {
      attachment: {
        id: "quota-file",
        syncStatus: "FAILED" as never,
        syncErrorCode: "DRIVE_STORAGE_QUOTA",
      },
      onRetry: () => undefined,
    }));

    expect(permissionHtml).toContain("Google Drive 다시 연결");
    expect(storageHtml).toContain("Google Drive 저장 공간을 확보한 뒤 다시 시도해 주세요.");
  });
});
