export type BoundaryRecord = Record<string, unknown>;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSensitiveBoundaryKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (!normalized) return false;
  if (normalized === "blob" || normalized.endsWith("storagekey") || normalized.endsWith("sourcekey")) {
    return true;
  }
  if (
    normalized.endsWith("sessionuri") ||
    normalized === "drivesessionuri" ||
    normalized === "resumableurl" ||
    normalized === "resumableuri" ||
    normalized === "uploadurl"
  ) {
    return true;
  }
  if (
    normalized.includes("authorization") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized === "r2uploadid" ||
    normalized === "multipartuploadid" ||
    normalized === "uploadid" ||
    normalized === "batchid"
  ) {
    return true;
  }
  return false;
}

export function sanitizeBoundaryText(value: string): string {
  return value
    .replace(
      /("(?:source_key|sourceKey|source_storage_key|sourceStorageKey|storage_key|storageKey|encrypted_drive_session_uri|drive_session_uri|driveSessionUri|sessionUri|operation_token|operationToken|access_token|refresh_token|client_secret|authorization|Authorization|r2_upload_id|uploadId|batchId)"\s*:\s*")[^"]*(")/gi,
      "$1[REDACTED]$2",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/https:\/\/www\.googleapis\.com\/upload\/drive\/[^\s"']+/gi, "[REDACTED]")
    .replace(/work-note-staging\/[A-Za-z0-9._~+/-]+/gi, "[REDACTED]")
    .replace(
      /((?:r2[_ -]?upload[_ -]?id|multipart[_ -]?upload[_ -]?id|upload[_ -]?id)\s*[:=]\s*["']?)[^,\s"'}]+/gi,
      "$1[REDACTED]",
    );
}

export function sanitizeBoundaryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeBoundaryValue(item));
  if (value && typeof value === "object") {
    const output: BoundaryRecord = {};
    for (const [key, item] of Object.entries(value as BoundaryRecord)) {
      if (isSensitiveBoundaryKey(key)) continue;
      output[key] = sanitizeBoundaryValue(item);
    }
    return output;
  }
  return typeof value === "string" ? sanitizeBoundaryText(value) : value;
}

export function sanitizeBoundaryRecord(value: unknown): BoundaryRecord {
  const sanitized = sanitizeBoundaryValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as BoundaryRecord
    : {};
}
