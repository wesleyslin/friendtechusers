import axios from 'axios';
import https from 'https';
import fs from 'fs/promises';
import path from 'path';

interface UserData {
    id: number;
    address: string;
    twitterUsername: string;
    twitterName: string;
}

interface State {
    lastProcessedId: number;
}

const DATA_DIR = 'data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'users.json');
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 500;
const CONSECUTIVE_EMPTY_THRESHOLD = 3;

const proxyAuth = {
    username: 'brd-customer-hl_c1ebbeb3-zone-datacenter_proxy1',
    password: 's5nv0g1n9ag5'
};

const proxyClient = axios.create({
    proxy: {
        host: 'brd.superproxy.io',
        port: 22225,
        auth: {
            username: proxyAuth.username,
            password: proxyAuth.password
        },
        protocol: 'https'
    },
    httpsAgent: new https.Agent({ 
        rejectUnauthorized: false,
        keepAlive: true,
        maxSockets: 100,
        timeout: 10000
    }),
    timeout: 10000,
    headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=10',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    }
});

async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR);
    }
}

async function loadState(): Promise<State> {
    await ensureDataDir();
    try {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        const state = JSON.parse(data);
        console.log('Found state file:', state);
        console.log('Resuming from ID:', state.lastProcessedId);
        return state;
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            const initialState = { lastProcessedId: 10 };
            console.log('Creating new state file:', initialState);
            await saveState(initialState);
            return initialState;
        }
        throw error;
    }
}

async function saveState(state: State): Promise<void> {
    await ensureDataDir();
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchUserWithRetry(id: number, retries = 0): Promise<UserData | null> {
    try {
        const response = await proxyClient.get(`https://prod-api.kosetto.com/users/by-id/${id}`);
        
        if (response.data.message === "Address/User not found.") {
            console.log(`ID ${id}: User not found`);
            return null;
        }

        console.log(`ID ${id}: Found user ${response.data.twitterUsername}`);
        return {
            id: id,
            address: response.data.address,
            twitterUsername: response.data.twitterUsername,
            twitterName: response.data.twitterName
        };
    } catch (error: any) {
        if (retries < MAX_RETRIES) {
            console.log(`Retry ${retries + 1} for ID ${id}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
            return fetchUserWithRetry(id, retries + 1);
        }
        console.error(`Failed to fetch ID ${id} after ${MAX_RETRIES} retries:`, error?.message);
        return null;
    }
}

async function processBatch(ids: number[]): Promise<UserData[]> {
    const results = await Promise.allSettled(
        ids.map(id => fetchUserWithRetry(id))
    );
    
    return results
        .filter((result): result is PromiseFulfilledResult<UserData> => 
            result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value);
}

async function appendUsers(newUsers: UserData[]): Promise<void> {
    if (newUsers.length === 0) {
        console.log('No new users to save');
        return;
    }
    
    await ensureDataDir();
    try {
        let users: UserData[] = [];
        try {
            const data = await fs.readFile(OUTPUT_FILE, 'utf-8');
            if (data.trim()) {
                try {
                    users = JSON.parse(data);
                    console.log('Loaded existing users:', users.length);
                } catch (parseError) {
                    console.log('Invalid JSON in users file, starting fresh');
                    users = [];
                }
            } else {
                console.log('Empty users file, starting fresh');
            }
        } catch (error: any) {
            if (error?.code !== 'ENOENT') {
                console.log('Error reading users file, starting fresh:', error?.message);
            } else {
                console.log('No existing users file, creating new one');
            }
        }

        let uniqueNewUsers = newUsers;
        if (users.length > 0) {
            const existingAddresses = new Set(users.map(u => u.address.toLowerCase()));
            uniqueNewUsers = newUsers.filter(user => !existingAddresses.has(user.address.toLowerCase()));
        }

        if (uniqueNewUsers.length === 0) {
            console.log('All users were duplicates');
            return;
        }

        users.push(...uniqueNewUsers);
        
        const tempFile = `${OUTPUT_FILE}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(users, null, 2));
        await fs.rename(tempFile, OUTPUT_FILE);
        
        console.log(`Saved ${uniqueNewUsers.length} new users (Batch had ${newUsers.length} total)`);
        console.log('Sample of saved users:', uniqueNewUsers.slice(0, 3));
    } catch (error: any) {
        console.error('Error saving users:', error?.message);
        console.error('Error details:', error);
        throw error;
    }
}

async function fetchUsers() {
    const state = await loadState();
    let currentId = state.lastProcessedId + 1;
    let consecutiveEmptyResponses = 0;
    const startTime = Date.now();
    
    while (true) {
        const batchIds = Array.from({ length: BATCH_SIZE }, (_, i) => currentId + i);
        
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        const processedIds = currentId - state.lastProcessedId;
        const rate = processedIds / elapsedMinutes;
        
        console.log(`Processing batch ${currentId}-${currentId + BATCH_SIZE - 1} (${rate.toFixed(1)} IDs/min)`);
        
        try {
            const users = await processBatch(batchIds);
            console.log(`Found ${users.length} users in current batch`);
            
            if (users.length > 0) {
                consecutiveEmptyResponses = 0;
                await appendUsers(users);
            } else {
                console.log('Batch returned no users');
                consecutiveEmptyResponses++;
                if (consecutiveEmptyResponses >= CONSECUTIVE_EMPTY_THRESHOLD) {
                    console.log('No users found in last 3 batches. Stopping.');
                    break;
                }
            }
            
            currentId += BATCH_SIZE;
            state.lastProcessedId = currentId - 1;
            await saveState(state);
            
        } catch (error) {
            console.error('Batch error:', error);
            currentId += BATCH_SIZE;
            state.lastProcessedId = currentId - 1;
            await saveState(state);
        }
    }
}

fetchUsers().catch(console.error);