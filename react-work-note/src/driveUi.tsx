import { FolderOpen } from "lucide-react";

export type NormalizedAttachmentSyncStatus =
  | "local_only"
  | "pending"
  | "uploading"
  | "synced"
  | "failed"
  | "retry_required"
  | "reconnect_required";

export function normalizeAttachmentSyncStatus(value: unknown): NormalizedAttachmentSyncStatus {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (["local_only", "pending", "uploading", "synced", "failed", "retry_required", "reconnect_required"].includes(normalized)) {
    return normalized as NormalizedAttachmentSyncStatus;
  }
  if (["재시도 필요", "재시도필요", "다시 시도 필요"].includes(raw)) return "retry_required";
  if (["연결 필요", "연결필요", "연결 끊김", "다시 연결 필요"].includes(raw)) return "reconnect_required";
  if (["저장 실패", "업로드 실패", "Drive 저장 실패", "동기화 실패", "실패"].includes(raw)) return "failed";
  if (["동기화 중", "업로드 중", "저장 중"].includes(raw)) return "uploading";
  if (["동기화 완료", "저장 완료", "업로드 완료", "완료"].includes(raw)) return "synced";
  if (["대기", "대기 중", "저장 대기"].includes(raw)) return "pending";
  return "local_only";
}

export function isFailedAttachmentStatus(value: unknown): boolean {
  return ["failed", "retry_required", "reconnect_required"].includes(
    normalizeAttachmentSyncStatus(value),
  );
}

export function attachmentSyncStatusLabel(value: unknown): string {
  const status = normalizeAttachmentSyncStatus(value);
  if (status === "retry_required") return "재시도 필요";
  if (status === "reconnect_required") return "연결 필요";
  if (status === "failed") return "Drive 저장 실패";
  if (status === "uploading") return "동기화 중";
  if (status === "pending") return "저장 대기";
  if (status === "synced") return "Drive 동기화 완료";
  return "이 기기";
}

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
  disabledReason = "Google Drive 정보를 불러오지 못했습니다.",
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
