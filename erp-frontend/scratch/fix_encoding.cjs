const { execSync } = require('child_process');
const fs = require('fs');

try {
    // Fetch the file content from git as a buffer to preserve encoding
    const buffer = execSync('git show 30298cd:erp-frontend/main.js'); // Use the latest commit I just made
    
    // Convert buffer to string assuming UTF-8
    let content = buffer.toString('utf8');

    // Manually fix common mojibake if they exist
    const replacements = [
        [/├¡/g, 'í'],
        [/├│/g, 'ó'],
        [/├║/g, 'ú'],
        [/├í/g, 'á'],
        [/├®/g, 'é'],
        [/├▒/g, 'ñ'],
        [/┬░/g, 'º'],
        [/┬┐/g, '¿'],
        [/┬á/g, ' '],
        [/┬─/g, '—'],
        [/Ô£ò/g, '✖'],
        [/Ô£Å´©Å/g, '📝'],
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
        [/­ƒöä/g, '🔄'],
        [/­ƒÆ©/g, '💸'],
        [/­ƒôè/g, '📊'],
        [/­ƒöº/g, '🛠️']
    ];

    replacements.forEach(([regex, replacement]) => {
        content = content.replace(regex, replacement);
    });

    fs.writeFileSync('main.js', content, 'utf8');
    console.log('File encoding fixed and saved as UTF-8');
} catch (e) {
    console.error('Error fixing encoding:', e.message);
}
