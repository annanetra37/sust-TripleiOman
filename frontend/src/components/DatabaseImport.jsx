import { useState, useEffect } from 'react';
import api from '../services/api';
import { Database, Table, ChevronRight, Loader2, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { FieldLabel } from './HelpSystem';

export default function DatabaseImport({ orgUnitId, reportingYear, type, onProcessingStarted }) {
  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [columns, setColumns] = useState(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [rowLimit, setRowLimit] = useState(1000);
  const [error, setError] = useState('');
  const [pullResult, setPullResult] = useState(null);

  useEffect(() => {
    api.getConnections().then(setConnections).catch(() => setConnections([]));
  }, []);

  const connectedDBs = connections.filter((c) =>
    c.status === 'connected' && ['postgresql', 'aws_rds'].includes(c.type)
  );

  const selectConnection = async (conn) => {
    setSelectedConn(conn);
    setSelectedTable(null);
    setColumns(null);
    setPullResult(null);
    setError('');
    setLoadingTables(true);
    try {
      const result = await api.listTables(conn.id);
      setTables(result.tables);
    } catch (err) {
      setError(err.error || 'Failed to list tables.');
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const selectTable = async (tableName) => {
    setSelectedTable(tableName);
    setPullResult(null);
    setError('');
    setLoadingColumns(true);
    try {
      const result = await api.listColumns(selectedConn.id, tableName);
      setColumns(result);
    } catch (err) {
      setError(err.error || 'Failed to load columns.');
      setColumns(null);
    } finally {
      setLoadingColumns(false);
    }
  };

  const handlePull = async () => {
    if (!selectedConn || !selectedTable) return;
    setError('');
    setPulling(true);
    try {
      const result = await api.pullData(selectedConn.id, { tableName: selectedTable, limit: rowLimit });
      setPullResult(result);
    } catch (err) {
      setError(err.error || 'Failed to pull data.');
    } finally {
      setPulling(false);
    }
  };

  const handleProcessWithAI = async () => {
    if (!pullResult || !orgUnitId) return;
    // Convert pulled rows to a fake Excel-like format and upload via the existing ETL
    const fd = new FormData();
    const csvHeader = pullResult.columns.join(',');
    const csvRows = pullResult.rows.map((r) => pullResult.columns.map((c) => JSON.stringify(r[c] ?? '')).join(','));
    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    fd.append('file', blob, `${selectedTable}_import.csv`);
    fd.append('orgUnitId', orgUnitId);
    fd.append('reportingYear', reportingYear);

    try {
      let res;
      if (type === 'E1') {
        res = await api.uploadE1(fd);
      } else if (type === 'G1') {
        res = await api.uploadG1(fd);
      } else {
        res = await api.uploadS1(fd);
      }
      if (onProcessingStarted) onProcessingStarted(res.uploadId);
    } catch (err) {
      setError(err.error || 'Failed to start processing.');
    }
  };

  if (connectedDBs.length === 0) {
    return (
      <div className="card text-center py-8">
        <Database className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No connected databases</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Go to <a href="/connections" className="text-brand-600 hover:underline">Data Connections</a> to connect a PostgreSQL or AWS RDS database first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Select connection */}
      <div className="card space-y-3">
        <FieldLabel label="Select Database Connection" required info="Choose from your connected databases. Only PostgreSQL and AWS RDS are supported for table browsing." />
        <div className="grid gap-2">
          {connectedDBs.map((conn) => (
            <button
              key={conn.id}
              onClick={() => selectConnection(conn)}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left w-full ${
                selectedConn?.id === conn.id
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-500'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Database className={`w-5 h-5 ${selectedConn?.id === conn.id ? 'text-brand-600' : 'text-gray-400'}`} />
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{conn.name}</p>
                <p className="text-xs text-gray-400">{conn.type} · {conn.config?.database || ''}</p>
              </div>
              <span className="badge bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">Connected</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Browse tables */}
      {selectedConn && (
        <div className="card space-y-3">
          <FieldLabel label="Select Table" required info="Choose which table contains the sustainability data you want to import." />
          {loadingTables ? (
            <div className="flex items-center gap-2 py-4 justify-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading tables...</div>
          ) : tables.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No tables found in this database.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto border rounded-lg dark:border-gray-700 divide-y dark:divide-gray-700">
              {tables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => selectTable(t.name)}
                  className={`flex items-center gap-3 px-3 py-2.5 w-full text-left transition-colors ${
                    selectedTable === t.name
                      ? 'bg-brand-50 dark:bg-brand-950'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Table className={`w-4 h-4 ${selectedTable === t.name ? 'text-brand-600' : 'text-gray-400'}`} />
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t.name}</span>
                  <span className="text-xs text-gray-400">{t.columns} cols</span>
                  <span className="text-xs text-gray-400">{typeof t.rows === 'number' ? t.rows.toLocaleString() : t.rows} rows</span>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Preview columns + sample data */}
      {columns && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Table: <span className="text-brand-600">{columns.table}</span> ({columns.columns.length} columns)
            </h3>
          </div>

          {/* Column list */}
          <div className="flex flex-wrap gap-1.5">
            {columns.columns.map((c) => (
              <span key={c.name} className="badge bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px]">
                {c.name} <span className="text-gray-400">({c.type})</span>
              </span>
            ))}
          </div>

          {/* Sample data */}
          {columns.sampleRows?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Sample data (first 5 rows):</p>
              <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {columns.columns.slice(0, 8).map((c) => (
                        <th key={c.name} className="text-left px-2 py-1.5 font-medium text-gray-500 whitespace-nowrap">{c.name}</th>
                      ))}
                      {columns.columns.length > 8 && <th className="px-2 py-1.5 text-gray-400">+{columns.columns.length - 8} more</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {columns.sampleRows.map((row, i) => (
                      <tr key={i}>
                        {columns.columns.slice(0, 8).map((c) => (
                          <td key={c.name} className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap max-w-[120px] truncate">
                            {String(row[c.name] ?? '—')}
                          </td>
                        ))}
                        {columns.columns.length > 8 && <td className="px-2 py-1.5 text-gray-400">...</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pull controls */}
          <div className="flex items-center gap-3 pt-2">
            <div>
              <FieldLabel label="Row limit" info="Maximum rows to pull. Default: 1000, max: 10000." />
              <input type="number" className="input w-32" value={rowLimit} min={1} max={10000}
                onChange={(e) => setRowLimit(parseInt(e.target.value) || 1000)} />
            </div>
            <div className="flex-1" />
            {!pullResult ? (
              <button className="btn-secondary flex items-center gap-2 mt-5" onClick={handlePull} disabled={pulling}>
                {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {pulling ? 'Pulling...' : `Pull ${selectedTable}`}
              </button>
            ) : (
              <div className="flex items-center gap-2 mt-5">
                <span className="badge bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" /> {pullResult.totalPulled} rows pulled
                </span>
                <button className="btn-primary flex items-center gap-2" onClick={handleProcessWithAI}>
                  <Sparkles className="w-4 h-4" /> Process with AI for {reportingYear}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Info */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Data pulled from the database will be processed through the same AI ETL pipeline as uploaded files.
      </div>
    </div>
  );
}
