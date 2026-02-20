# ERP Universal – Backend

API REST para el sistema ERP Universal. Usa Express + Supabase.

## Setup

```bash
cd backend
npm install
cp .env.example .env  # configurar SUPABASE_URL, SUPABASE_KEY, JWT_SECRET
npm start
```

## Variables de Entorno (.env)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `SUPABASE_KEY` | ✅ | Clave anon/service de Supabase |
| `JWT_SECRET` | ✅ | Secreto para firmar tokens JWT (el servidor **no arranca** sin esta variable) |
| `PORT` | ❌ | Puerto del servidor (default: 3001) |
| `FRONTEND_URL` | ❌ | URL del frontend para CORS (default: `http://localhost:5173`) |

## Endpoints Principales

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/health` | ❌ | Health check |
| `POST` | `/api/auth/login` | ❌ | Login (rate limited: 10/15min) |
| `POST` | `/api/auth/register` | Admin | Crear usuario |
| `GET` | `/api/products` | ✅ | Listar productos |
| `GET` | `/api/raw-materials` | ✅ | Listar materias primas |
| `GET/POST` | `/api/sales` | ✅ | Ventas |
| `GET/POST` | `/api/purchases` | ✅ | Compras |
| `GET/POST` | `/api/production` | ✅ | Producción |
| `GET` | `/api/accounting/ledger` | ✅ | Libro diario |
| `GET` | `/api/quotations` | ✅ | Cotizaciones |
| `GET` | `/api/reports/monthly` | ✅ | Reporte mensual |

## Seguridad

- **JWT**: Tokens con expiración de 24h
- **CORS**: Restringido a dominios autorizados
- **Rate Limit**: Login limitado a 10 intentos por IP cada 15 min
- **Registro**: Requiere autenticación de admin
