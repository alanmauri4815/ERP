const fs = require('fs');
const txt = fs.readFileSync('main.js', 'utf8');
txt.split('\n').forEach((l, i) => {
    if (l.includes("function renderView")) {
        console.log(i + 1, l);
    }
});
