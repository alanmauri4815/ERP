async function testRegister() {
    try {
        const response = await fetch('https://erp-backend-0fis.onrender.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'TestUser', password: 'password123' })
        });
        const status = response.status;
        const data = await response.json();
        console.log('Status:', status);
        console.log('Data:', data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testRegister();
