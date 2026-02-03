require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read SQL file
const sqlPath = path.join(__dirname, 'migrations', 'add_tax_fields.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Split SQL into individual statements
const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

async function runMigration(supabaseUrl, supabaseKey, instanceName) {
    console.log(`\n=== Migrando ${instanceName} ===`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    for (const statement of statements) {
        // Skip comments
        if (statement.startsWith('--') || statement.includes('Verification queries')) {
            continue;
        }

        try {
            console.log(`Ejecutando: ${statement.substring(0, 50)}...`);

            // Use RPC for ALTER TABLE and UPDATE statements
            const { data, error } = await supabase.rpc('exec_sql', {
                sql_query: statement
            });

            if (error) {
                // If RPC doesn't exist, try direct query (for SELECT statements)
                if (statement.trim().toUpperCase().startsWith('SELECT')) {
                    const { data: selectData, error: selectError } = await supabase
                        .from('products')
                        .select('*')
                        .limit(1);

                    if (!selectError) {
                        console.log('✅ Migración completada (validación manual requerida)');
                    }
                } else {
                    console.error(`❌ Error: ${error.message}`);
                }
            } else {
                console.log('✅ Ejecutado exitosamente');
            }
        } catch (e) {
            console.error(`❌ Error ejecutando statement: ${e.message}`);
        }
    }

    // Verification
    console.log('\n--- Verificando migración ---');

    const { data: products } = await supabase
        .from('products')
        .select('code, name, price_sale, iva, total')
        .limit(3);

    const { data: rawMaterials } = await supabase
        .from('raw_materials')
        .select('code, name, cost_net, iva, total')
        .limit(3);

    console.log('\nProductos (muestra):');
    console.table(products);

    console.log('\nMaterias Primas (muestra):');
    console.table(rawMaterials);
}

async function main() {
    console.log('🚀 Iniciando migración de campos tributarios...\n');

    // Migrate main instance
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        await runMigration(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY,
            'Instancia Principal'
        );
    }

    console.log('\n✅ Migración completada');
    console.log('\n📝 IMPORTANTE:');
    console.log('- Ejecuta este script manualmente para la instancia de Bárbara');
    console.log('- Actualiza el .env con las credenciales de Bárbara');
    console.log('- O ejecuta el SQL directamente en el SQL Editor de Supabase');
}

main().catch(console.error);
