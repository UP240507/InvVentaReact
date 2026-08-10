// ─── AUDITORÍA (piloto del skin editorial · Proyecto D · tanda 2) ────────────
// Primera pantalla migrada a las primitivas adm-*. Valida el patrón de TABLA
// DENSA que la tanda 5 replicará en el resto de catálogos: header pegajoso,
// zebra por CSS, chips de estado, cero colores literales.
// Lógica de filtrado INTACTA — esto fue re-vestido, no reescrito.

import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  ShieldCheck,
  Search,
  Clock,
  User,
  Tag,
  Unlock,
  Trash2,
  ShieldAlert,
  Percent,
  FileWarning,
} from 'lucide-react';
import {
  PageShell,
  PageHeader,
  Card,
  Chip,
  SearchField,
  SegmentedControl,
  TableWrap,
  Table,
  THead,
  TBody,
  Th,
  Tr,
  Td,
  Input,
} from '../../components/ui';
import { hoyLocalISO } from '../../lib/Fechas';
import PanelDeadLetter from './PanelDeadLetter';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'critico', label: 'Críticos' },
  { id: 'warning', label: 'Advertencias' },
];

// El nivel del log mapea a un TONO semántico, no a un color: así el registro se
// lee igual en los 3 temas y en claro/oscuro.
const TONO_NIVEL = {
  critico: 'peligro',
  warning: 'alerta',
};

export default function AuditoriaScreen() {
  const { auditoria } = useAppStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('todos');

  // Rango de fechas por defecto (Hoy), en hora LOCAL: con UTC el filtro "hoy"
  // apuntaba a mañana desde las 18:00 y la bitácora salía vacía.
  const hoy = hoyLocalISO();
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin, setFechaFin] = useState(hoy);

  // ─── MOTOR DE FILTRADO ──────────────────────────────────────────────────
  const logsFiltrados = useMemo(() => {
    const inicio = new Date(fechaInicio + 'T00:00:00');
    const fin = new Date(fechaFin + 'T23:59:59');

    return (auditoria || [])
      .filter((log) => {
        const fechaLog = new Date(log.fecha);
        const entraEnFecha = fechaLog >= inicio && fechaLog <= fin;
        const entraEnNivel =
          filtroNivel === 'todos' || log.nivel === filtroNivel;

        const term = busqueda.toLowerCase();
        const entraEnBusqueda =
          (log.usuario || '').toLowerCase().includes(term) ||
          (log.accion || '').toLowerCase().includes(term) ||
          (log.detalles || '').toLowerCase().includes(term);

        return entraEnFecha && entraEnNivel && entraEnBusqueda;
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); // Siempre los más recientes arriba
  }, [auditoria, busqueda, filtroNivel, fechaInicio, fechaFin]);

  // KPIs de Seguridad
  const alertasCriticas = logsFiltrados.filter(
    (l) => l.nivel === 'critico',
  ).length;

  // ─── HELPERS VISUALES ───────────────────────────────────────────────────
  const getIconoAccion = (accion) => {
    const act = (accion || '').toUpperCase();
    if (act.includes('CAJON') || act.includes('APERTURA')) return Unlock;
    if (act.includes('CANCELACION') || act.includes('ELIMINAR')) return Trash2;
    if (act.includes('DESCUENTO')) return Percent;
    if (act.includes('STOCK') || act.includes('MERMA')) return FileWarning;
    return Tag;
  };

  return (
    <PageShell>
      <PageHeader
        icono={ShieldCheck}
        titulo="Log de Auditoría"
        descripcion="Registro inmutable de seguridad y operaciones"
        acciones={
          <>
            {alertasCriticas > 0 && (
              <Card className="px-3 py-1.5 flex items-center gap-2 border-adm-danger/40">
                <ShieldAlert className="w-4 h-4 text-adm-danger shrink-0" />
                <div className="leading-none">
                  <p className="text-[9px] font-bold text-adm-muted uppercase tracking-[0.16em]">
                    Críticas
                  </p>
                  <p className="text-base font-bold text-adm-danger tabular-nums">
                    {alertasCriticas}
                  </p>
                </div>
              </Card>
            )}
            <Card className="flex items-center gap-1 px-2 py-1">
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                aria-label="Fecha inicial"
                className="w-32 border-0 bg-transparent px-1 py-1 text-xs font-bold"
              />
              <span className="text-adm-muted text-xs">→</span>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                aria-label="Fecha final"
                className="w-32 border-0 bg-transparent px-1 py-1 text-xs font-bold"
              />
            </Card>
          </>
        }
      />

      {/* Diagnóstico de sincronización: va ARRIBA de la bitácora porque es la
          única parte de esta pantalla que pide una acción. Se oculta solo. */}
      <PanelDeadLetter />

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <SearchField
          icono={Search}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por usuario, acción o folio…"
          className="flex-1"
        />
        <SegmentedControl
          opciones={FILTROS}
          valor={filtroNivel}
          onChange={setFiltroNivel}
        />
      </div>

      {/* Tabla densa */}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <Th>Fecha y hora</Th>
              <Th>Usuario</Th>
              <Th>Acción</Th>
              <Th>Módulo</Th>
              <Th>Detalles</Th>
              <Th className="text-center">Nivel</Th>
            </tr>
          </THead>
          <TBody>
            {logsFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-12 text-center">
                  <ShieldCheck className="w-12 h-12 text-adm-muted opacity-30 mx-auto mb-3" />
                  <p className="font-fraunces font-bold text-lg text-adm-ink">
                    Sin registros
                  </p>
                  <p className="text-sm text-adm-muted mt-1">
                    No se encontraron eventos con estos filtros.
                  </p>
                </td>
              </tr>
            ) : (
              logsFiltrados.map((log) => {
                const Icono = getIconoAccion(log.accion);
                return (
                  <Tr key={log.id}>
                    <Td className="whitespace-nowrap">
                      <span className="flex items-center gap-2 text-xs text-adm-muted tabular-nums">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {new Date(log.fecha).toLocaleString('es-MX', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2 font-bold text-adm-ink">
                        <User className="w-3.5 h-3.5 text-adm-muted shrink-0" />
                        {log.usuario}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2 font-medium">
                        <Icono className="w-3.5 h-3.5 text-adm-muted shrink-0" />
                        {log.accion}
                      </span>
                    </Td>
                    <Td className="text-[10px] font-bold text-adm-muted uppercase tracking-[0.16em]">
                      {log.modulo}
                    </Td>
                    <Td className="text-adm-muted w-1/3">{log.detalles}</Td>
                    <Td className="text-center">
                      <Chip tono={TONO_NIVEL[log.nivel] || 'neutro'}>
                        {log.nivel}
                      </Chip>
                    </Td>
                  </Tr>
                );
              })
            )}
          </TBody>
        </Table>
      </TableWrap>
    </PageShell>
  );
}
