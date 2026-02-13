const path = require('path');
const fs = require('fs');

// Environment variables
require('dotenv').config();

let db;
let isPostgres = false;

// Check for Neon/Vercel Postgres
// Vercel/Neon uses DATABASE_URL or POSTGRES_URL
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (connectionString) {
    // Use Neon Serverless Pool (simulates pg.Pool over WebSocket/HTTP)
    const { Pool } = require('@neondatabase/serverless');
    console.log('Using Neon Database (Pool)');
    isPostgres = true;
    db = new Pool({ connectionString });
} else {
    // Fallback to SQLite
    // Use dynamic require via createRequire to bypass Vercel/Webpack bundler analysis completely
    let Database;
    try {
        const { createRequire } = require('module');
        const customRequire = createRequire(__filename);
        Database = customRequire('better-sqlite3');
    } catch (e) {
        console.error("SQLite module not found (expected in Vercel env if PG is missing):", e.message);
    }

    if (Database) {
        const dbPath = path.join(__dirname, 'serials.db');
        console.log('Using local SQLite database at:', dbPath);
        try {
            db = new Database(dbPath, { verbose: console.log });
        } catch (err) {
            console.error("Failed to initialize SQLite:", err);
        }
    }
}

// ---- Abstraction Layer ----

const initSchema = async () => {
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS serials (
      id SERIAL PRIMARY KEY,
      serial_number TEXT UNIQUE NOT NULL,
      source_filename TEXT,
      extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'confirmed'
    );
  `;

    // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT
    const sqliteCreateTableQuery = `
    CREATE TABLE IF NOT EXISTS serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      source_filename TEXT,
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'confirmed'
    );
  `;

    if (isPostgres) {
        try {
            // Pool uses .query()
            await db.query(createTableQuery);
            console.log('Postgres schema initialized.');
        } catch (err) {
            console.error('Failed to init Postgres schema:', err);
        }
    } else if (db) {
        db.exec(sqliteCreateTableQuery);
        console.log('SQLite schema initialized.');
    }
};

// Initialize schema
let initPromise = initSchema();

// Helper methods to unify API
const methods = {
    ready: () => initPromise,
    isPostgres,

    // Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
    // Returns { changes: number } or similar
    run: async (query, params = []) => {
        if (isPostgres) {
            // Convert ? to $1, $2 for Postgres
            let pIdx = 1;
            const pgQuery = query.replace(/\?/g, () => `$${pIdx++}`);

            try {
                // Pool returns standard PG result object with rowCount
                const result = await db.query(pgQuery, params);
                return { changes: result.rowCount };
            } catch (e) {
                console.error("Query failed:", pgQuery, params, e);
                // Duplicate key error code in Postgres is 23505
                if (e.code === '23505') {
                    return { changes: 0 };
                }
                throw e;
            }
        } else {
            const stmt = db.prepare(query);
            return stmt.run(...params);
        }
    },

    // Get a single row
    get: async (query, params = []) => {
        if (isPostgres) {
            let pIdx = 1;
            const pgQuery = query.replace(/\?/g, () => `$${pIdx++}`);
            const result = await db.query(pgQuery, params);
            return result.rows[0];
        } else {
            const stmt = db.prepare(query);
            return stmt.get(...params);
        }
    },

    // Get all rows
    all: async (query, params = []) => {
        if (isPostgres) {
            let pIdx = 1;
            const pgQuery = query.replace(/\?/g, () => `$${pIdx++}`);
            const result = await db.query(pgQuery, params);
            return result.rows;
        } else {
            const stmt = db.prepare(query);
            return stmt.all(...params);
        }
    },

    // Raw access
    raw: db,
    path: !isPostgres && db ? path.join(__dirname, 'serials.db') : null,

    close: () => {
        if (!isPostgres && db && db.open) {
            db.close();
        } else if (isPostgres && db) {
            db.end(); // Pool close
        }
    },

    reconnect: async () => {
        if (!isPostgres) {
            if (db && db.open) db.close();
            try {
                const { createRequire } = require('module');
                const customRequire = createRequire(__filename);
                const Database = customRequire('better-sqlite3');
                const dbPath = path.join(__dirname, 'serials.db');
                db = new Database(dbPath, { verbose: console.log });
                methods.raw = db;
                await initSchema();
            } catch (e) { console.error(e) }
        }
    }
};

module.exports = methods;
