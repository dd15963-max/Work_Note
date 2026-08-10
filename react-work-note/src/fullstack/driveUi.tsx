import {
  AlertTriangle,
  FolderOpen,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { normalizeDriveSyncErrorCode } from "../../../app/google-drive/error-code-contract";
import type {
  AttachmentRecord,
  AttachmentRetryStage,
  AttachmentSyncStatus,
  DriveSyncErrorCode,
} from "./types";

export type DriveOpenButtonProps = {
  href?: string;
  label: string;
  disabledReason?: string;
  compact?: boolean;
  className?: string;
};

export function DriveOpenButton({
  href,
  label,
  disabledReason = "폴더 정보를 불러오지 못했습니다.",
  compact = false,
  className = "",
}: DriveOpenButtonProps) {
  const classes = [
    "drive-open-button",
    "icon-text-button",
    "secondary",
    compact ? "is-compact" : "",
    className,
  ].filter(Boolean).join(" ");

  if (!href) {
    return (
      <span className="drive-open-button-wrap">
        <button
          type="button"
          className={classes}
          disabled
          title={disabledReason}
          aria-label={`${label}: ${disabledReason}`}
        >
          <FolderOpen size={15} aria-hidden="true" />
          {!compact && label}
        </button>
        {!compact && <small className="drive-open-disabled-reason">{disabledReason}</small>}
      </span>
    );
  }

  return (
    <a
      className={classes}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      role="button"
      title={label}
    >
      <FolderOpen size={15} aria-hidden="true" />
      {!compact && label}
    </a>
  );
}

type FailureCopy = {
  message: string;
  resolution: string;
  reconnect: boolean;
};

const FAILURE_COPY: Partial<Record<DriveSyncErrorCode, FailureCopy>> = {
  memory_limit: {
    message: "파일 크기가 커서 기존 업로드 방식의 메모리 한도를 초과했습니다.",
    resolution: "원본을 확인한 뒤 분할 업로드 방식으로 다시 시도할 수 있습니다.",
    reconnect: false,
  },
  stream_error: {
    message: "파일 스트림을 전송하는 중 문제가 발생했습니다.",
    resolution: "원본 보관 상태를 확인한 뒤 다시 시도해 주세요.",
    reconnect: false,
  },
  file_too_large: {
    message: "파일 크기 정보를 확인하지 못해 업로드를 완료하지 못했습니다.",
    resolution: "파일 정보와 원본 상태를 새로고침한 뒤 다시 시도해 주세요.",
    reconnect: false,
  },
  auth_expired: {
    message: "Google 인증이 만료되어 Drive에 저장하지 못했습니다.",
    resolution: "Google Drive 계정을 다시 연결한 뒤 재시도해 주세요.",
    reconnect: true,
  },
  drive_disconnected: {
    message: "Google Drive 연결이 해제되어 저장하지 못했습니다.",
    resolution: "Google Drive 연결을 완료한 뒤 다시 시도해 주세요.",
    reconnect: true,
  },
  permission_denied: {
    message: "Google Drive에 파일을 저장할 권한이 없습니다.",
    resolution: "Google Drive 연결 권한을 다시 확인해 주세요.",
    reconnect: true,
  },
  folder_not_found: {
    message: "파일을 저장할 Google Drive 폴더를 찾지 못했습니다.",
    resolution: "관리 폴더를 복구한 뒤 다시 시도할 수 있습니다.",
    reconnect: false,
  },
  storage_quota_exceeded: {
    message: "Google Drive 저장 공간이 부족합니다.",
    resolution: "Google Drive 저장 공간을 확보한 뒤 다시 시도해 주세요.",
    reconnect: false,
  },
  api_quota_exceeded: {
    message: "Google Drive API 사용 한도에 도달했습니다.",
    resolution: "잠시 후 다시 시도해 주세요.",
    reconnect: false,
  },
  network_timeout: {
    message: "네트워크 응답 시간이 초과되어 저장을 완료하지 못했습니다.",
    resolution: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
    reconnect: false,
  },
  upload_session_expired: {
    message: "분할 업로드 세션이 만료되었습니다.",
    resolution: "새 업로드 세션을 만들어 안전하게 다시 시도할 수 있습니다.",
    reconnect: false,
  },
  duplicate_operation: {
    message: "같은 파일의 저장 작업이 이미 진행 중이거나 완료되었습니다.",
    resolution: "Drive 상태를 새로고침해 기존 파일 연결 여부를 확인해 주세요.",
    reconnect: false,
  },
  source_missing: {
    message: "보관된 원본 파일을 찾지 못했습니다.",
    resolution: "로컬 또는 백업 원본을 확인한 뒤 다시 업로드해 주세요.",
    reconnect: false,
  },
  invalid_file: {
    message: "파일 정보가 올바르지 않아 저장을 시작하지 못했습니다.",
    resolution: "파일을 다시 선택하거나 파일 정보를 확인해 주세요.",
    reconnect: false,
  },
};

const STAGE_LABELS: Partial<Record<AttachmentRetryStage, string>> = {
  checking_source: "원본 파일 확인 중",
  checking_drive: "Google Drive 연결 확인 중",
  creating_session: "업로드 세션 생성 중",
  uploading_source: "원본 분할 전송 중",
  creating_drive_session: "Google Drive 업로드 세션 생성 중",
  uploading_chunks: "분할 업로드 중",
  finalizing: "Drive 저장 완료 처리 중",
};

export function normalizeAttachmentSyncStatus(value: unknown): AttachmentSyncStatus {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (["local_only", "pending", "uploading", "synced", "failed", "retry_required", "reconnect_required"].includes(normalized)) {
    return normalized as AttachmentSyncStatus;
  }
  if (["재시도 필요", "재시도필요", "다시 시도 필요"].includes(raw)) return "retry_required";
  if (["연결 필요", "연결필요", "연결 끊김", "다시 연결 필요"].includes(raw)) return "reconnect_required";
  if (["저장 실패", "업로드 실패", "Drive 저장 실패", "동기화 실패", "실패"].includes(raw)) return "failed";
  if (["동기화 중", "업로드 중", "저장 중"].includes(raw)) return "uploading";
  if (["동기화 완료", "저장 완료", "업로드 완료", "완료"].includes(raw)) return "synced";
  if (["대기", "대기 중", "저장 대기"].includes(raw)) return "pending";
  if (["로컬 전용", "이 기기"].includes(raw)) return "local_only";
  return "local_only";
}

export function isFailedAttachmentStatus(value: unknown): boolean {
  return ["failed", "retry_required", "reconnect_required"].includes(
    normalizeAttachmentSyncStatus(value),
  );
}

export function retryStageLabel(stage: unknown): string {
  return STAGE_LABELS[String(stage || "") as AttachmentRetryStage]
    || String(stage || "")
    || "재시도 준비 중";
}

export function attachmentFailureCopy(attachment: Partial<AttachmentRecord>): FailureCopy {
  const code = normalizeDriveSyncErrorCode(
    attachment.syncErrorCode
      || attachment.errorCode
      || "",
  );
  const normalizedStatus = normalizeAttachmentSyncStatus(
    attachment.syncStatus || attachment.uploadStatus,
  );
  const technicalDetail = String(attachment.syncErrorDetail || attachment.uploadError || "");
  const revokedToken = /token (?:has been )?expired|expired or revoked|token.*revoked|invalid_grant/i.test(technicalDetail);
  const fallback = revokedToken
    ? FAILURE_COPY.auth_expired!
    : FAILURE_COPY[code] || {
      message: String(attachment.syncErrorMessage || attachment.uploadError || "Google Drive 저장을 완료하지 못했습니다."),
      resolution: "오류 상태를 새로고침한 뒤 다시 시도해 주세요.",
      reconnect: normalizedStatus === "reconnect_required",
    };
  return {
    message: revokedToken ? fallback.message : String(attachment.syncErrorMessage || fallback.message),
    resolution: String(attachment.resolution || fallback.resolution),
    reconnect: fallback.reconnect || normalizedStatus === "reconnect_required",
  };
}

function formatFailureTime(value: unknown): string {
  if (!value) return "기록 없음";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("ko-KR");
}

export function AttachmentFailurePanel({
  attachment,
  retrying = false,
  onRetry,
  onReconnect,
}: {
  attachment: Partial<AttachmentRecord>;
  retrying?: boolean;
  onRetry?: () => void;
  onReconnect?: () => void;
}) {
  const status = normalizeAttachmentSyncStatus(attachment.syncStatus || attachment.uploadStatus || "failed");
  const copy = attachmentFailureCopy(attachment);
  const sourceLocation = String(attachment.sourceLocation || "unknown");
  const sourceCopy = sourceLocation === "r2"
    ? "R2 원본이 안전하게 보관되어 있습니다."
    : sourceLocation === "local"
      ? "이 기기의 안전 저장소에 원본이 보관되어 있습니다."
      : "원본 보관 위치를 확인 중입니다.";
  const progress = attachment.syncProgress || {};
  const total = Number(progress.totalBytes || attachment.fileSize || 0);
  const processed = Number(progress.processedBytes || 0);
  const percent = total > 0
    ? Math.max(0, Math.min(100, Math.round((processed / total) * 100)))
    : Math.max(0, Math.min(100, Number(progress.progress || 0)));
  const technicalDetail = String(attachment.syncErrorDetail || attachment.uploadError || "");

  return (
    <section className="attachment-failure-panel" aria-label="Google Drive 저장 실패 정보">
      <div className="attachment-failure-heading">
        <span className={`attachment-sync-badge ${status}`}>
          <AlertTriangle size={14} aria-hidden="true" />
          {status === "retry_required" ? "재시도 필요" : status === "reconnect_required" ? "연결 필요" : "Drive 저장 실패"}
        </span>
        <strong>{copy.message}</strong>
      </div>

      <p className="attachment-failure-source">{sourceCopy}</p>

      {retrying && (
        <div className="attachment-retry-progress" role="status" aria-live="polite">
          <div>
            <span>{retryStageLabel(progress.stage)}</span>
            {percent > 0 && <b>{percent}%</b>}
          </div>
          <progress value={percent} max={100} aria-label="Google Drive 재시도 진행률" />
        </div>
      )}

      <div className="attachment-failure-actions">
        <button type="button" disabled={retrying || !onRetry} onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          {retrying ? "다시 시도 중" : "다시 시도"}
        </button>
        {copy.reconnect && (
          <button type="button" disabled={retrying || !onReconnect} onClick={onReconnect}>
            <Link2 size={15} aria-hidden="true" />
            Google Drive 다시 연결
          </button>
        )}
        <details>
          <summary><span className="details-label-open">상세 보기</span><span className="details-label-close">접기</span></summary>
          <div className="attachment-failure-details-body">
        <div className="attachment-failure-grid">
          <span>
            <b>원본 보관</b>
            {sourceCopy}
          </span>
          <span><b>실패 시각</b>{formatFailureTime(attachment.syncFailedAt || attachment.lastErrorAt)}</span>
          <span><b>재시도 횟수</b>{Number(attachment.retryCount || 0)}회</span>
          <span><b>마지막 결과</b>{String(attachment.lastRetryResult || "재시도 기록 없음")}</span>
        </div>
        <p className="attachment-failure-resolution">
          <ShieldCheck size={15} aria-hidden="true" />
          <span><b>해결 방법</b>{copy.resolution}</span>
        </p>
            <dl>
            <div><dt>오류 코드</dt><dd>{String(attachment.syncErrorCode || "unknown")}</dd></div>
            <div><dt>실패 단계</dt><dd>{String(attachment.syncFailedStage || "확인 불가")}</dd></div>
            <div><dt>기술 정보</dt><dd>{technicalDetail || "추가 기술 정보가 없습니다."}</dd></div>
          </dl>
          </div>
        </details>
      </div>
    </section>
  );
}
