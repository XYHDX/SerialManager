const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dbModule = require('./db');
const { extractSerials } = require('./ocr');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure Multer for memory storage (processing images in-memory)
// Increased limit to 100 as per user request
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure Multer for CSV file upload (memory storage for parsing)
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * POST /extract
 * Accepts multiple image files.
 * Returns: { 
 *   totalCandidates: number, 
 *   validSerials: number, 
 *   inserted: number, 
 *   duplicates: number, 
 *   results: Array<{ filename, serials: [] }> 
 * }
 */
app.post('/extract', (req, res) => {
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

        const db = dbModule.get();
        const insertStmt = db.prepare(`
        INSERT INTO serials (serial_number, source_filename) 
        VALUES (?, ?)
        ON CONFLICT(serial_number) DO NOTHING
      `);

        try {
            for (const file of req.files) {
                console.log(`Processing ${file.originalname} (${file.size} bytes)...`);
                try {
                    const serials = await extractSerials(file.buffer, file.originalname);

                    let fileInserted = 0;
                    let fileDuplicates = 0;

                    const insertTransaction = db.transaction((serialList) => {
                        for (const serial of serialList) {
                            const info = insertStmt.run(serial, file.originalname);
                            if (info.changes > 0) {
                                fileInserted++;
                            } else {
                                fileDuplicates++;
                            }
                        }
                    });

                    insertTransaction(serials);

                    summary.totalCandidates += serials.length;
                    summary.inserted += fileInserted;
                    summary.duplicates += fileDuplicates;
                    summary.results.push({
                        filename: file.originalname,
                        found: serials.length,
                        new: fileInserted,
                        duplicates: fileDuplicates
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
 * Returns all serial numbers for the frontend search/suggestions.
 */
app.get('/serials', (req, res) => {
    try {
        const db = dbModule.get();
        const rows = db.prepare('SELECT serial_number FROM serials ORDER BY serial_number ASC').all();
        const serialList = rows.map(r => r.serial_number);
        res.json(serialList);
    } catch (err) {
        res.status(500).json({ error: 'Database error.' });
    }
});

/**
 * GET /records
 * Returns paginated and filtered records.
 * Query params: page, limit, q (search)
 */
app.get('/records', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const query = req.query.q ? `%${req.query.q}%` : '%';

        const db = dbModule.get();

        // Get total count for pagination
        const countStmt = db.prepare('SELECT COUNT(*) as total FROM serials WHERE serial_number LIKE ?');
        const totalResult = countStmt.get(query);
        const totalRecords = totalResult.total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get paginated data
        const stmt = db.prepare(`
            SELECT serial_number, source_filename, extracted_at, status 
            FROM serials 
            WHERE serial_number LIKE ? 
            ORDER BY id DESC 
            LIMIT ? OFFSET ?
        `);
        const rows = stmt.all(query, limit, offset);

        res.json({
            data: rows,
            pagination: {
                current: page,
                limit: limit,
                totalRecords: totalRecords,
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
 * Downloads the database in specified format: csv (default), sql, db
 */
app.get('/export', (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();
    const db = dbModule.get();
    const dateStr = new Date().toISOString().slice(0, 10);

    try {
        if (format === 'db') {
            const dbPath = dbModule.path;
            const tempPath = path.join(__dirname, `serials_backup_${Date.now()}.db`);

            if (!dbPath) return res.status(500).send('DB Path error.');

            fs.copyFileSync(dbPath, tempPath);
            const fileBuffer = fs.readFileSync(tempPath);
            fs.unlinkSync(tempPath);

            res.setHeader('Content-Disposition', `attachment; filename=serials_backup_${dateStr}.db`);
            res.setHeader('Content-Type', 'application/x-sqlite3');
            return res.send(fileBuffer);

        } else if (format === 'sql') {
            const rows = db.prepare('SELECT * FROM serials').all();
            const sqlContent = rows.map(row => {
                const vals = [
                    `'${row.serial_number}'`,
                    row.source_filename ? `'${row.source_filename.replace(/'/g, "''")}'` : 'NULL',
                    `'${row.extracted_at}'`,
                    `'${row.status}'`
                ].join(', ');
                return `INSERT OR IGNORE INTO serials (serial_number, source_filename, extracted_at, status) VALUES (${vals});`;
            }).join('\n');

            const dump = `
CREATE TABLE IF NOT EXISTS serials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_number TEXT UNIQUE NOT NULL,
  source_filename TEXT,
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'confirmed'
);
${sqlContent}`;

            res.setHeader('Content-Disposition', `attachment; filename=serials_dump_${dateStr}.sql`);
            res.setHeader('Content-Type', 'application/sql');
            return res.send(dump);

        } else {
            // Default: CSV
            const rows = db.prepare('SELECT serial_number, source_filename, extracted_at, status FROM serials ORDER BY id ASC').all();
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
 * Uploads a CSV file and merges it into the current database.
 */
app.post('/import', csvUpload.single('database'), (req, res) => {
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

        // Basic parsing assuming header: serial_number,source_filename,extracted_at,status
        // We'll skip the header row if it looks like a header
        const startIndex = lines[0].toLowerCase().includes('serial_number') ? 1 : 0;

        const db = dbModule.get();
        const insertStmt = db.prepare(`
            INSERT INTO serials (serial_number, source_filename, extracted_at, status) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(serial_number) DO UPDATE SET
                source_filename = excluded.source_filename,
                extracted_at = excluded.extracted_at,
                status = excluded.status
        `);

        let insertedCount = 0;
        const transaction = db.transaction((rows) => {
            for (const row of rows) {
                let serial, filename, date, status;

                // Simple CSV parse: split by comma if present
                if (!row.includes(',')) {
                    serial = row.trim();
                    filename = 'imported_csv';
                    date = new Date().toISOString();
                    status = 'imported';
                } else {
                    const cols = row.split(','); // Crude parsing
                    serial = cols[0].trim();
                    // Handle quoted filename "file,name.png"
                    filename = cols[1] ? cols[1].replace(/^"|"$/g, '').trim() : 'imported_csv';
                    date = cols[2] ? cols[2].trim() : new Date().toISOString();
                    status = cols[3] ? cols[3].trim() : 'imported';
                }

                if (serial && serial.length > 0) {
                    try {
                        insertStmt.run(serial, filename, date, status);
                        insertedCount++;
                    } catch (e) {
                        console.warn(`Failed to insert row: ${row}`, e);
                    }
                }
            }
        });

        transaction(lines.slice(startIndex));

        console.log(`CSV Import successful. Processed ${lines.length - startIndex} lines.`);
        res.json({ success: true, message: `Imported ${insertedCount} serials successfully.` });

    } catch (err) {
        console.error('Import failed:', err);
        res.status(500).json({ error: 'CSV import failed: ' + err.message });
    }
});

/**
 * POST /api/reset
 * DANGER: Wipes the entire database.
 * Requires header: X-Confirm-Reset: true
 */
app.post('/api/reset', (req, res) => {
    const confirm = req.headers['x-confirm-reset'];
    if (confirm !== 'true') {
        return res.status(400).json({ error: 'Missing confirmation header.' });
    }

    try {
        console.log('WARNING: Resetting database...');

        // 1. Close connection
        dbModule.close();

        // 2. Delete database file
        const dbPath = dbModule.path;
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
            console.log('Database file deleted.');
        }

        // 3. Re-initialize (creates new file and schema)
        dbModule.reconnect();

        console.log('Database reset complete.');
        res.json({ success: true, message: 'Database has been wiped successfully.' });

    } catch (err) {
        console.error('Reset failed:', err);
        // Attempt to restore connection state
        try { dbModule.reconnect(); } catch (e) { }
        res.status(500).json({ error: 'Database reset failed: ' + err.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
