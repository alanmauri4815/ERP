const fs = require('fs');
const txt = fs.readFileSync('server.js', 'utf8');
txt.split('\n').forEach((l, i) => {
    if (l.includes("'/api/empresas'")) {
        console.log(i + 1, l);
    }
});
