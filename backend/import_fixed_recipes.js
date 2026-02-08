require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const data = `
TO-07	Toalla 160x80 Na	1	1	TE-01	MP	Microfibra Dep 160 Na	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-07	Toalla 160x80 Na	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-07	Toalla 160x80 Na	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-07	Toalla 160x80 Na	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-06	Toalla 160x80 Fu	1	1	TE-03	MP	Microfibra Dep 160 Fu	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-06	Toalla 160x80 Fu	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-06	Toalla 160x80 Fu	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-06	Toalla 160x80 Fu	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-01	Toalla 160x80 Az	1	1	TE-09	MP	Microfibra Dep 160 Az	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-01	Toalla 160x80 Az	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-01	Toalla 160x80 Az	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-01	Toalla 160x80 Az	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-02	Toalla 160x80 Ro	1	1	TE-07	MP	Microfibra Dep 160 Ro	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-02	Toalla 160x80 Ro	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-02	Toalla 160x80 Ro	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-02	Toalla 160x80 Ro	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-04	Toalla 160x80 Vp	1	1	TE-08	MP	Microfibra Dep 160 Vp	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-04	Toalla 160x80 Vp	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-04	Toalla 160x80 Vp	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-04	Toalla 160x80 Vp	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-05	Toalla 160x80 Ca	1	1	TE-04	MP	Microfibra Dep 160 Ca	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-05	Toalla 160x80 Ca	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-05	Toalla 160x80 Ca	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-05	Toalla 160x80 Ca	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-08	Toalla 160x80 Ne	1	1	TE-05	MP	Microfibra Dep 160 Ne	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-08	Toalla 160x80 Ne	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-08	Toalla 160x80 Ne	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-08	Toalla 160x80 Ne	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TO-09	Toalla 80x40 Na	1	1	TE-01	MP	Microfibra Dep 160 Na	0,2	1	 $ 980 	 $ 980 	Toalla
TO-09	Toalla 80x40 Na	1	2	HI-01	IN	Hilo Overlock Verde	0,01	1	 $ 13 	 $ 13 	Toalla
TO-09	Toalla 80x40 Na	1	3	HI-02	IN	Hilo Recta Verde	0,01	1	 $ 9 	 $ 9 	Toalla
TO-09	Toalla 80x40 Na	1	4	GA-01		Locomoción	0,25	1	 $ 250 	 $ 250 	Toalla
TO-10	Toalla 40x40 Na	1	1	TE-01	MP	Microfibra Dep 160 Na	0,1	1	 $ 490 	 $ 490 	Toalla
TO-10	Toalla 40x40 Na	1	2	HI-01	IN	Hilo Overlock Verde	0,005	1	 $ 7 	 $ 7 	Toalla
TO-10	Toalla 40x40 Na	1	3	HI-02	IN	Hilo Recta Verde	0,005	1	 $ 4 	 $ 4 	Toalla
TO-10	Toalla 40x40 Na	1	4	GA-01		Locomoción	0,12	1	 $ 120 	 $ 120 	Toalla
TO-11	Toalla 160x110 Na	1	1	TE-01	MP	Microfibra Dep 160 Na	1,2	1	 $ 5.880 	 $ 5.880 	Toalla
TO-11	Toalla 160x110 Na	1	2	HI-01	IN	Hilo Overlock Verde	0,06	1	 $ 78 	 $ 78 	Toalla
TO-11	Toalla 160x110 Na	1	3	HI-02	IN	Hilo Recta Verde	0,06	1	 $ 53 	 $ 53 	Toalla
TO-11	Toalla 160x110 Na	1	4	GA-01		Locomoción	0,15	1	 $ 150 	 $ 150 	Toalla
TO-12	Toalla 160x110 Li	1	1	TE-02	MP	Microfibra Dep 160 Li	1,2	1	 $ 5.880 	 $ 5.880 	Toalla
TO-12	Toalla 160x110 Li	1	2	HI-01	IN	Hilo Overlock Verde	0,06	1	 $ 78 	 $ 78 	Toalla
TO-12	Toalla 160x110 Li	1	3	HI-02	IN	Hilo Recta Verde	0,06	1	 $ 53 	 $ 53 	Toalla
TO-12	Toalla 160x110 Li	1	4	GA-01		Locomoción	0,15	1	 $ 150 	 $ 150 	Toalla
TU-01	Turbante Ca	8	1	TE-04	MP	Microfibra Dep 160 Ca	0,13	1	 $ 637 	 $ 80 	Turbante
TU-01	Turbante Ca	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-01	Turbante Ca	100	3	HI-03	MP	Hilo Poliester	3	1	 $ 2.670 	 $ 27 	Turbante
TU-01	Turbante Ca	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-01	Turbante Ca	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-01	Turbante Ca	1	6	MO-02	MO	Confección	8	100	 $ 520 	 $ 520 	Turbante
TU-01	Turbante Ca	1	7	MO-03	MO	Botones	3	20	 $ 33 	 $ 33 	Turbante
TU-01	Turbante Ca	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-03	Turbante Vp	8	1	TE-08	MP	Microfibra Dep 160 Vp	0,13	1	 $ 637 	 $ 80 	Turbante
TU-03	Turbante Vp	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-03	Turbante Vp	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-03	Turbante Vp	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-04	Turbante Li	8	1	TE-02	MP	Microfibra Dep 160 Li	0,13	1	 $ 637 	 $ 80 	Turbante
TU-04	Turbante Li	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-04	Turbante Li	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-04	Turbante Li	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TO-03	Toalla 160x80 Am	1	1	TE-06	MP	Microfibra Dep 160 Am	0,8	1	 $ 3.920 	 $ 3.920 	Toalla
TO-03	Toalla 160x80 Am	1	2	HI-01	IN	Hilo Overlock Verde	0,04	1	 $ 52 	 $ 52 	Toalla
TO-03	Toalla 160x80 Am	1	3	HI-02	IN	Hilo Recta Verde	0,04	1	 $ 36 	 $ 36 	Toalla
TO-03	Toalla 160x80 Am	1	4	GA-01		Locomoción	0,1	1	 $ 100 	 $ 100 	Toalla
TU-05	Turbante Ne	8	1	TE-05	MP	Microfibra Dep 160 Ne	0,13	1	 $ 637 	 $ 80 	Turbante
TU-05	Turbante Ne	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-05	Turbante Ne	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-05	Turbante Ne	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-06	Turbante Na	8	1	TE-01	MP	Microfibra Dep 160 Na	0,13	1	 $ 637 	 $ 80 	Turbante
TU-06	Turbante Na	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-06	Turbante Na	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-06	Turbante Na	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-07	Turbante Am	8	1	TE-06	MP	Microfibra Dep 160 Am	0,13	1	 $ 637 	 $ 80 	Turbante
TU-07	Turbante Am	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-07	Turbante Am	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-07	Turbante Am	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-08	Turbante Ro	8	1	TE-07	MP	Microfibra Dep 160 Ro	0,13	1	 $ 637 	 $ 80 	Turbante
TU-08	Turbante Ro	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-08	Turbante Ro	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1	 $ 7 	 $ 7 	Turbante
TU-08	Turbante Ro	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-08	Turbante Ro	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-08	Turbante Ro	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-08	Turbante Ro	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-08	Turbante Ro	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-01	Turbante Ca	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-01	Turbante Ca	8	10	IN-02	IN	Cordón Eládtico	60	1	 $ 8.100 	 $ 1.013 	Turbante
TU-01	Turbante Ca	1	11	IN-03	IN	Sesgo	0,13	1000	 $ 12 	 $ 12 	Turbante
TU-01	Turbante Ca	1	12	IN-04	IN	Logo Estampado	1	1	 $ 774 	 $ 774 	Turbante
TU-02	Turbante Fu	8	1	TE-03	MP	Microfibra Dep 160 Fu	0,13	1	 $ 637 	 $ 80 	Turbante
TO-01	Toalla 160x80 Az	8	1	TE-03	MP	Microfibra Dep 160 Fu	0,13	1	 $ 637 	 $ 80 	Turbante
TU-02	Turbante Fu	100	2	HI-01	IN	Hilo Overlock Verde	2	1	 $ 2.600 	 $ 26 	Turbante
TU-02	Turbante Fu	1	3	HI-02	IN	Hilo Recta Verde	0,008125	1000	 $ 7 	 $ 7 	Turbante
TU-03	Turbante Vp	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-03	Turbante Vp	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-03	Turbante Vp	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-03	Turbante Vp	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-04	Turbante Li	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-04	Turbante Li	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-04	Turbante Li	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-04	Turbante Li	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-05	Turbante Ne	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-05	Turbante Ne	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-05	Turbante Ne	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-05	Turbante Ne	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-06	Turbante Na	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-06	Turbante Na	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-06	Turbante Na	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-06	Turbante Na	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-07	Turbante Am	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-07	Turbante Am	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Turbante
TU-07	Turbante Am	1	7	MO-03	MO	Botones	3	1000	 $ 33 	 $ 33 	Turbante
TU-07	Turbante Am	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-02	Turbante Fu	1	4	GA-01		Locomoción	0,02	1	 $ 20 	 $ 20 	Turbante
TU-02	Turbante Fu	1	5	MO-01	MO	Corte	2	1	 $ 130 	 $ 130 	Turbante
TU-03	Turbante Vp	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-04	Turbante Li	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-05	Turbante Ne	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-06	Turbante Na	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-07	Turbante Am	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TU-08	Turbante Ro	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
TO-07	Toalla 160x80 Na	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-07	Toalla 160x80 Na	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-07	Toalla 160x80 Na	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-08	Toalla 160x80 Ne	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-08	Toalla 160x80 Ne	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-08	Toalla 160x80 Ne	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-01	Toalla 160x80 Az	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-01	Toalla 160x80 Az	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-01	Toalla 160x80 Az	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-02	Toalla 160x80 Ro	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-02	Toalla 160x80 Ro	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-02	Toalla 160x80 Ro	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-03	Toalla 160x80 Am	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-03	Toalla 160x80 Am	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-03	Toalla 160x80 Am	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-04	Toalla 160x80 Vp	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-04	Toalla 160x80 Vp	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-04	Toalla 160x80 Vp	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-05	Toalla 160x80 Ca	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-05	Toalla 160x80 Ca	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-05	Toalla 160x80 Ca	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-06	Toalla 160x80 Fu	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-06	Toalla 160x80 Fu	1	6	MO-02	MO	Confección	20	1	 $ 1.300 	 $ 1.300 	Toalla
TO-06	Toalla 160x80 Fu	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-11	Toalla 160x110 Na	1	5	MO-01	MO	Corte	8	1	 $ 520 	 $ 520 	Toalla
TO-11	Toalla 160x110 Na	1	6	MO-02	MO	Confección	28	1	 $ 1.820 	 $ 1.820 	Toalla
TO-11	Toalla 160x110 Na	1	7	MO-04	MO	Preparación	3	1	 $ 195 	 $ 195 	Toalla
TO-10	Toalla 40x40 Na	1	5	MO-01	MO	Corte	8	1	 $ 520 	 $ 520 	Toalla
TO-10	Toalla 40x40 Na	1	6	MO-02	MO	Confección	3	1	 $ 195 	 $ 195 	Toalla
TO-10	Toalla 40x40 Na	1	7	MO-04	MO	Preparación	2	1	 $ 130 	 $ 130 	Toalla
TO-09	Toalla 80x40 Na	1	5	MO-01	MO	Corte	6	1	 $ 390 	 $ 390 	Toalla
TO-09	Toalla 80x40 Na	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Toalla
TO-09	Toalla 80x40 Na	1	7	MO-04	MO	Preparación	1	1	 $ 65 	 $ 65 	Toalla
TU-02	Turbante Fu	1	6	MO-02	MO	Confección	8	1	 $ 520 	 $ 520 	Toalla
TU-02	Turbante Fu	1	7	MO-03	MO	Botones	3	1	 $ 33 	 $ 33 	Turbante
TU-02	Turbante Fu	1	8	MO-04	MO	Preparación	0,5	1	 $ 33 	 $ 33 	Turbante
TU-02	Turbante Fu	1	9	SE-01	SE	Estampado Logo Turb.	1	1	 $ 650 	 $ 650 	Turbante
`;

