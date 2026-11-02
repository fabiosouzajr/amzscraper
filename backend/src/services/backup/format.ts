export const BACKUP_FORMAT = 'amzscraper-backup';
export const CURRENT_FORMAT_VERSION = 1;
export const SUPPORTED_FORMAT_VERSIONS: number[] = [1];
export const MAX_LIST_NAME_LENGTH = 1000;
export const MAX_REPORTED_ISSUES = 500;

export interface BackupPricePoint {
  date: string;
  price: number | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface BackupProduct {
  asin: string;
  description: string;
  imageUrl: string | null;
  createdAt: string;
  categories: string[];
  lists: string[];
  priceHistory: BackupPricePoint[];
}

export interface BackupList {
  name: string;
  createdAt: string;
}

export interface BackupFileV1 {
  format: string;
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  username: string;
  counts: { products: number; priceHistory: number; lists: number };
  lists: BackupList[];
  products: BackupProduct[];
}

export type RestoreMode = 'merge' | 'replace';

/** Codes the UI knows how to render. NOT_JSON is raised by the client/transport, never by validateBackup. */
export type IssueCode =
  | 'NOT_JSON' | 'WRONG_FORMAT' | 'UNSUPPORTED_VERSION' | 'MISSING_FIELD' | 'WRONG_TYPE'
  | 'INVALID_ASIN' | 'DUPLICATE_ASIN' | 'MISSING_DESCRIPTION' | 'INVALID_DATE' | 'INVALID_PRICE'
  | 'INVALID_AVAILABLE' | 'INVALID_LIST_NAME' | 'DUPLICATE_LIST_NAME' | 'QUOTA_EXCEEDED'
  | 'UPDATE_IN_PROGRESS' | 'SERVER_SCHEMA_MISMATCH'
  | 'UNKNOWN_FIELD' | 'COUNTS_MISMATCH' | 'UNDECLARED_LIST' | 'DUPLICATE_PRICE_POINT'
  | 'FUTURE_DATE' | 'PRICE_NULL_BUT_AVAILABLE' | 'INVALID_IMAGE_URL' | 'DIFFERENT_USERNAME';

export type Issue = {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  params?: Record<string, string | number>;
};

export type MergePreview = {
  productsAdded: number;
  productsSkippedExisting: number;
  pricePointsAdded: number;
  pricePointsSkippedDuplicate: number;
  listsAdded: number;
  listsMatched: number;
  membershipsAdded: number;
};

export type ReplacePreview = {
  productsDeleted: number;
  pricePointsDeleted: number;
  listsDeleted: number;
  notificationRulesDeleted: number;
  productsAdded: number;
  pricePointsAdded: number;
  listsAdded: number;
};

export type ValidationReport = {
  compatible: boolean;
  fileInfo: {
    formatVersion?: number;
    appVersion?: string;
    exportedAt?: string;
    username?: string;
    counts: { products: number; priceHistory: number; lists: number };
  };
  issues: Issue[];
  issueTotals: { errors: number; warnings: number };
  preview: { merge: MergePreview; replace: ReplacePreview };
  quotaOk: { merge: boolean; replace: boolean };
};

export type RestoreResult = {
  mode: RestoreMode;
  productsAdded: number;
  pricePointsAdded: number;
  listsAdded: number;
  membershipsAdded: number;
  productsDeleted?: number;
  pricePointsDeleted?: number;
  listsDeleted?: number;
  notificationRulesDeleted?: number;
  durationMs: number;
};

const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Parses an ISO-8601-ish date (zone optional, none = UTC) to UTC `YYYY-MM-DD HH:MM:SS`, or null. */
export function toStorageDate(input: string): string | null {
  if (typeof input !== 'string') return null;
  const m = DATE_RE.exec(input.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const s = m[6] ? Number(m[6]) : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  let offsetMin = 0;
  const z = m[7];
  if (z && z !== 'Z') {
    const digits = z.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2, 4));
    if (oh > 23 || om > 59) return null;
    offsetMin = (z[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const utc = new Date(ms - offsetMin * 60000);
  return utc.toISOString().slice(0, 19).replace('T', ' ');
}

/** Storage `YYYY-MM-DD HH:MM:SS` (UTC) to `YYYY-MM-DDTHH:MM:SSZ`. */
export function toIsoDate(storage: string): string {
  return storage.replace(' ', 'T') + 'Z';
}
