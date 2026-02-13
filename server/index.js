const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dbModule = require('./db');
const { extractSerials } = require('./ocr');
const { put } = require('@vercel/blob');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure Multer for memory storage (processing images in-memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure Multer for CSV file upload (memory storage for parsing)
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Helper for transaction
const executeTransaction = async (queries) => {
    // queries: array of { sql, params }
    if (dbModule.isPostgres) {
        // Simple linear execution for now, true transaction management for PG requires a client from pool
        // This is a simplification. For robustness, we should acquire a client.
        // But @vercel/postgres `sql` is a pool.
        try {
            // Start transaction not easily supported by simple query helper without client management
            // So we will just execute sequentially for thismvp
            for (const q of queries) {
                await dbModule.run(q.sql, q.params);
            }
            return true;
        } catch (e) {
            console.error("Transaction failed", e);
            throw e;
        }
    } else {
        const db = dbModule.raw;
        const transaction = db.transaction((qs) => {
            for (const q of qs) {
                db.prepare(q.sql).run(...q.params);
            }
        });
        transaction(queries);
        return true;
    }
};

/**
 * POST /extract
 */
app.post('/api/extract', (req, res) => {
    upload.array('receipts', 100)(req, res, async (err) => {
        if (err) {
            console.error('Multer/Upload Error:', err);
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }

        console.log(`Received ${req.files.length} files. Starting OCR...`);

        let summary = {
            totalCandidates: 0,
            inserted: 0,
            duplicates: 0,
            results: []
        };

        const insertSql = dbModule.isPostgres
            ? `INSERT INTO serials (serial_number, source_filename) VALUES ($1, $2) ON CONFLICT(serial_number) DO NOTHING`
            : `INSERT INTO serials (serial_number, source_filename) VALUES (?, ?) ON CONFLICT(serial_number) DO NOTHING`;

        // Prepare queries for transaction later
        // Actually, per file processing is safer to keep separate for feedback

        try {
            for (const file of req.files) {
                console.log(`Processing ${file.originalname} (${file.size} bytes)...`);

                // Upload to Blob if token exists
                let blobUrl = file.originalname;
                if (process.env.BLOB_READ_WRITE_TOKEN) {
                    try {
                        const blob = await put('receipts/' + file.originalname, file.buffer, { access: 'public' });
                        blobUrl = blob.url;
                        console.log(`Uploaded to Blob: ${blobUrl}`);
                    } catch (blobErr) {
                        console.error('Blob upload failed, using filename:', blobErr);
                    }
                }

                try {
                    const serials = await extractSerials(file.buffer, file.originalname);

                    let fileInserted = 0;
                    let fileDuplicates = 0;

                    // We need to check duplicates manually for counting purposes if using simple run
                    // Or we check changes

                    for (const serial of serials) {
                        // We execute one by one
                        const info = await dbModule.run(insertSql, [serial, blobUrl]);

                        // info.changes for SQLite, result.rowCount for Postgres (mapped to changes in db.js)
                        if (info.changes > 0) {
                            fileInserted++;
                        } else {
                            fileDuplicates++;
                        }
                    }

                    summary.totalCandidates += serials.length;
                    summary.inserted += fileInserted;
                    summary.duplicates += fileDuplicates;
                    summary.results.push({
                        filename: file.originalname,
                        found: serials.length,
                        new: fileInserted,
                        duplicates: fileDuplicates,
                        url: blobUrl
                    });
                } catch (ocrErr) {
                    console.error(`OCR failed for ${file.originalname}:`, ocrErr);
                    summary.results.push({
                        filename: file.originalname,
                        error: 'Processing failed'
                    });
                }
            }

            console.log('Extraction complete:', summary);
            res.json(summary);

        } catch (err) {
            console.error('Critical Extraction Error:', err);
            res.status(500).json({ error: 'Failed to process images: ' + err.message });
        }
    });
});

/**
 * GET /serials
 */
app.get('/api/serials', async (req, res) => {
    try {
        const rows = await dbModule.all('SELECT serial_number FROM serials ORDER BY serial_number ASC');
        const serialList = rows.map(r => r.serial_number);
        res.json(serialList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error.' });
    }
});

/**
 * GET /records
 */
app.get('/api/records', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const query = req.query.q ? `%${req.query.q}%` : '%';

        // Count
        const countSql = 'SELECT COUNT(*) as total FROM serials WHERE serial_number LIKE ?';
        // Note: For PG, LIKE is case sensitive usually, ILIKE is better, but let's stick to standard for now.
        // Also db module handles ? -> $1 conversion

        let totalResult = await dbModule.get(countSql, [query]);
        const totalRecords = totalResult ? (totalResult.total || totalResult.count) : 0; // PG might return count string
        const totalPages = Math.ceil(Number(totalRecords) / limit);

        // Data
        // SQLite uses LIMIT ? OFFSET ?
        // Postgres uses LIMIT $x OFFSET $y
        // Our adapter handles the params conversion
        const sql = `
            SELECT serial_number, source_filename, extracted_at, status 
            FROM serials 
            WHERE serial_number LIKE ? 
            ORDER BY id DESC 
            LIMIT ? OFFSET ?
        `;

        const rows = await dbModule.all(sql, [query, limit, offset]);

        res.json({
            data: rows,
            pagination: {
                current: page,
                limit: limit,
                totalRecords: Number(totalRecords),
                totalPages: totalPages
            }
        });
    } catch (err) {
        console.error('Fetch records failed:', err);
        res.status(500).json({ error: 'Failed to fetch records.' });
    }
});

