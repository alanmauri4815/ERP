const fetch = require('node-fetch');

async function test() {
    console.log('Fetching products from local server...');
    try {
        // We need a valid token. Since I don't want to hardcode a user, 
        // I'll check if there's a test user or just try to login first.
        // But for testing, I'll temporarily disable auth in a small endpoint or just try the login.

        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'Mavamudi', password: '123' }) // Looking at previous checks for user
        });
        const loginJson = await loginRes.json();

        if (!loginJson.token) {
            console.error('Login failed:', loginJson);
            return;
        }

        const token = loginJson.token;
        const res = await fetch('http://localhost:3001/api/products', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const prods = await res.json();
        console.log(`Found ${prods.length} products.`);
        if (prods.length > 0) {
            console.log('First product:', prods[0]);
        }
    } catch (e) {
        console.error('Test error:', e.message);
    }
}

test();
