import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../services/api';
import { Modal, Button } from '../../design-system';
import { Issue, MergePreview, ReplacePreview, RestoreMode, RestoreResult, ValidationReport } from '../../types';
import styles from './Config.module.css';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Busy = 'export' | 'validate' | 'restore' | null;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function DataImportExportSection() {
  const { t, i18n } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  // The exact parsed object that was validated; restore always sends this one.
  const [backup, setBackup] = useState<unknown>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const errorMessage = (err: unknown): string => {
    if (err instanceof ApiError) {
      const key = `config.backup.errors.${err.code}`;
      return i18n.exists(key) ? t(key) : t('config.backup.errors.generic');
    }
    if (err instanceof TypeError) return t('config.backup.errors.network');
    return t('config.backup.errors.generic');
  };

  const reset = () => {
    setBackup(null);
    setReport(null);
    setMode('merge');
    setError(null);
    setNotice(null);
    setResult(null);
    setShowWarnings(false);
    setConfirmReplace(false);
  };

  const runExport = async (fn: () => Promise<{ blob: Blob; filename: string }>) => {
    try {
      setBusy('export');
      setError(null);
      const { blob, filename } = await fn();
      saveBlob(blob, filename);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    reset();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(t('config.backup.fileTooLarge'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readText(file));
    } catch (err) {
      setError(err instanceof SyntaxError ? t('config.backup.notJson') : t('config.backup.readFailed'));
      return;
    }
    try {
      setBusy('validate');
      setBackup(parsed);
      setReport(await api.backup.validate(parsed));
    } catch (err) {
      setBackup(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async (confirmed: boolean) => {
    if (!report) return;
    setConfirmReplace(false);
    try {
      setBusy('restore');
      setError(null);
      setNotice(null);
      const res = await api.backup.restore({
        backup,
        mode,
        ...(confirmed ? { confirmReplace: true } : {}),
        expected: report.preview[mode],
      });
      setResult(res);
      setBackup(null);
      setReport(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DATA_CHANGED') {
        if (err.report) setReport(err.report);
        setNotice(t('config.backup.dataChanged'));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const issueMessage = (issue: Issue) =>
    t(`config.backup.issues.${issue.code}`, {
      ...issue.params,
      path: issue.path,
      defaultValue: t('config.backup.issues.unknown', { code: issue.code, path: issue.path }),
    });

  const renderCounts = (preview: MergePreview | ReplacePreview) => (
    <dl className={styles.backupCounts}>
      {Object.entries(preview).map(([key, value]) => (
        <div key={key} className={styles.backupCountRow}>
          <dt>{t(`config.backup.preview.${key}`)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );

  const errors = report?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = report?.issues.filter((i) => i.severity === 'warning') ?? [];
  const moreErrors = report ? Math.max(0, report.issueTotals.errors - errors.length) : 0;
  const moreWarnings = report ? Math.max(0, report.issueTotals.warnings - warnings.length) : 0;
  const errorGroups = errors.reduce<Map<string, Issue[]>>((groups, issue) => {
    groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
    return groups;
  }, new Map());
  const quotaOk = report?.quotaOk[mode] ?? false;
  const canRestore = !!report && report.compatible && quotaOk && !busy;
  const info = report?.fileInfo;

  return (
    <div id="data-export" className={styles.configSection}>
      <h3>{t('config.dataExport')}</h3>

      <h4 className={styles.backupHeading}>{t('config.backup.exportTitle')}</h4>
      <div className={styles.configActions}>
        <button onClick={() => runExport(api.backup.exportJson)} disabled={!!busy} className={styles.exportButton}>
          {busy === 'export' ? t('config.backup.exporting') : t('config.backup.downloadBackup')}
        </button>
        <p className={styles.configDescription}>{t('config.backup.downloadBackupDescription')}</p>
      </div>
      <div className={styles.configActions}>
        <button
          onClick={() => runExport(() => api.backup.exportCsv(i18n.language))}
          disabled={!!busy}
          className={styles.exportButton}
        >
          {busy === 'export' ? t('config.backup.exporting') : t('config.backup.exportCsv')}
        </button>
        <p className={styles.configDescription}>{t('config.backup.exportCsvDescription')}</p>
      </div>
      <div className={styles.configActions}>
        <button onClick={() => runExport(api.exportASINs)} disabled={!!busy} className={styles.exportButton}>
          {busy === 'export' ? t('config.exportingASINs') : t('config.exportASINs')}
        </button>
        <p className={styles.configDescription}>{t('config.exportASINsDescription')}</p>
      </div>

      <h4 className={styles.backupHeading}>{t('config.backup.restoreTitle')}</h4>
      <div className={styles.configActions}>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          disabled={!!busy}
          aria-label={t('config.backup.chooseFile')}
        />
        <p className={styles.configDescription}>{t('config.backup.chooseFileDescription')}</p>
      </div>

      {busy === 'validate' && <p className={styles.configDescription}>{t('config.backup.validating')}</p>}
      {error && <div className="error-message">{error}</div>}
      {notice && <div className={styles.backupNotice}>{notice}</div>}

      {report && info && (
        <div className={styles.backupReport}>
          <p className={styles.backupFileInfo}>
            {info.exportedAt
              ? t('config.backup.fileInfo', {
                  date: new Date(info.exportedAt).toLocaleString(i18n.language),
                  username: info.username ?? '?',
                  version: info.appVersion ?? '?',
                  products: info.counts.products,
                  prices: info.counts.priceHistory,
                  lists: info.counts.lists,
                })
              : t('config.backup.fileInfoUnknown')}
          </p>

          {errors.length > 0 && (
            <div className={styles.backupErrors}>
              <strong>{t('config.backup.errorsTitle')} ({report.issueTotals.errors})</strong>
              <ul>
                {[...errorGroups.entries()].map(([code, issues]) => (
                  <li key={code}>
                    <ul>
                      {issues.map((issue, idx) => (
                        <li key={idx}>{issueMessage(issue)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {moreErrors > 0 && <p>{t('config.backup.moreIssues', { count: moreErrors })}</p>}
            </div>
          )}

          {report.issueTotals.warnings > 0 && (
            <div className={styles.backupWarnings}>
              <button type="button" className={styles.backupLinkButton} onClick={() => setShowWarnings((v) => !v)}>
                {t(showWarnings ? 'config.backup.hideWarnings' : 'config.backup.showWarnings', {
                  count: report.issueTotals.warnings,
                })}
              </button>
              {showWarnings && (
                <>
                  <ul>
                    {warnings.map((issue, idx) => (
                      <li key={idx}>{issueMessage(issue)}</li>
                    ))}
                  </ul>
                  {moreWarnings > 0 && <p>{t('config.backup.moreIssues', { count: moreWarnings })}</p>}
                </>
              )}
            </div>
          )}

          {!report.compatible && <p className={styles.backupBlocked}>{t('config.backup.incompatible')}</p>}

          {report.compatible && (
            <>
              <fieldset className={styles.backupModes} disabled={!!busy}>
                <legend>{t('config.backup.modeLabel')}</legend>
                {(['merge', 'replace'] as const).map((m) => (
                  <label key={m} className={styles.backupMode}>
                    <input type="radio" name="restore-mode" checked={mode === m} onChange={() => setMode(m)} />
                    <span>
                      <strong>{t(m === 'merge' ? 'config.backup.modeMerge' : 'config.backup.modeReplace')}</strong>
                      <span className={styles.configDescription}>
                        {t(m === 'merge' ? 'config.backup.modeMergeDescription' : 'config.backup.modeReplaceDescription')}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <strong>{t('config.backup.previewTitle')}</strong>
              {renderCounts(report.preview[mode])}
              {!quotaOk && <p className={styles.backupBlocked}>{t('config.backup.quotaExceeded')}</p>}

              <button
                onClick={() => (mode === 'replace' ? setConfirmReplace(true) : runRestore(false))}
                disabled={!canRestore}
                className={styles.exportButton}
              >
                {busy === 'restore' ? t('config.backup.restoring') : t('config.backup.restore')}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div className={styles.backupResult}>
          <strong>{t('config.backup.resultTitle')}</strong>
          <dl className={styles.backupCounts}>
            {(Object.keys(result) as (keyof RestoreResult)[])
              .filter((k) => k !== 'mode' && k !== 'durationMs')
              .map((k) => (
                <div key={k} className={styles.backupCountRow}>
                  <dt>{t(`config.backup.result.${k}`)}</dt>
                  <dd>{result[k]}</dd>
                </div>
              ))}
          </dl>
          <p className={styles.configDescription}>{t('config.backup.resultDuration', { ms: result.durationMs })}</p>
        </div>
      )}

      <Modal
        isOpen={confirmReplace && !!report}
        onClose={() => setConfirmReplace(false)}
        title={t('config.backup.confirmTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReplace(false)}>
              {t('config.backup.cancel')}
            </Button>
            <Button variant="danger" onClick={() => runRestore(true)}>
              {t('config.backup.restoreReplace')}
            </Button>
          </>
        }
      >
        <p>{t('config.backup.confirmBody')}</p>
        {report && (
          <dl className={styles.backupCounts}>
            {(['productsDeleted', 'pricePointsDeleted', 'listsDeleted', 'notificationRulesDeleted'] as const).map((k) => (
              <div key={k} className={styles.backupCountRow}>
                <dt>{t(`config.backup.preview.${k}`)}</dt>
                <dd>{report.preview.replace[k]}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  );
}
