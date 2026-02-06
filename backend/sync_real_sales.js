require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const dataStr = `
25-001	13/sept/25	01	11			TO-06	Toalla 160x80 Fu	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			S
25-001	13/sept/25	02	12			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-001	13/sept/25	03	13			TU-01	Turbante Ca	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 3316 	 2284 			S
25-001	13/sept/25	04	14			TU-01	Turbante Ca	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 3316 	 2284 			S
25-002	14/sept/25	01	21			TU-04	Turbante Li	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			S
25-002	14/sept/25	02	22			TU-02	Turbante Fu	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			S
25-002	14/sept/25	03	23			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-003	24/sept/25	01	31			TO-12	Toalla 160x110 Li	1		 13200 		 13200 	 E 	 0 	 440 	 12760 	 6161 	 7039 			S
25-004	29/sept/25	01	41			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-004	29/sept/25	02	42			TO-06	Toalla 160x80 Fu	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			S
25-004	29/sept/25	03	43			Go-01	Gorra Natacion Lycra	1		 5300 		 5300 	 M 	 846 	 177 	 4277 	 0 	 5300 			S
25-004	29/sept/25	04	44			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-004	29/sept/25	05	45			TU-03	Turbante Vp	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-005	1/oct/25	01	51			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			S
25-005	1/oct/25	02	52			TU-04	Turbante Li	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-005	1/oct/25	03	53			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-006	2/oct/25	01	61			TO-10	Toalla 40x40 Na	1		 4500 		 4500 	 E 	 0 	 150 	 4350 	 1466 	 3034 			S
25-006	2/oct/25	02	62			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			S
25-007	3/oct/25	01	71			TU-01	Turbante Ca	2		 5600 		 11200 	 M 	 1788 	 373 	 9039 	 6632 	 4568 			S
25-007	3/oct/25	02	72			TO-03	Toalla 160x80 Am	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			S
25-007	3/oct/25	03	73			TU-03	Turbante Vp	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-008	4/oct/25	01	81			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-009	18/oct/25	01	91			TU-02	Turbante Fu	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			S
25-009	18/oct/25	02	92			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			S
25-010	19/oct/25	01	101			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			S
25-010	19/oct/25	02	102			TU-04	Turbante Li	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-010	19/oct/25	03	103			TU-03	Turbante Vp	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-011	8/nov/25	01	111			TO-09	Toalla 80x40 Na	1		 9500 		 9301 	 M 	 1485 	 310 	 7506 	 2227 	 7273 			S
25-011	8/nov/25	02	112			TO-04	Toalla 160x80 Vp	1		 10700 		 10700 	 E 	 0 	 357 	 10343 	 5928 	 4772 			S
25-012	9/nov/25	01	121			TU-05	Turbante Ne	2		 5600 		 11200 	 M 	 1788 	 373 	 9039 	 2996 	 8203 			S
25-012	9/nov/25	02	122			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-012	9/nov/25	03	123			TU-04	Turbante Li	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-013	1/dic/25	01	131			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-013	1/dic/25	02	132			TU-04	Turbante Li	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-014	2/dic/25	01	141			TO-07	Toalla 160x80 Na	1		 10700 		 10000 	 E 	 0 	 333 	 9667 	 5928 	 4772 			S
25-014	2/dic/25	02	142			TU-04	Turbante Li	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			S
25-015	4/dic/25	01	151			TU-08	Turbante Ro	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			S
25-015	4/dic/25	02	152			TO-01	Toalla 160x80 Az	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 6007 	 4693 			S
25-015	4/dic/25	03	153			TO-08	Toalla 160x80 Ne	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			S
25-015	4/dic/25	04	154			TO-11	Toalla 160x110 Na	1		 13200 		 13200 	 M 	 2108 	 440 	 10652 	 8696 	 4504 			S
25-015	4/dic/25	05	155			TO-10	Toalla 40x40 Na	1		 4500 		 4500 	 E 	 0 	 150 	 4350 	 1466 	 3034 			S
25-016	13/dic/25	01	161			TU-06	Turbante Na	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-016	13/dic/25	02	162			TU-01	Turbante Ca	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 3316 	 2284 			
25-016	13/dic/25	03	163			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			
25-016	13/dic/25	04	164			TU-03	Turbante Vp	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-016	13/dic/25	05	165			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-017	14/dic/25	01	171			TU-05	Turbante Ne	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-017	14/dic/25	02	172			TU-07	Turbante Am	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-017	14/dic/25	03	173			TO-04	Toalla 160x80 Vp	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			
25-017	14/dic/25	04	174			TU-03	Turbante Vp	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-017	14/dic/25	05	175			Go-01	Gorra Natacion Lycra	1		 5300 		 5300 	 M 	 846 	 177 	 4277 	 0 	 5300 			
25-017	14/dic/25	06	176			Go-01	Gorra Natacion Lycra	1		 5300 		 5300 	 M 	 846 	 177 	 4277 	 0 	 5300 			
25-017	14/dic/25	07	177			TO-02	Toalla 160x80 Ro	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			
25-018	15/dic/25	01	181			TU-05	Turbante Ne	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-019	17/dic/25	01	191			TU-08	Turbante Ro	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-020	19/dic/25	01	201			TO-01	Toalla 160x80 Az	1		 10700 		 10700 	 T 	 1708 	 357 	 8635 	 6007 	 4693 			
25-020	19/dic/25	02	202			TO-05	Toalla 160x80 Ca	1		 10700 		 10700 	 M 	 1708 	 357 	 8635 	 5928 	 4772 			
25-020	19/dic/25	03	203			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-020	19/dic/25	04	204			TU-05	Turbante Ne	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-020	19/dic/25	05	205			TU-06	Turbante Na	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-020	19/dic/25	06	206			TO-01	Toalla 160x80 Az	1		 10700 		 10700 	 E 	 0 	 357 	 10343 	 6007 	 4693 			
25-021	20/dic/25	01	211			TU-01	Turbante Ca	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 3316 	 2284 			
25-021	20/dic/25	02	212			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-021	20/dic/25	03	213			TU-01	Turbante Ca	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 3316 	 2284 			
25-021	20/dic/25	04	214			TU-02	Turbante Fu	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-021	20/dic/25	05	215			TU-06	Turbante Na	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-021	20/dic/25	06	216			TU-05	Turbante Ne	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-021	20/dic/25	07	217			TU-02	Turbante Fu	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-021	20/dic/25	08	218			TO-07	Toalla 160x80 Na	1		 10700 		 10700 	 E 	 0 	 357 	 10343 	 5928 	 4772 			
25-022	21/dic/25	01	221			TU-03	Turbante Vp	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 1498 	 4102 			
25-022	21/dic/25	02	222			Go-01	Gorra Natacion Lycra	1		 5300 		 5300 	 M 	 846 	 177 	 4277 	 0 	 5300 			
25-023	22/dic/25	01	231			TU-08	Turbante Ro	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-024	23/dic/25	01	241			TU-01	Turbante Ca	1		 5600 		 5600 	 E 	 0 	 187 	 5413 	 3316 	 2284 			
25-024	23/dic/25	02	242			TU-05	Turbante Ne	1		 5600 		 5600 	 M 	 894 	 187 	 4519 	 1498 	 4102 			
25-024	23/dic/25	03	243			TO-02	Toalla 160x80 Ro	1		 10700 		 10700 	 T 	 1708 	 357 	 8635 	 5928 	 4772 			
25-024	23/dic/25	04	244			TO-05	Toalla 160x80 Ca	1		 10700 		 10700 	 T 	 1708 	 357 	 8635 	 5928 	 4772 			
25-024	23/dic/25	05	245			TO-03	Toalla 160x80 Am	1		 10700 		 10700 	 T 	 1708 	 357 	 8635 	 5928 	 4772 			
25-024	23/dic/25	06	246			TU-08	Turbante Ro	1		 5600 		 5600 	 T 	 894 	 187 	 4519 	 1498 	 4102 			
`;

