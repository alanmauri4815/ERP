const fs = require('fs');

let content = fs.readFileSync('main.js', 'utf8');

// List of mojibake and their correct emoji/character
const emojiFixes = [
    [/\uFFFD/g, '📦'], // Generic fix for lost emoji in filter (assuming it's mostly 📦)
    [/­ƒôª/g, '📦'],
    [/­ƒöä/g, '🔄'],
    [/­ƒÜÇ/g, '🚀'],
    [/­ƒÅ¬/g, '🏢'],
    [/­ƒôü/g, '📁'],
    [/­ƒôï/g, '📋'],
    [/­ƒæñ/g, '👤'],
    [/­ƒÆ░/g, '💰'],
    [/­ƒôè/g, '📊'],
    [/­ƒôÑ/g, '📥'],
    [/­ƒÆ©/g, '💸'],
    [/­ƒöº/g, '🛠️'],
    [/­ƒÄí/g, '🎪'],
    [/­ƒÆÁ/g, '💵'],
    [/­ƒÆ│/g, '💳'],
    [/­ƒæü´©Å/g, '👁️'],
    [/­ƒùæ´©Å/g, '🗑️'],
    [/­ƒÅù´©Å/g, '🏷️'],
    [/Ô£Å´©Å/g, '📝'],
    [/Ô£ò/g, '✖']
];

// Special fix for the filter dropdown
content = content.replace(/<option value="all" \${state\.purchaseFilters\.type === 'all' \? 'selected' : ''}>.*Todos los registros<\/option>/, 
    `<option value="all" \${state.purchaseFilters.type === 'all' ? 'selected' : ''}>📦 Todos los registros</option>`);

emojiFixes.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
});

// Also fix any remaining ├¡, ├│, etc.
content = content.replace(/├¡/g, 'í');
content = content.replace(/├│/g, 'ó');
content = content.replace(/├║/g, 'ú');
content = content.replace(/├í/g, 'á');
content = content.replace(/├®/g, 'é');
content = content.replace(/├▒/g, 'ñ');
content = content.replace(/┬░/g, 'º');

fs.writeFileSync('main.js', content, 'utf8');
console.log('Emojis and mojibake fixed in main.js');
