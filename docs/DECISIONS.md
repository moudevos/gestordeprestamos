# Decisiones Técnicas

1. Se usa un monorepo con `apps/web` y `apps/worker`, más un paquete compartido `packages/shared`.
2. El frontend usa React + Vite + TypeScript con `react-router-dom`, `@tanstack/react-query` y Supabase Auth.
3. La UI sigue un estilo neutro con un único color acento configurable por CSS variable.
4. La lógica crítica de saldos, mora, pagos y refinanciación vive en funciones SQL RPC dentro de Supabase.
5. El worker usa Fastify por simplicidad operativa en Render y ejecuta jobs vía endpoint protegido por `JOB_TOKEN`.
6. Se prioriza un MVP funcional y consistente sobre complejidad visual; la app incluye tablas, formularios y flujos principales listos para extender.
7. La política por defecto se guarda como registro `loan_policies` con `scope = 'organization_default'`; los overrides se guardan con `scope = 'loan_override'`.
8. La mora se persiste en `loan_balances` y además se registra un snapshot por ejecución en `loan_overdue_snapshots`.

