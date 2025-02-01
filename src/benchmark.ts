import fs from 'fs/promises';
import path from 'path';

interface UserData {
    id: number;
    address: string;
    twitterUsername: string;
    twitterName: string;
}

async function periodicLookup() {
    // Load the JSON file
    console.log('Loading users.json...');
    const start = performance.now();
    const data = await fs.readFile(path.join('data', 'users.json'), 'utf-8');
    const users: UserData[] = JSON.parse(data);
    const loadTime = performance.now() - start;
    console.log(`Loaded ${users.length} users in ${loadTime.toFixed(2)}ms\n`);

    const lookupTimes: number[] = [];
    let count = 0;
    const duration = 60000; // 1 minute
    const interval = 5000; // 10 seconds
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
                
                resolve();
                return;
            }

            // Do random lookup
            const randomUser = users[Math.floor(Math.random() * users.length)];
            const lookupStart = performance.now();
            const found = users.find(u => u.address.toLowerCase() === randomUser.address.toLowerCase());
            const lookupTime = performance.now() - lookupStart;
            lookupTimes.push(lookupTime);
            count++;

            console.log(`\nLookup #${count} (${(elapsedTime/1000).toFixed(1)}s):`);
            console.log(`Address: ${randomUser.address}`);
            console.log(`Twitter: @${randomUser.twitterUsername}`);
            console.log(`Name: ${randomUser.twitterName}`);
            console.log(`Lookup time: ${lookupTime.toFixed(3)}ms`);
        }, interval);
    });
}

periodicLookup().catch(console.error); 