import React, { useState, useEffect } from 'react';

const DataManagement = ({ onDataChanged }) => {
    const [importStatus, setImportStatus] = useState(null);
    const [isImporting, setIsImporting] = useState(false);

    // Data Grid State
    const [records, setRecords] = useState([]);
    const [pagination, setPagination] = useState({ current: 1, limit: 10, totalPages: 1 });
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    // Fetch records on mount and when interactions occur
    const fetchRecords = async (page = 1, q = '') => {
        setLoading(true);
        try {
            const res = await fetch(`/api/records?page=${page}&limit=${pagination.limit}&q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setRecords(data.data);
                setPagination(data.pagination);
            }
        } catch (err) {
            console.error('Failed to fetch records:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords(1, searchTerm);
    }, [searchTerm]); // Debounce could be added for optimization

    const handlePageChange = (newPage) => {
        if (newPage > 0 && newPage <= pagination.totalPages) {
            fetchRecords(newPage, searchTerm);
        }
    };

    const handleExport = (format) => {
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = `/api/export?format=${format}`;

        let ext = format === 'db' ? 'db' : format === 'sql' ? 'sql' : 'csv';
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute('download', `serials_export_${dateStr}.${ext}`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm('WARNING: Importing a database will merge/overwrite data. Are you sure?')) {
            e.target.value = null;
            return;
        }

        setIsImporting(true);
        setImportStatus(null);
        const formData = new FormData();
        formData.append('database', file);

        try {
            const res = await fetch('/api/import', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setImportStatus({ success: true, message: data.message });
                if (onDataChanged) onDataChanged();
                fetchRecords(pagination.current, searchTerm); // Refresh grid
            } else {
                const errData = await res.json();
                setImportStatus({ success: false, message: 'Import failed: ' + (errData.error || 'Unknown error') });
            }
        } catch (err) {
            console.error(err);
            setImportStatus({ success: false, message: 'Network error during import.' });
        } finally {
            setIsImporting(false);
            e.target.value = null; // Reset input
        }
    };

    return (
        <div className="card fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Data Management</h2>

            {/* DATA VIEWER */}
            <div className="card" style={{ background: 'rgba(0,0,0,0.2)', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>Database Records</h3>
                    <input
                        type="text"
                        placeholder="Search Serial Number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
                    />
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #444', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.75rem' }}>Serial Number</th>
                                <th style={{ padding: '0.75rem' }}>Source Filename</th>
                                <th style={{ padding: '0.75rem' }}>Extracted At</th>
                                <th style={{ padding: '0.75rem' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="4" style={{ padding: '1rem', textAlign: 'center' }}>Loading...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan="4" style={{ padding: '1rem', textAlign: 'center' }}>No records found.</td></tr>
                            ) : (
                                records.map((rec, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #333' }}>
                                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{rec.serial_number}</td>
                                        <td style={{ padding: '0.75rem', color: '#aaa' }}>{rec.source_filename || '-'}</td>
                                        <td style={{ padding: '0.75rem', color: '#aaa' }}>{new Date(rec.extracted_at).toLocaleString()}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: rec.status === 'confirmed' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                                                color: rec.status === 'confirmed' ? '#4caf50' : '#ccc'
                                            }}>
                                                {rec.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <button
                        className="btn"
                        disabled={pagination.current === 1}
                        onClick={() => handlePageChange(pagination.current - 1)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        Previous
                    </button>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        Page {pagination.current} of {pagination.totalPages} ({pagination.totalRecords} records)
                    </span>
                    <button
                        className="btn"
                        disabled={pagination.current === pagination.totalPages}
                        onClick={() => handlePageChange(pagination.current + 1)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                {/* EXPORT SECTION */}
                <div className="card" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Export Database</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Download your data in various formats.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn" onClick={() => handleExport('csv')} style={{ flex: 1 }}>CSV</button>
                        <button className="btn" onClick={() => handleExport('sql')} style={{ flex: 1 }}>SQL</button>
                        <button className="btn" onClick={() => handleExport('db')} style={{ flex: 1 }}>DB File</button>
                    </div>
                </div>

                {/* IMPORT SECTION */}
                <div className="card" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Import Database</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Merge data from a <strong>CSV</strong> file.
                    </p>

                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn"
                            disabled={isImporting}
                            style={{ width: '100%', background: 'var(--glass-border)' }}
                        >
                            {isImporting ? 'Importing...' : 'Select CSV File'}
                        </button>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleImport}
                            style={{
                                position: 'absolute',
                                top: 0, left: 0,
                                width: '100%', height: '100%',
                                opacity: 0,
                                cursor: 'pointer'
                            }}
                            disabled={isImporting}
                        />
                    </div>
                </div>

            </div>

            {/* DANGER ZONE */}
            <div className="card" style={{ marginTop: '3rem', border: '1px solid #ff4444', background: 'rgba(255, 68, 68, 0.05)' }}>
                <h3 style={{ marginBottom: '1rem', color: '#ff4444' }}>Danger Zone</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Irreversible actions. Proceed with caution.
                </p>
                <button
                    className="btn"
                    style={{ background: '#ff4444', color: 'white', width: '100%', border: 'none' }}
                    onClick={async () => {
                        if (window.confirm('WARNING: This will PERMANENTLY DELETE ALL DATA. This action cannot be undone.\n\nAre you sure you want to format the database?')) {
                            const confirmation = window.prompt("Type 'DELETE' to confirm database format:");
                            if (confirmation === 'DELETE') {
                                try {
                                    const res = await fetch('/api/reset', {
                                        method: 'POST',
                                        headers: { 'X-Confirm-Reset': 'true' }
                                    });
                                    if (res.ok) {
                                        alert('Database has been formatted successfully.');
                                        window.location.reload();
                                    } else {
                                        const err = await res.json();
                                        alert('Reset failed: ' + err.error);
                                    }
                                } catch (e) {
                                    alert('Network error during reset.');
                                }
                            } else if (confirmation !== null) {
                                alert('Verification failed. Database was not reset.');
                            }
                        }
                    }}
                >
                    Format Database
                </button>
            </div>

            {importStatus && (
                <div className={`result-box ${importStatus.success ? 'result-success' : 'result-error'}`} style={{ marginTop: '2rem' }}>
                    {importStatus.message}
                </div>
            )}
        </div>
    );
};

export default DataManagement;