async function importRecipes() {
    console.log('--- Iniciando Re-importación de Recetas ---');

    const rows = data.trim().split('\n');
    const recipesToInsert = [];

    rows.forEach((line, index) => {
        const cols = line.split('\t').map(c => c.trim().replace('$', '').replace(/\./g, '').replace(',', '.').trim());

        if (cols.length < 9) return;

        const productCode = cols[0];
        const mpCode = cols[4];
        const batchSize = parseFloat(cols[2]) || 1;
        const mpQty = parseFloat(cols[7]) || 0;

        // Si Cant PR (cols[2]) es mayor a 1, la cantidad real por unidad es mpQty / batchSize
        // Si Cant PR es 1, la cantidad es directa
        const unitQuantity = mpQty / batchSize;

        recipesToInsert.push({
            product_code: productCode,
            mp_code: mpCode,
            quantity: unitQuantity,
            batch_size: 1 // Guardamos todo normalizado a 1 unidad para facilitar cálculos
        });
    });

    console.log(`Procesando ${recipesToInsert.length} líneas...`);

    // Insertar en bloques de 100 para evitar errores de timeout
    for (let i = 0; i < recipesToInsert.length; i += 100) {
        const chunk = recipesToInsert.slice(i, i + 100);
        const { error } = await supabase.from('recetas').insert(chunk);
        if (error) {
            console.error(`Error insertando bloque ${i}:`, error);
        } else {
            console.log(`✅ Bloque ${i} insertado.`);
        }
    }

    console.log('--- Re-importación Finalizada ---');
}

importRecipes();
