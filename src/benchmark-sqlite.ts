import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';

interface UserData {
    id: number;
    address: string;
    twitterUsername: string;
    twitterName: string;
}

async function setupDatabase() {
    // Create/connect to SQLite database
    const db = new Database('users.db');
    
    // Create table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            address TEXT UNIQUE,
            twitterUsername TEXT,
            twitterName TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_address ON users(address);
    `);

    // Load JSON data
    console.log('Loading users.json...');
    const data = await fs.readFile(path.join('data', 'users.json'), 'utf-8');
    const users: UserData[] = JSON.parse(data);
    
    // Insert data into SQLite
    const insert = db.prepare(`
        INSERT OR REPLACE INTO users (id, address, twitterUsername, twitterName)
        VALUES (@id, @address, @twitterUsername, @twitterName)
    `);

    console.log('Inserting data into SQLite...');
    const insertStart = performance.now();
    
    db.transaction(() => {
        for (const user of users) {
            insert.run(user);
        }
    })();

    const insertTime = performance.now() - insertStart;
    console.log(`Inserted ${users.length} users in ${insertTime.toFixed(2)}ms`);
    
    // Verify the data
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    console.log(`\nVerification: Database contains ${count.count} users`);
    
    // Show a sample record
    const sample = db.prepare('SELECT * FROM users LIMIT 1').get() as UserData;
    console.log('\nSample record:');
    console.log(sample);

    return db;
}

setupDatabase().catch(console.error); 