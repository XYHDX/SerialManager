const { db } = require('@vercel/postgres');
console.log('Type of db:', typeof db);
console.log('Has query method:', typeof db.query);
console.log('Keys:', Object.keys(db));
