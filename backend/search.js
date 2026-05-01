const fs = require('fs');
const lines = fs.readFileSync('c:/Users/javii/Downloads/ERP Universal/erp-frontend/main.js', 'utf8').split('\n');
lines.forEach((l, i) => {
    if (l.includes('sale-category') || l.includes('value="pull"')) {
        console.log(i + 1, l);
    }
});
