import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("inline company registration", () => {
  it("is available from every shared work company selector", () => {
    expect(appSource.match(/<CompanyCombobox/g)).toHaveLength(3);
    expect(appSource.match(/onPersist=\{onPersist\}\s+companyLabel=/g)).toHaveLength(3);
    expect(appSource).toContain('className="combo-quick-add-button"');
    expect(appSource).toContain("새 업체 등록");
  });

  it("stores a normalized company in the company database and selects it", () => {
    expect(appSource).toContain("const normalized = normalizeCompanyDraft");
    expect(appSource).toContain('findSimilarCompanies(companies, name, "")');
    expect(appSource).toContain("companies: [company, ...current.companies]");
    expect(appSource).toContain('companyId: firstText(company, ["id"])');
    expect(appSource).toContain('"업무 등록 중 업체 추가"');
  });

  it("supports optional first-contact persistence and responsive modal use", () => {
    expect(appSource).toContain("contacts: hasContact ? [contactValues] : []");
    expect(appSource).toContain("입력하면 업체 담당자 DB에도 함께 저장됩니다.");
    expect(appSource).toContain('if (event.key === "Escape") setQuickCompanyDraft(null);');
    expect(stylesSource).toContain(".quick-company-modal-body");
    expect(stylesSource).toContain("@media (max-width: 640px)");
  });
});
