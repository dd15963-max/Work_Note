import { normalizeCompanyFolderKey } from "./organization";

export type CompanyAliasCandidateFacts = {
  aliasKey: string;
  expectedCompanyId: string;
  expectedCompanyKey: string;
  driveFolderName?: string;
  driveCompanyId?: string;
  driveCanonicalCompanyKey?: string;
  registryFolderName?: string;
  registryCompanyId?: string;
};

export function isCompanyAliasCandidateEligible(
  facts: CompanyAliasCandidateFacts,
): boolean {
  const expectedId = String(facts.expectedCompanyId || "").trim();
  const expectedKey = normalizeCompanyFolderKey(facts.expectedCompanyKey);
  const candidateIds = new Set([
    facts.driveCompanyId,
    facts.registryCompanyId,
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const candidateKeys = new Set([
    facts.driveCanonicalCompanyKey,
    facts.driveFolderName,
    facts.registryFolderName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => normalizeCompanyFolderKey(value)));

  if (facts.aliasKey.startsWith("company-id:")) {
    return facts.aliasKey === `company-id:${expectedId}` && candidateIds.has(expectedId);
  }
  if (facts.aliasKey.startsWith("company-name:")) {
    const noConflictingId = candidateIds.size === 0 ||
      (candidateIds.size === 1 && candidateIds.has(expectedId));
    return facts.aliasKey === `company-name:${expectedKey}` &&
      candidateKeys.has(expectedKey) && noConflictingId;
  }
  return false;
}

export function folderActivityBlocksCleanup(input: {
  activeUploadSession: boolean;
  activeAttachmentOperation: boolean;
  activeFolderLock: boolean;
}): boolean {
  return input.activeUploadSession || input.activeAttachmentOperation || input.activeFolderLock;
}


export type ManagedFolderChainNode = {
  id: string;
  parentIds: string[];
  managedBy: string;
  folderType: string;
  managedKey: string;
  registry?: {
    parentFolderId: string;
    folderType: string;
    managedKey: string;
    trashed: boolean;
  };
};

export function managedFolderChainIsStrict(input: {
  targetType: "company" | "memo" | "category";
  targetManagedKey?: string;
  rootFolderId: string;
  nodes: ManagedFolderChainNode[];
}): boolean {
  const expectedTypes = input.targetType === "category"
    ? ["category", "memo", "company"]
    : input.targetType === "memo" ? ["memo", "company"] : ["company"];
  if (input.nodes.length !== expectedTypes.length + 1) return false;
  const prefixes = { company: "company-name:", memo: "memo:", category: "category:" };
  for (let index = 0; index < expectedTypes.length; index += 1) {
    const expectedType = expectedTypes[index];
    const node = input.nodes[index];
    const parent = input.nodes[index + 1];
    if (!node || !parent || node.managedBy !== "work-note" ||
      node.folderType !== expectedType || node.parentIds.length !== 1 ||
      node.parentIds[0] !== parent.id ||
      !node.managedKey.startsWith(prefixes[expectedType as keyof typeof prefixes])) {
      return false;
    }
    if (index === 0 && input.targetManagedKey && node.managedKey !== input.targetManagedKey) {
      return false;
    }
    if (node.registry && (
      node.registry.trashed || node.registry.parentFolderId !== node.parentIds[0] ||
      node.registry.folderType !== expectedType || node.registry.managedKey !== node.managedKey
    )) {
      return false;
    }
  }
  const root = input.nodes[input.nodes.length - 1];
  return root.id === input.rootFolderId && root.managedBy === "work-note" &&
    root.folderType === "root";
}
