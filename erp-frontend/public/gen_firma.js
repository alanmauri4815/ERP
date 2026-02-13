const fs = require('fs');
const img = fs.readFileSync('C:/Users/javii/Downloads/Firma Ross SF.png');
const b64 = 'data:image/png;base64,' + img.toString('base64');
const js = 'window.FIRMA_ROSS_B64 = "' + b64 + '";';
fs.writeFileSync('C:/Users/javii/Downloads/ERP Universal/erp-frontend/firma_ross.js', js);
console.log('OK - File size:', js.length);
console.log('Starts:', js.substring(0, 70));
console.log('Ends:', js.substring(js.length - 30));
