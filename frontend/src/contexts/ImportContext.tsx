import { createContext, useContext, useState, useRef, ReactNode } from 'react';

export interface ImportProgress {
  current: number;
  total: number;
  currentASIN?: string;
  status: string;
  success: number;
  failed: number;
  skipped: number;
}

export interface ImportResults {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

interface ImportContextType {
  importing: boolean;
  importProgress: ImportProgress | null;
  importResults: ImportResults | null;
  clearResults: () => void;
  startImport: (file: File) => Promise<void>;
  onImportComplete: (() => void) | null;
  setOnImportComplete: (cb: (() => void) | null) => void;
}

const ImportContext = createContext<ImportContextType | null>(null);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const onImportCompleteRef = useRef<(() => void) | null>(null);

  const clearResults = () => {
    setImportResults(null);
  };

  const startImport = async (file: File) => {
    try {
      setImporting(true);
      setImportResults(null);
      setImportProgress(null);

      const fileContent = await file.text();

      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/config/import-asins', {
        method: 'POST',
        headers,
        body: JSON.stringify({ csvContent: fileContent }),
      });

      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream');

      if (!isStreaming && !response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to import');
        } catch {
          const errorText = await response.text().catch(() => '');
          throw new Error(errorText || 'Failed to import');
        }
      }

      if (!isStreaming) {
        const results = await response.json();
        setImportResults({
          total: results.total,
          success: results.success,
          failed: results.failed,
          skipped: results.skipped,
        });
        onImportCompleteRef.current?.();
      } else {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) throw new Error('Failed to import');

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  setImportProgress(data);

                  if (data.status === 'completed') {
                    setImportResults({
                      total: data.total,
                      success: data.success,
                      failed: data.failed,
                      skipped: data.skipped,
                    });
                    onImportCompleteRef.current?.();
                  } else if (data.status === 'error') {
                    throw new Error(data.error || 'Failed to import');
                  }
                } catch (parseError) {
                  if (line.includes('"status":"error"')) {
                    try {
                      const errorData = JSON.parse(line.slice(6));
                      throw new Error(errorData.error || 'Failed to import');
                    } catch {
                      console.error('Error parsing import data:', parseError);
                    }
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <ImportContext.Provider value={{
      importing,
      importProgress,
      importResults,
      clearResults,
      startImport,
      onImportComplete: onImportCompleteRef.current,
      setOnImportComplete: (cb) => { onImportCompleteRef.current = cb; },
    }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport must be used within ImportProvider');
  return ctx;
}
