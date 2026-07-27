import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sql = read("supabase/migrations/202607270001_work_note.sql");
const requiredTables = ["profiles", "companies", "company_contacts", "head_office_contacts", "tasks", "settlements", "settlement_entries", "task_schedules", "accounts", "attachments", "settings", "migration_logs", "activity_logs"];
requiredTables.forEach((table) => assert(sql.includes(`create table if not exists public.${table}`), `Missing table: ${table}`));
assert(sql.includes("enable row level security"), "RLS enablement is missing");
assert(!sql.includes("create policy work_note_owner_delete"), "Authenticated physical delete policy must remain disabled");
assert(sql.includes("work_note_storage_select") && sql.includes("work_note_storage_insert") && sql.includes("work_note_storage_update"), "Storage policies are incomplete");
assert(sql.includes("sync_work_note_dataset") && sql.includes("get_work_note_dataset") && sql.includes("soft_delete_work_note_account_data"), "Required RPC functions are missing");
assert(sql.includes("from auth.users") && sql.includes("is_allowed"), "Allowed-profile bootstrap is missing");
const legacyHtml = read("react/index.html");
assert(legacyHtml.includes("/Work_Note/react/"), "Legacy React deployment output was unexpectedly replaced");
const previewHtmlPath = path.join(root, "fullstack-preview", "index.html");
if (fs.existsSync(previewHtmlPath)) {
  const previewHtml = fs.readFileSync(previewHtmlPath, "utf8");
  assert(previewHtml.includes("/Work_Note/fullstack-preview/"), "Preview build base path is incorrect");
  ["file-manager-modal.js", "input-key-fix.js", "sales-invoice-fields.js", "manifest.webmanifest"].forEach((asset) => {
    assert(fs.existsSync(path.join(root, "fullstack-preview", asset)), `Preview asset is missing: ${asset}`);
  });
}
console.log("Full-stack static safety checks passed.");