/**
 * GET /export
 */
app.get('/api/export', async (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);

    try {
        if (format === 'db') {
            // Only supported for local sqlite
            if (dbModule.isPostgres || !dbModule.path) {
                return res.status(400).send("DB export not supported on Vercel/Postgres. Use SQL or CSV.");
            }
            const dbPath = dbModule.path;
            const tempPath = path.join(__dirname, `serials_backup_${Date.now()}.db`);
            fs.copyFileSync(dbPath, tempPath);
            const fileBuffer = fs.readFileSync(tempPath);
            fs.unlinkSync(tempPath);

            res.setHeader('Content-Disposition', `attachment; filename=serials_backup_${dateStr}.db`);
            res.setHeader('Content-Type', 'application/x-sqlite3');
            return res.send(fileBuffer);

        } else if (format === 'sql') {
            const rows = await dbModule.all('SELECT * FROM serials');
            const sqlContent = rows.map(row => {
                // ... same logic ...
                const vals = [
                    `'${row.serial_number}'`,
                    row.source_filename ? `'${row.source_filename.replace(/'/g, "''")}'` : 'NULL',
                    `'${row.extracted_at}'`,
                    `'${row.status}'`
                ].join(', ');
                return `INSERT OR IGNORE INTO serials (serial_number, source_filename, extracted_at, status) VALUES (${vals});`;
            }).join('\n');

            const dump = `
/* Schema is dialect specific, omitted for brevity in export */
${sqlContent}`;

            res.setHeader('Content-Disposition', `attachment; filename=serials_dump_${dateStr}.sql`);
            res.setHeader('Content-Type', 'application/sql');
            return res.send(dump);

        } else {
            // Default: CSV
            const rows = await dbModule.all('SELECT serial_number, source_filename, extracted_at, status FROM serials ORDER BY id ASC');
            const header = 'serial_number,source_filename,extracted_at,status\n';
            const csvContent = header + rows.map(row => {
                return [
                    row.serial_number,
                    `"${(row.source_filename || '').replace(/"/g, '""')}"`,
                    row.extracted_at,
                    row.status
                ].join(',');
            }).join('\n');

            res.setHeader('Content-Disposition', `attachment; filename=serials_export_${dateStr}.csv`);
            res.setHeader('Content-Type', 'text/csv');
            return res.send(csvContent);
        }

    } catch (err) {
        console.error('Export failed:', err);
        res.status(500).send('Could not export database.');
    }
});

/**
 * POST /import
 */
