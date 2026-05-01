const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// 1. Define window.loadProductionQuotationData
const loadQuoteFunc = `
    window.loadProductionQuotationData = async function(quoteId) {
      if (!quoteId) return;
      try {
        const quote = await apiFetch(\`/quotations/\${quoteId}\`);
        if (quote && quote.items) {
          const rows = document.querySelectorAll('#production-items-body .item-row');
          // Reset all rows
          rows.forEach(r => {
            r.querySelector('.prod-item-code').value = '';
            r.querySelector('.prod-item-qty').value = '0';
            r.querySelector('.prod-item-mp').value = '0';
            r.querySelector('.prod-item-mo').value = '0';
          });

          // En PULL, filtramos solo los productos a fabricar (no MP ni MO suelta)
          const itemsToProduce = quote.items.filter(it => 
            it.item_type === 'venta' || 
            it.item_type === 'producto' || 
            (it.type !== 'MP' && it.type !== 'MO' && it.item_type !== 'material' && it.item_type !== 'labor')
          );

          itemsToProduce.forEach((item, idx) => {
            if (rows[idx]) {
              const codeInput = rows[idx].querySelector('.prod-item-code');
              const qtyInput = rows[idx].querySelector('.prod-item-qty');
              const mpInput = rows[idx].querySelector('.prod-item-mp');
              const moInput = rows[idx].querySelector('.prod-item-mo');

              codeInput.value = item.item_code || item.description || '';
              qtyInput.value = item.quantity || 1;
              
              const masterProd = state.products.find(p => p.code === (item.item_code || item.description));
              const unit_cost = item.unit_cost || item.cost_unit || masterProd?.cost_unit || 0;
              const labor_cost = item.labor_cost || item.mo_cost || masterProd?.labor_cost || 0;

              mpInput.value = Math.round(unit_cost);
              moInput.value = Math.round(labor_cost);
            }
          });

          // Sumar toda la mano de obra suelta de la cotización
          const extraLabor = quote.items
            .filter(it => {
              const type = (it.item_type || '').toLowerCase();
              const type2 = (it.type || '').toLowerCase();
              const desc = (it.description || '').toLowerCase();
              return type.includes('labor') || type.includes('mo') || type2.includes('mo') || 
                     desc.includes('confección') || desc.includes('confeccion') || desc.includes('mano de obra');
            })
            .reduce((sum, it) => sum + (parseFloat(it.total_cost) || (parseFloat(it.unit_cost) * parseFloat(it.quantity)) || 0), 0);
          
          const laborInput = document.getElementById('prod-labor-cost');
          if (laborInput && (parseFloat(laborInput.value) === 0 || document.getElementById('prod-edit-mode').value === 'false')) {
            laborInput.value = Math.round(extraLabor);
            document.getElementById('mo-details-group').style.display = (extraLabor > 0 ? 'block' : 'none');
          }

          window.currentProductionItems = quote.items;
          window.updateProductionDatalist(quote); 
          window.updateProdRecipeView();
          window.updateProdTotals();
        }
      } catch (e) {
        console.error('Error loading quotation data:', e);
      }
    };
`;

// Insert the function before toggleProdCategory
content = content.replace(/window\.toggleProdCategory =/, loadQuoteFunc + '\n    window.toggleProdCategory =');

// 2. Update toggleProdCategory to use the new function
content = content.replace(
    /quoteSelect\.onchange = async \(\) => \{[\s\S]+?window\.updateProdRecipeView\(\);\s+\};/,
    `quoteSelect.onchange = () => window.loadProductionQuotationData(quoteSelect.value);`
);

// Call it when switching to PULL if a quote is already selected
content = content.replace(
    /projectGroup\.style\.background = 'rgba\(234, 179, 8, 0\.05\)';/,
    `projectGroup.style.background = 'rgba(234, 179, 8, 0.05)';
          if (quoteSelect.value) window.loadProductionQuotationData(quoteSelect.value);`
);

fs.writeFileSync('main.js', content);
console.log('Production MO loading logic modularized and fixed');