const monthMap = { 'sept': '09', 'oct': '10', 'nov': '11', 'dic': '12' };

async function syncRealSales() {
    console.log('--- Limpiando Asientos Previos ---');
    await supabase.from('asientos_contables').delete().neq('id', 0);
    console.log('--- Iniciando Sincronización Real ---');

    const accounts = await supabase.from('accounting_accounts').select('id, code');
    const codeMap = {};
    accounts.data.forEach(a => codeMap[a.code] = a.id);

    const lines = dataStr.trim().split('\n');
    const groups = {};

    lines.forEach(line => {
        const cols = line.split('\t').map(c => c.trim().replace('$', '').replace(/\./g, '').trim());
        const id = cols[0];
        if (!groups[id]) groups[id] = [];
        groups[id].push(cols);
    });

    for (const id in groups) {
        const items = groups[id];
        const rawDate = items[0][1]; // dd/month/yy
        const [d, m, y] = rawDate.split('/');
        const isoDate = `20${y}-${monthMap[m] || '01'}-${d.padStart(2, '0')}`;

        // Create Header
        const { data: header, error: hError } = await supabase
            .from('asientos_contables')
            .insert({
                date: isoDate,
                description: `Venta Real #${id}`,
                entry_type: 'venta',
                document_number: id
            })
            .select()
            .single();

        if (hError) {
            console.error(`Error header ${id}:`, hError);
            continue;
        }

        const journalLines = [];
        let totalRev = 0;
        let totalIva = 0;
        let totalComm = 0;

        // Sumamos por tipo de pago dentro del mismo asiento
        const payments = {}; // { account_id: amount }

        items.forEach(it => {
            // Buscamos los índices correctos ignorando celdas vacías o ajustando al formato
            // 11: Total, 12: Tipo Pago, 13: Comisión, 14: IVA, 15: Neto
            const total = parseInt(it[11]) || 0;
            const type = it[12] ? it[12].trim().toUpperCase() : 'E';
            const comm = parseInt(it[13]) || 0;
            const iva = parseInt(it[14]) || 0;

            totalRev += (total - iva);
            totalIva += iva;

            let accCode = '1.1.01.01'; // Default Caja
            if (type === 'M') accCode = '1.1.01.03'; // Máquina
            if (type === 'T') accCode = '1.1.01.02'; // Banco

            const accId = codeMap[accCode];
            payments[accId] = (payments[accId] || 0) + (total - comm);
            if (comm > 0) totalComm += comm;
        });

        // 1. Debits (IngresosNetos por cuenta)
        for (const accId in payments) {
            journalLines.push({
                asiento_id: header.id,
                account_id: accId,
                debit: payments[accId],
                credit: 0,
                glosa: `Ingreso Venta #${id}`
            });
        }

        // 2. Debit (Comisión)
        if (totalComm > 0) {
            journalLines.push({
                asiento_id: header.id,
                account_id: codeMap['5.1.02.02'],
                debit: totalComm,
                credit: 0,
                glosa: `Suma Comisiones Venta #${id}`
            });
        }

        // 3. Credits (Ventas e IVA)
        journalLines.push({
            asiento_id: header.id,
            account_id: codeMap['4.1.01.01'],
            debit: 0,
            credit: totalRev - totalComm, // El neto real de ingreso
            glosa: `Venta #${id} (Neto)`
        });

        if (totalIva > 0) {
            journalLines.push({
                asiento_id: header.id,
                account_id: codeMap['2.1.02.01'],
                debit: 0,
                credit: totalIva,
                glosa: `IVA Débito Venta #${id}`
            });
        }

        const { error: lError } = await supabase.from('accounting_lines').insert(journalLines);
        if (lError) console.error(`Error lines ${id}:`, lError);
        else console.log(`✅ Sincronizado Asiento #${id} (${isoDate})`);
    }

    console.log('--- Sincronización Finalizada ---');
}

syncRealSales();
