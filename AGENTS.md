# Hotel · Administración

Leé README.md y ALCANCE.md antes de cambiar el proyecto.

- Esta copia se entrega para desarrollo local en VS Code con Codex y Git propio. No publiques ni conectes datos online sin instrucción del usuario.
- Conservá npm y package-lock.json. No hace falta pnpm.
- La copia no está vinculada al Site original. No repongas ni adivines project_id.
- Interfaz React/TypeScript en app/page.tsx; estilos en app/globals.css; API en app/api/hotel/route.ts.
- Base SQLite mediante D1/Miniflare. Esquema en db/schema.ts; migraciones en drizzle/.
- Dinero en centavos enteros. Saldos derivados de movimientos, sin campos de saldo editable.
- Las reservas ocupan noches [llegada, salida). Conservá la unicidad habitación + fecha.
- Conservá batches transaccionales, trazabilidad, protección de stock negativo y sobrecobros/sobrepagos.
- No sustituyas persistencia por localStorage ni edites migraciones ya aplicadas.
- No subas .wrangler, .env, .dev.vars, respaldos ni datos reales a Git.
- Verificá con npm run check y npm run build. Aplicá migraciones locales con npm run db:local.
- Para cambios financieros, verificá circuitos de cargos, cobros, pagos y saldos.
- Es un prototipo: no afirmes que tiene roles, facturación o contabilidad completos.
