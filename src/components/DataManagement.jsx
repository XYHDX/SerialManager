import React, { useState, useEffect } from 'react';

const DataManagement = ({ onDataChanged }) => {
    const [importStatus, setImportStatus] = useState(null);
    const [isImporting, setIsImporting] = useState(false);

    // Data Grid State
    const [records, setRecords] = useState([]);
    const [pagination, setPagination] = useState({ current: 1, limit: 10, totalPages: 1 });
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ serial_number: '', status: '' });

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
        const timeoutId = setTimeout(() => {
            fetchRecords(1, searchTerm);
        }, 300); // Debounce
        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    const handlePageChange = (newPage) => {
        if (newPage > 0 && newPage <= pagination.totalPages) {
            fetchRecords(newPage, searchTerm);
        }
    };

    const startEdit = (rec) => {
        setEditingId(rec.id);
        setEditForm({ serial_number: rec.serial_number, status: rec.status });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({ serial_number: '', status: '' });
    };

    const saveEdit = async (id) => {
        try {
            const res = await fetch(`/api/serials/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });

            if (res.ok) {
                setEditingId(null);
                fetchRecords(pagination.current, searchTerm);
                if (onDataChanged) onDataChanged();
            } else {
                const err = await res.json();
                alert('Update failed: ' + (err.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Network error during update.');
        }
    };

    const deleteSerial = async (serial) => {
        if (window.confirm(`Are you sure you want to delete ${serial}?`)) {
            try {
                const res = await fetch(`/api/serials/${serial}`, { method: 'DELETE' });
                if (res.ok) {
                    if (onDataChanged) onDataChanged();
                    fetchRecords(pagination.current, searchTerm);
                } else {
                    alert('Failed to delete serial.');
                }
            } catch (e) {
                console.error(e);
                alert('Network error.');
            }
        }
    };

    const handleExport = (format) => {
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
                fetchRecords(pagination.current, searchTerm);
            } else {
                const errData = await res.json();
                setImportStatus({ success: false, message: 'Import failed: ' + (errData.error || 'Unknown error') });
            }
        } catch (err) {
            console.error(err);
            setImportStatus({ success: false, message: 'Network error during import.' });
        } finally {
            setIsImporting(false);
            e.target.value = null;
        }
    };

    return (
        <div className="card fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>Data Management</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" onClick={() => fetchRecords(pagination.current, searchTerm)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        Refresh
                    </button>
                </div>
            </div>

            {/* DATA VIEWER */}
            <div className="card" style={{ background: 'rgba(0,0,0,0.2)', marginBottom: '2rem', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h3 style={{ margin: 0 }}>Records ({pagination.totalRecords})</h3>
                    <input
                        type="text"
                        placeholder="Search Serial Number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            background: '#1a1a1a',
                            color: '#fff',
                            minWidth: '250px'
                        }}
                    />
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #333' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#ccc' }}>
                                <th style={{ padding: '1rem' }}>Serial Number</th>
                                <th style={{ padding: '1rem' }}>Source</th>
                                <th style={{ padding: '1rem' }}>Date</th>
                                <th style={{ padding: '1rem' }}>Status</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading records...</td></tr>
                            ) : records.length === 0 ? (
                                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No records found.</td></tr>
                            ) : (
                                records.map((rec) => (
                                    <tr key={rec.id} style={{ borderTop: '1px solid #333', transition: 'background 0.2s', background: editingId === rec.id ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                                        {editingId === rec.id ? (
                                            <>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <input
                                                        type="text"
                                                        value={editForm.serial_number}
                                                        onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                                                        style={{ width: '100%', padding: '0.5rem', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '0.75rem', color: '#888' }}>{rec.source_filename}</td>
                                                <td style={{ padding: '0.75rem', color: '#888' }}>{new Date(rec.extracted_at).toLocaleDateString()}</td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <select
                                                        value={editForm.status}
                                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                                        style={{ padding: '0.5rem', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }}
                                                    >
                                                        <option value="confirmed">Confirmed</option>
                                                        <option value="imported">Imported</option>
                                                        <option value="flagged">Flagged</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                        <button onClick={() => saveEdit(rec.id)} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#4caf50' }}>Save</button>
                                                        <button onClick={cancelEdit} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#555' }}>Cancel</button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1rem', color: '#fff' }}>
                                                    {rec.serial_number}
                                                </td>
                                                <td style={{ padding: '1rem', color: '#aaa', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {rec.source_filename || '-'}
                                                </td>
                                                <td style={{ padding: '1rem', color: '#aaa' }}>
                                                    {new Date(rec.extracted_at).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.8rem',
                                                        background: rec.status === 'confirmed' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                        color: rec.status === 'confirmed' ? '#81c784' : '#ccc',
                                                        border: rec.status === 'confirmed' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid #444'
                                                    }}>
                                                        {rec.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={() => startEdit(rec)}
                                                            className="btn"
                                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #666', color: '#ccc' }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="btn"
                                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'rgba(255, 68, 68, 0.1)', color: '#ff6666', border: '1px solid rgba(255, 68, 68, 0.3)' }}
                                                            onClick={() => deleteSerial(rec.serial_number)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.5rem', gap: '1rem' }}>
                    <button
                        className="btn"
                        disabled={pagination.current === 1}
                        onClick={() => handlePageChange(pagination.current - 1)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', opacity: pagination.current === 1 ? 0.5 : 1 }}
                    >
                        Previous
                    </button>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        Page <strong style={{ color: 'white' }}>{pagination.current}</strong> of {pagination.totalPages}
                    </span>
                    <button
                        className="btn"
                        disabled={pagination.current === pagination.totalPages}
                        onClick={() => handlePageChange(pagination.current + 1)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', opacity: pagination.current === pagination.totalPages ? 0.5 : 1 }}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                {/* EXPORT SECTION */}
                <div className="card" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Export Data</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Download your database records.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button className="btn" onClick={() => handleExport('csv')} style={{ flex: 1, background: '#2196f3', border: 'none' }}>CSV</button>
                        <button className="btn" onClick={() => handleExport('sql')} style={{ flex: 1, background: '#2196f3', border: 'none' }}>SQL</button>
                    </div>
                </div>

                {/* IMPORT SECTION */}
                <div className="card" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Import CSV</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Merge external data (CSV format).
                    </p>

                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn"
                            disabled={isImporting}
                            style={{ width: '100%', background: isImporting ? '#444' : '#ff9800', border: 'none', color: 'white' }}
                        >
                            {isImporting ? 'Processing...' : 'Select CSV File'}
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
            <div className="card" style={{ marginTop: '3rem', border: '1px solid rgba(255, 68, 68, 0.3)', background: 'rgba(255, 68, 68, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ marginBottom: '0.5rem', color: '#ff6666' }}>Danger Zone</h3>
                        <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>
                            Resetting the database will permanently delete all records.
                        </p>
                    </div>
                    <button
                        className="btn"
                        style={{ background: '#d32f2f', color: 'white', border: 'none', padding: '0.6rem 1.2rem' }}
                        onClick={async () => {
                            if (window.confirm('WARNING: This will PERMANENTLY DELETE ALL DATA.\n\nAre you sure you want to format the database?')) {
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
                                }
                            }
                        }}
                    >
                        Format Database
                    </button>
                </div>
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
