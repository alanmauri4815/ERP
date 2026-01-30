async function testLogin() {
    try {
        const response = await fetch('https://erp-backend-0fis.onrender.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'Mavamudi', password: 'jabenica4815' })
        });
        const status = response.status;
        const text = await response.text();
        console.log('Status:', status);
        console.log('Output:', text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testLogin();
