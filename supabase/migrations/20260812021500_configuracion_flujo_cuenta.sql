-- Cuántos papeles se imprimen por mesa, y cuándo.
--
-- ── EL FLUJO REAL (AZUL, descrito por Chris el 11-ago) ──────────────────────
-- El mesero pide la cuenta → sale EL TICKET FINAL, con folio → se lleva a la
-- mesa → el cliente paga → se registra la venta con la propina. **Un solo
-- papel.** El método de pago es opcional y por eso el ticket no lo necesita.
--
-- Hasta hoy se imprimían dos: la pre-cuenta al pedir y el ticket al cobrar.
--
-- ── POR QUÉ ES CONFIGURABLE Y NO UNA REGLA FIJA ────────────────────────────
-- Los dos flujos existen en restaurantes reales. Hay locales que entregan una
-- pre-cuenta para que el cliente revise y luego un ticket de pago; AZUL entrega
-- uno solo. Imponer cualquiera de los dos obligaría a la mitad a trabajar como
-- no trabaja.
--
-- ── POR QUÉ EL DEFECTO ES 'precuenta_y_ticket' ─────────────────────────────
-- Porque es lo que hace hoy. Cambiar el defecto convertiría una actualización
-- en un cambio de conducta silencioso para quien ya estuviera usándolo — la
-- misma razón por la que `imprimir_comandas` salió con 'siempre'.
--
-- AZUL lo pondrá en 'ticket_final'.
ALTER TABLE public.configuracion
  ADD COLUMN IF NOT EXISTS flujo_cuenta text NOT NULL DEFAULT 'precuenta_y_ticket';

ALTER TABLE public.configuracion
  DROP CONSTRAINT IF EXISTS configuracion_flujo_cuenta_valido;

ALTER TABLE public.configuracion
  ADD CONSTRAINT configuracion_flujo_cuenta_valido
  CHECK (flujo_cuenta IN ('precuenta_y_ticket', 'ticket_final'));

COMMENT ON COLUMN public.configuracion.flujo_cuenta IS
  'ticket_final = un solo papel: al pedir la cuenta sale el ticket con folio, y al cobrar no se imprime nada. precuenta_y_ticket = dos papeles, el histórico.';
