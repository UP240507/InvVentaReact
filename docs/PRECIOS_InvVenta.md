# InvVenta — Lista de Precios

> **Vigente a partir de:** Fase 1 (post-Fase 0)  
> **Última actualización:** julio 2026  
> **Modelo:** Software instalable (Tauri) + sincronización cloud  
> **Dispositivos:** Ilimitados en todos los planes

---

## 📦 Planes Anuales

| Plan | Precio/año | Dispositivos | Empleados | Módulos premium | Setup | Para quién |
|------|-----------|-------------|-----------|----------------|-------|-----------|
| **Fundador** | **$3,990 MXN** | ∞ | 10 | — | ✅ Incluido | Primeros 10 restaurantes |
| **Básico** | **$4,990 MXN** | ∞ | 10 | — | $1,500 aparte | Restaurantes pequeños |
| **Pro** | **$7,990 MXN** | ∞ | 25 | Lealtad | $1,500 aparte | Restaurantes en crecimiento |
| **Empresarial** | **$11,990 MXN** | ∞ | 60 | Lealtad + Multi-sucursal | Cotizado | Cadenas y grupos |

> Los precios no incluyen IVA. El IVA se suma al momento del pago.

---

## 🎁 Add-ons (cotizar por separado)

| Add-on | Precio/año | Descripción |
|--------|-----------|-------------|
| **Sistema de Lealtad** | $990 MXN | Puntos, recompensas y canje para clientes frecuentes |
| **Facturación CFDI** | $1,990 MXN | Integración con PAC para emisión de facturas electrónicas *(cuando esté disponible)* |

---

## 📋 Qué incluye cada plan

### Todos los planes incluyen:
- ✅ Software instalable en Windows 10/11
- ✅ Dispositivos ilimitados (PC, tablet, teléfono)
- ✅ Modo offline-first (funciona sin internet)
- ✅ Sincronización en la nube (backup automático)
- ✅ Soporte por WhatsApp (L–V, 9:00–18:00, respuesta en 24h)
- ✅ Actualizaciones de mantenimiento
- ✅ Capacitación inicial remota (60 min)

### Módulos operativos incluidos (todos los planes):
- Punto de Venta (POS)
- Mapa de Mesas
- Monitor de Cocina (KDS)
- Zonas de Impresión
- Recetas y Menú
- Ingredientes
- Compras
- Proveedores
- Mermas
- Staff y Nóminas
- Reloj Checador
- CRM Clientes
- Reportes
- Configuración General

### NO incluido en ningún plan:
- ❌ Hardware (PC, tablet, impresora térmica)
- ❌ Migración de datos desde otros sistemas
- ❌ Capacitaciones adicionales
- ❌ Soporte presencial
- ❌ Desarrollo a medida

---

## 🔒 Límites y enforcement

| Límite | Fundador | Básico | Pro | Empresarial |
|--------|---------|--------|-----|-------------|
| Dispositivos | ∞ | ∞ | ∞ | ∞ |
| Empleados | 10 | 10 | 25 | 60 |
| Lealtad | ❌ | ❌ | ✅ | ✅ |
| Multi-sucursal | ❌ | ❌ | ❌ | ✅ |

- Los **dispositivos son ilimitados**. No hay gates ni add-ons por dispositivo.
- El **único enforcement real es empleados**. El sistema bloquea agregar más allá del límite del plan.
- Los **módulos premium** se ocultan en el sidebar si el plan no los incluye.

---

## 💳 Formas de pago

| Método | Disponible | Notas |
|--------|-----------|-------|
| Transferencia bancaria | ✅ | Pago único anual |
| Tarjeta de crédito/débito | ✅ | Vía Stripe |
| Pago mensual | ❌ | Solo anualidad |

> No hay reembolso parcial ni total una vez iniciado el periodo contratado.

---

## 🔄 Renovación

- El contrato se renueva **automáticamente** por periodos de 12 meses.
- El cliente puede cancelar con **30 días de anticipación**.
- Al cancelar, el software sigue funcionando en modo local, pero sin sync ni soporte.
- El cliente tiene **30 días** después de la cancelación para exportar sus datos.

---

## 📌 Notas internas

- El plan **Fundador** se desactiva (`activo = false`) después de los primeros 10 clientes.
- Los precios en base de datos van en **centavos** (Stripe-style): `$3,990.00` = `399000`.
- El **setup** se cobra manualmente por transferencia, no por Stripe.
- La **facturación CFDI** no está disponible aún. Se ofrecerá como add-on cuando se implemente.
