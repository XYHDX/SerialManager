import React, { useState } from 'react';

const UploadReceipts = ({ onUploadComplete }) => {
    const [files, setFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        setFiles(Array.from(e.target.files));
        setResults(null);
        setError(null);
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        files.forEach(file => {
            formData.append('receipts', file);
        });

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            setResults(data);
            if (onUploadComplete) onUploadComplete();

        } catch (err) {
            console.error(err);
            setError('Failed to process images. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="card fade-in">
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Upload Receipts</h2>

            <div className="input-group">
                <label className="input-label">Select Images</label>
                <div style={{
                    border: '2px dashed var(--glass-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        id="file-upload"
                    />
                    <label htmlFor="file-upload" style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'block' }}>
                        {files.length > 0
                            ? `${files.length} file(s) selected`
                            : 'Click to select or drag receipt images here'}
                    </label>
                </div>
            </div>

            <button
                className="btn"
                onClick={handleUpload}
                disabled={isUploading || files.length === 0}
                style={{ opacity: (isUploading || files.length === 0) ? 0.6 : 1 }}
            >
                {isUploading ? 'Processing OCR...' : 'Extract Serials'}
            </button>

            {error && (
                <div className="result-box result-error">
                    {error}
                </div>
            )}

            {results && (
                <div style={{ marginTop: '2rem' }}>
                    <div className="result-box result-success">
                        Found {results.totalCandidates} candidates.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success-color)' }}>
                                {results.inserted}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>New Serials Added</div>
                        </div>
                        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                                {results.duplicates}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>Duplicates Skipped</div>
                        </div>
                    </div>

                    <h3 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>File Details</h3>
                    <ul style={{ listStyle: 'none', marginTop: '0.5rem' }}>
                        {results.results.map((res, i) => (
                            <li key={i} style={{
                                padding: '0.75rem',
                                borderBottom: '1px solid var(--glass-border)',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>{res.filename}</span>
                                <span>
                                    <span style={{ color: 'var(--success-color)' }}>+{res.new}</span> /
                                    <span style={{ color: 'var(--text-secondary)' }}> {res.duplicates} dup</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default UploadReceipts;
