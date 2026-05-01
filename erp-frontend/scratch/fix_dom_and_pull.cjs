const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// 1. Fix the broken HTML structure (Extra </div>s)
// We look for the closing of mo-details-group and then the extra divs
content = content.replace(
    /<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<table class="item-table">/,
    `          </div>
        </div>

        <table class="item-table">`
);

// If that doesn't match exactly, I'll try a more robust way
content = content.replace(
    /<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<\/div>\s+<table class="item-table">/,
    `          </div>
        </div>

        <table class="item-table">`
);

// 2. Improve PULL logic to clear table first and only show needed items
content = content.replace(
    /const itemsToProduce = quote\.items\.filter\(it => it\.item_type === 'venta' \|\| it\.item_type === 'producto' \|\| !it\.item_type\);/,
    `// En PULL, filtramos solo los productos a fabricar (no MP ni MO suelta)
                const itemsToProduce = quote.items.filter(it => 
                  it.item_type === 'venta' || 
                  it.item_type === 'producto' || 
                  (it.type !== 'MP' && it.type !== 'MO' && it.item_type !== 'material' && it.item_type !== 'labor')
                );`
);

fs.writeFileSync('main.js', content);
console.log('DOM and Pull logic fix applied');
