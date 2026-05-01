const fs = require('fs');
let lines = fs.readFileSync('main.js', 'utf8').split('\n');

// 1. Revert Logistics change (Line 1864-1870)
// Original was just line 1863 followed by line 1871 (old 1864)
// My current file has:
// 1863: <td>...</td>
// 1864-1870: New TD
// 1871: <td> (Badge)

// I will look for the exact content to remove it.
const startIdx = lines.findIndex(l => l.includes('1863:') || l.includes('<td>${p.date ? p.date.split(\'T\')[0] : \'-\'}</td>'));
// Wait, I Split by \n, so I don't have the line numbers in the string.

// Better approach: use index of unique string
const injectedStart = lines.findIndex(l => l.includes('const q = p.quotation_id ? state.quotations.find(quote => quote.id == p.quotation_id)'));
if (injectedStart !== -1) {
    // It's inside a <td> ... </td> block.
    // Line 1864 in the view_file output.
    // I want to remove the <td> starting at injectedStart-1 to injectedStart+5
    lines.splice(injectedStart - 1, 7);
}

// 2. Add to Production Table (Line 2203 area)
// In the current file (after removal above), it should be around 2196.
const prodStart = lines.findIndex(l => l.includes("PROD_CAT_LABELS = { push: '🚀 Push', pull: '🔄 Pull' };"));
if (prodStart !== -1) {
    // Find the <tr> after that
    const rowIdx = lines.findIndex((l, i) => i > prodStart && l.includes('<tr>'));
    if (rowIdx !== -1) {
        const dateIdx = lines.findIndex((l, i) => i > rowIdx && l.includes('<td>${p.date ? p.date.split(\'T\')[0] : \'-\'}</td>'));
        if (dateIdx !== -1) {
            lines.splice(dateIdx + 1, 0, `                <td>
                  \${(() => {
                    const q = p.quotation_id ? state.quotations.find(quote => quote.id == p.quotation_id) : null;
                    const cName = q?.clients?.name || q?.name || p.client_name || '-';
                    return \`<strong>\${cName}</strong>\`;
                  })()}
                </td>`);
        }
    }
}

fs.writeFileSync('main.js', lines.join('\n'));
console.log('Final fix applied');
