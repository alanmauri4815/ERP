const fetch = require('node-fetch');

async function test() {
    try {
        console.log('Testing local API /api/products...');
        const res = await fetch('http://localhost:3001/api/products', {
            headers: { 'Authorization': 'Bearer test_token' } // It will fail auth but we'll see if it responds
        });
        const json = await res.json();
        console.log('Response:', json);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
