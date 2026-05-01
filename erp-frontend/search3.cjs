const fs = require('fs');
const txt = fs.readFileSync('main.js', 'utf8');
txt.split('\n').forEach((l, i) => {
    if (l.includes("renderView('quotations')") || l.includes('data-view="quotations"')) {
        console.log(i + 1, l);
    }
});