app.post('/api/import', csvUpload.single('database'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    try {
        console.log('Starting CSV import...');
        const csvText = req.file.buffer.toString('utf-8');
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

        if (lines.length === 0) {
            return res.status(400).json({ error: 'Empty CSV file.' });
        }

        const startIndex = lines[0].toLowerCase().includes('serial_number') ? 1 : 0;

        let insertSql;
        if (dbModule.isPostgres) {
            insertSql = `
            INSERT INTO serials (serial_number, source_filename, extracted_at, status) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(serial_number) DO UPDATE SET
                source_filename = excluded.source_filename,
                extracted_at = excluded.extracted_at,
                status = excluded.status
        `;
        } else {
            insertSql = `
            INSERT INTO serials (serial_number, source_filename, extracted_at, status) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(serial_number) DO UPDATE SET
                source_filename = excluded.source_filename,
                extracted_at = excluded.extracted_at,
                status = excluded.status
        `;
        }

        let insertedCount = 0;

        // Process sequentially for simplicity and unified support
        const dataRows = lines.slice(startIndex);
        for (const row of dataRows) {
            // ... parsing logic ...
            let serial, filename, date, status;
            if (!row.includes(',')) {
                serial = row.trim();
                filename = 'imported_csv';
                date = new Date().toISOString();
                status = 'imported';
            } else {
                const cols = row.split(',');
                serial = cols[0].trim();
                filename = cols[1] ? cols[1].replace(/^"|"$/g, '').trim() : 'imported_csv';
                date = cols[2] ? cols[2].trim() : new Date().toISOString();
                status = cols[3] ? cols[3].trim() : 'imported';
            }

            if (serial && serial.length > 0) {
                try {
                    await dbModule.run(insertSql, [serial, filename, date, status]);
                    insertedCount++;
                } catch (e) {
                    console.warn(`Failed to insert row: ${row}`, e);
                }
            }
        }

        console.log(`CSV Import successful. Processed ${dataRows.length} lines.`);
        res.json({ success: true, message: `Imported ${insertedCount} serials successfully.` });

    } catch (err) {
        console.error('Import failed:', err);
        res.status(500).json({ error: 'CSV import failed: ' + err.message });
    }
});

/**
 * POST /api/serials/batch
 * Manually add a batch of serials.
 */
app.post('/api/serials/batch', async (req, res) => {
    const { serials } = req.body;
    if (!serials || !Array.isArray(serials) || serials.length === 0) {
        return res.status(400).json({ error: 'Invalid serials list.' });
    }

    const insertSql = dbModule.isPostgres
        ? `INSERT INTO serials (serial_number, source_filename, status) VALUES ($1, 'manual_entry', 'confirmed') ON CONFLICT(serial_number) DO NOTHING`
        : `INSERT INTO serials (serial_number, source_filename, status) VALUES (?, 'manual_entry', 'confirmed') ON CONFLICT(serial_number) DO NOTHING`;

    let inserted = 0;
    let duplicates = 0;

    try {
        // Sequential execution for simplicity
        for (const serial of serials) {
            try {
                const info = await dbModule.run(insertSql, [serial]);
                if (info.changes > 0) inserted++;
                else duplicates++;
            } catch (e) {
                console.error(`Failed to insert manual serial ${serial}:`, e);
            }
        }
        res.json({ success: true, added: inserted, duplicates: duplicates });
    } catch (err) {
        console.error('Batch add failed:', err);
        res.status(500).json({ error: 'Batch add failed.' });
    }
});

/**
 * DELETE /api/serials/:serial
 * Remove a serial number.
 */
app.delete('/api/serials/:serial', async (req, res) => {
    const serial = req.params.serial;
    if (!serial) return res.status(400).json({ error: 'Serial required.' });

    const deleteSql = 'DELETE FROM serials WHERE serial_number = ?'; // dbModule handles ? -> $1

    try {
        const info = await dbModule.run(deleteSql, [serial]);
        if (info.changes > 0) {
            res.json({ success: true, message: 'Deleted successfully.' });
        } else {
            res.status(404).json({ error: 'Serial not found.' });
        }
    } catch (err) {
        console.error('Delete failed:', err);
        res.status(500).json({ error: 'Delete failed.' });
    }
});

/**
 * POST /api/reset
 */
app.post('/api/reset', async (req, res) => {
    const confirm = req.headers['x-confirm-reset'];
    if (confirm !== 'true') {
        return res.status(400).json({ error: 'Missing confirmation header.' });
    }

    try {
        console.log('WARNING: Resetting database...');

        if (dbModule.isPostgres) {
            await dbModule.run('TRUNCATE TABLE serials RESTART IDENTITY');
            await dbModule.run('DROP TABLE IF EXISTS serials'); // Or just drop/create
            // Actually initSchema will create if not exists.
            // Let's just DELETE ALL
            await dbModule.run('DELETE FROM serials');
        } else {
            // 1. Close connection
            dbModule.close();
            // 2. Delete database file
            const dbPath = dbModule.path;
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
            }
            // 3. Re-initialize
            await dbModule.reconnect();
        }

        console.log('Database reset complete.');
        res.json({ success: true, message: 'Database has been wiped successfully.' });

    } catch (err) {
        console.error('Reset failed:', err);
        if (!dbModule.isPostgres) try { await dbModule.reconnect(); } catch (e) { }
        res.status(500).json({ error: 'Database reset failed: ' + err.message });
    }
});

// For Vercel, we export the app.
// For local 'node index.js', we listen.
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

module.exports = app;
