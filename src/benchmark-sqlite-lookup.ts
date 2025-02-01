import Database from 'better-sqlite3';

interface UserData {
    id: number;
    address: string;
    twitterUsername: string;
    twitterName: string;
}

async function periodicLookup() {
    // Connect to existing database
    const db = new Database('users.db');
    
    // Get total count of users for random selection
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    
    // Prepare the lookup statement
    const lookupStmt = db.prepare<[string]>(`
        SELECT * FROM users WHERE lower(address) = lower(?)
    `);
    
    // Prepare statement to get random user
    const randomUserStmt = db.prepare<[number]>(`
        SELECT * FROM users LIMIT 1 OFFSET ?
    `);

    const lookupTimes: number[] = [];
    let count = 0;
    const duration = 60000; // 1 minute
    const interval = 5000; // 5 seconds
    const startTime = Date.now();

    return new Promise<void>((resolve) => {
        const timer = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= duration) {
                clearInterval(timer);
                
                // Print summary
                const avgLookup = lookupTimes.reduce((a, b) => a + b, 0) / lookupTimes.length;
                const minLookup = Math.min(...lookupTimes);
                const maxLookup = Math.max(...lookupTimes);

                console.log('\nSummary:');
                console.log(`Total lookups: ${count}`);
                console.log(`Average lookup time: ${avgLookup.toFixed(3)}ms`);
                console.log(`Fastest lookup: ${minLookup.toFixed(3)}ms`);
                console.log(`Slowest lookup: ${maxLookup.toFixed(3)}ms`);
                
                db.close();
                resolve();
                return;
            }

            // Get random user
            const randomOffset = Math.floor(Math.random() * totalUsers.count);
            const randomUser = randomUserStmt.get(randomOffset) as UserData;
            
            // Do lookup
            const lookupStart = performance.now();
            const found = lookupStmt.get(randomUser.address) as UserData;
            const lookupTime = performance.now() - lookupStart;
            lookupTimes.push(lookupTime);
            count++;

            console.log(`\nLookup #${count} (${(elapsedTime/1000).toFixed(1)}s):`);
            console.log(`Address: ${found.address}`);
            console.log(`Twitter: @${found.twitterUsername}`);
            console.log(`Name: ${found.twitterName}`);
            console.log(`Lookup time: ${lookupTime.toFixed(3)}ms`);
        }, interval);
    });
}

periodicLookup().catch(console.error); 