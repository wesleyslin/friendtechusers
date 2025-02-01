import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';

interface UserData {
    id: number;
    address: string;
    twitterUsername: string;
    twitterName: string;
}

async function runComparison() {
    console.log('Loading data sources...');
    
    // Load JSON
    const jsonStart = performance.now();
    const jsonData = await fs.readFile(path.join('data', 'users.json'), 'utf-8');
    const jsonUsers: UserData[] = JSON.parse(jsonData);
    const jsonLoadTime = performance.now() - jsonStart;
    
    // Connect to SQLite
    const db = new Database('users.db');
    const sqliteLoadTime = 0; // SQLite connects instantly
    
    // Prepare SQLite statement
    const lookupStmt = db.prepare<[string]>(`
        SELECT * FROM users WHERE lower(address) = lower(?)
    `);

    console.log('\nInitial load times:');
    console.log(`JSON: ${jsonLoadTime.toFixed(2)}ms`);
    console.log(`SQLite: ${sqliteLoadTime.toFixed(2)}ms`);

    // Run test lookups
    const iterations = 1000;
    const jsonLookupTimes: number[] = [];
    const sqliteLookupTimes: number[] = [];

    console.log(`\nRunning ${iterations} random lookups...`);
    
    for (let i = 0; i < iterations; i++) {
        // Get random address
        const randomUser = jsonUsers[Math.floor(Math.random() * jsonUsers.length)];
        const address = randomUser.address;

        // JSON lookup
        const jsonStart = performance.now();
        const jsonFound = jsonUsers.find(u => u.address.toLowerCase() === address.toLowerCase());
        const jsonTime = performance.now() - jsonStart;
        jsonLookupTimes.push(jsonTime);

        // SQLite lookup
        const sqliteStart = performance.now();
        const sqliteFound = lookupStmt.get(address) as UserData;
        const sqliteTime = performance.now() - sqliteStart;
        sqliteLookupTimes.push(sqliteTime);

        // Progress indicator
        if ((i + 1) % 100 === 0) {
            process.stdout.write(`\rCompleted ${i + 1}/${iterations} lookups`);
        }
    }

    // Calculate statistics and format them
    const jsonAvg = jsonLookupTimes.reduce((a, b) => a + b, 0) / jsonLookupTimes.length;
    const jsonMin = Math.min(...jsonLookupTimes);
    const jsonMax = Math.max(...jsonLookupTimes);
    
    const sqliteAvg = sqliteLookupTimes.reduce((a, b) => a + b, 0) / sqliteLookupTimes.length;
    const sqliteMin = Math.min(...sqliteLookupTimes);
    const sqliteMax = Math.max(...sqliteLookupTimes);

    console.log('\n\nResults:');
    console.log('┌────────────┬───────────┬───────────┬───────────┐');
    console.log('│   Method   │ Average   │   Min     │   Max     │');
    console.log('├────────────┼───────────┼───────────┼───────────┤');
    console.log(`│ JSON       │ ${jsonAvg.toFixed(3).padStart(9)}ms │ ${jsonMin.toFixed(3).padStart(7)}ms │ ${jsonMax.toFixed(3).padStart(7)}ms │`);
    console.log(`│ SQLite     │ ${sqliteAvg.toFixed(3).padStart(9)}ms │ ${sqliteMin.toFixed(3).padStart(7)}ms │ ${sqliteMax.toFixed(3).padStart(7)}ms │`);
    console.log('└────────────┴───────────┴───────────┴───────────┘');

    // Calculate speed difference
    const speedDiff = ((sqliteAvg - jsonAvg) / jsonAvg) * 100;
    if (speedDiff > 0) {
        console.log(`\nJSON is ${speedDiff.toFixed(1)}% faster than SQLite`);
    } else {
        console.log(`\nSQLite is ${Math.abs(speedDiff).toFixed(1)}% faster than JSON`);
    }

    console.log('\nAnalysis:');
    console.log(`• JSON takes ${jsonLoadTime.toFixed(2)}ms to load initially, but then lookups average ${jsonAvg.toFixed(3)}ms`);
    console.log(`• SQLite connects instantly, but lookups average ${sqliteAvg.toFixed(3)}ms`);
    console.log('\nNote: Lower numbers are better');

    db.close();
}

runComparison().catch(console.error); 