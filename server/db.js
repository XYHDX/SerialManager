const path = require('path');
const fs = require('fs');

// Environment variables
require('dotenv').config();

let db;
let isPostgres = false;

// Check for Vercel Postgres
if (process.env.POSTGRES_URL) {
    const { createPool } = require('@vercel/postgres');
    console.log('Using Vercel Postgres database w/ POSTGRES_URL');
    isPostgres = true;
    db = createPool({
        connectionString: process.env.POSTGRES_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
    // Fallback to SQLite
    // Use dynamic require via createRequire to bypass Vercel/Webpack bundler analysis completely
    let Database;
    try {
        const { createRequire } = require('module');
        const customRequire = createRequire(__filename);
        Database = customRequire('better-sqlite3');
    } catch (e) {
        console.error("SQLite module not found (expected in Vercel env):", e.message);
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

    // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT, Postgres uses SERIAL
    // We can use a slightly different query for SQLite to maintain compatibility context
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
            await db.query(createTableQuery);
            console.log('Postgres schema initialized.');
        } catch (err) {
            console.error('Failed to init Postgres schema:', err);
        }
    } else {
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
            // Convert ? to $1, $2, etc. logic is tricky with simple regex if params are mixed.
            // But we can just enforce standard parameterized queries in the app logic or handle simple conversion here.
            // For simplicity, let's assume the app sends standard SQL and we convert ? -> $n
            let pIdx = 1;
            const pgQuery = query.replace(/\?/g, () => `$${pIdx++}`);

            try {
                const result = await db.query(pgQuery, params);
                return { changes: result.rowCount };
            } catch (e) {
                // Handle unique constraint violation specifically if possible, or just throw
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

    // Transaction wrapper
    // SQLite 'transaction' returns a function that executes immediately when called.
    // implementation: db.transaction(fn) -> returns executable function.
    // For conversion, we'll try to keep the signature similar but it might need refactoring in index.js specifically.
    // Better-sqlite3 transactions allow synchronous execution which is fast.
    // Postgres transactions are async.
    // We will expose the raw db object for advanced usage but recommend using helpers.
    // This part is the trickiest validation point.
    // For now, let's export the raw DB and handle logic in index.js
    raw: db,
    path: !isPostgres ? path.join(__dirname, 'serials.db') : null,

    close: () => {
        if (!isPostgres && db && db.open) {
            db.close();
            console.log('Database connection closed.');
        }
        // Postgres pool handles itself usually, or we can await db.end() if using pool directly
    },

    reconnect: async () => {
        if (!isPostgres) {
            if (db && db.open) db.close();
            const Database = require('better-sqlite3');
            const dbPath = path.join(__dirname, 'serials.db');
            db = new Database(dbPath, { verbose: console.log });
            await initSchema();
            console.log('Database connection reopened.');

            // Re-bind raw
            methods.raw = db;
        }
    }
};

module.exports = methods;
