// src/features/inventario/components/EmpaquesProveedor.jsx
//
// Los empaques de compra de UN proveedor: «1 arpilla = 30 kg».
//
// ── POR QUÉ VIVE EN LA FICHA DEL PROVEEDOR ───────────────────────────────────
//
// Decisión de Chris, 02-sep: es el proveedor quien muestra y ofrece las
// presentaciones. La misma naranja viene en arpilla de 30 kg de uno y en reja
// de 20 de otro, así que la lista pertenece a quien la vende, no al insumo.
//
// Lo que se captura aquí evita, en la línea de compra, la división a mano que
// hoy entra al costo promedio ponderado sin que nada la valide. Todo el porqué
// está en `lib/Empaques.js`.
import { useMemo, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useSyncStore } from '../../../store/useSyncStore';
import {
  Modal,
  Button,
  IconButton,
  Field,
  Input,
  Select,
  Chip,
  EmptyState,
} from '../../../components/ui';
import { Package, Plus, EyeOff, ArchiveRestore } from 'lucide-react';
import { prepararEmpaque, describirEmpaque } from '../../../lib/Empaques';

export default function EmpaquesProveedor({ proveedor, onCerrar }) {
  const { productos, proveedorProducto, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [productoId, setProductoId] = useState('');
  const [nombre, setNombre] = useState('');
  const [factor, setFactor] = useState('');

  const insumos = useMemo(
    () =>
      (productos || [])
        .filter((p) => p.activo !== false)
        .slice()
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    [productos],
  );

  // Los de este proveedor, encendidos y apagados: desde aquí se vuelve a
  // encender uno, así que esconderlos lo dejaría inalcanzable.
  const mios = useMemo(() => {
    const nombreDe = (id) =>
      insumos.find((p) => String(p.id) === String(id))?.nombre || '';
    return (proveedorProducto || [])
      .filter((e) => String(e.proveedor_id) === String(proveedor?.id))
      .slice()
      .sort(
        (a, b) =>
          nombreDe(a.producto_id).localeCompare(nombreDe(b.producto_id)) ||
          Number(a.factor) - Number(b.factor),
      );
  }, [proveedorProducto, proveedor, insumos]);

  const insumoDe = (id) => insumos.find((p) => String(p.id) === String(id));
  const unidadElegida = insumoDe(productoId)?.unidad || '';

  // Un solo camino para escribir: la fila entera, y el estado local se mueve
  // igual que en el resto del proyecto (optimista; `enqueueAction` persiste).
  const guardarFila = (fila) => {
    enqueueAction('proveedor_producto', 'upsert', fila);
    useAppStore.setState((prev) => ({
      proveedorProducto: [
        fila,
        ...(prev.proveedorProducto || []).filter(
          (e) => String(e.id) !== String(fila.id),
        ),
      ],
    }));
  };

  const agregar = (e) => {
    e.preventDefault();
    const r = prepararEmpaque({
      existentes: proveedorProducto,
      proveedorId: proveedor?.id,
      productoId,
      nombre,
      factor,
    });
    if (!r.ok) return showToast(r.error, 'error');

    guardarFila(r.fila);
    setNombre('');
    setFactor('');
    showToast('Empaque guardado', 'success');
  };

  const apagar = (e) => guardarFila({ ...e, activo: false });
  const encender = (e) => guardarFila({ ...e, activo: true });

  return (
    <Modal
      as="form"
      onSubmit={agregar}
      titulo={`Empaques de ${proveedor?.nombre || ''}`}
      onClose={onCerrar}
      ancho="max-w-2xl"
      pie={
        <Button type="button" variante="fantasma" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <p className="text-xs font-bold text-adm-muted mb-5">
        Cómo vende este proveedor cada insumo. Con esto, al hacer la orden se
        teclea <strong>«2 arpillas a $900»</strong> en vez de calcular a mano
        cuánto sale el kilo — y esa cuenta es la que entra al costo de tus
        platillos.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end mb-6">
        <Field label="Insumo" requerido className="sm:col-span-5">
          <Select
            aria-label="Insumo del empaque"
            value={productoId}
            onChange={(ev) => setProductoId(ev.target.value)}
          >
            <option value="">— Elige uno —</option>
            {insumos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.unidad})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Se vende por" requerido className="sm:col-span-3">
          <Input
            aria-label="Nombre del empaque"
            value={nombre}
            onChange={(ev) => setNombre(ev.target.value)}
            placeholder="arpilla, reja…"
          />
        </Field>

        <Field
          label={unidadElegida ? `Trae (${unidadElegida})` : 'Trae'}
          requerido
          className="sm:col-span-2"
        >
          <Input
            aria-label="Unidades por empaque"
            type="number"
            step="any"
            min="0"
            value={factor}
            onChange={(ev) => setFactor(ev.target.value)}
            placeholder="30"
          />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" icono={Plus} className="w-full">
            Agregar
          </Button>
        </div>
      </div>

      {mios.length === 0 ? (
        <EmptyState
          icono={Package}
          titulo="Sin empaques todavía"
          descripcion="Mientras no haya ninguno, sus insumos se piden en su unidad de siempre."
        />
      ) : (
        <ul className="space-y-2">
          {mios.map((e) => {
            const insumo = insumoDe(e.producto_id);
            const apagado = e.activo === false;
            return (
              <li
                key={e.id}
                className={`flex items-center gap-3 bg-adm-bg border border-adm-border rounded-ui px-4 py-3 ${
                  apagado ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-adm-ink truncate">
                    {/* Si el insumo ya no está, se dice: es mejor que enseñar
                        un hueco donde iba un nombre. */}
                    {insumo?.nombre || 'Insumo que ya no está'}
                  </p>
                  <p className="text-xs font-bold text-adm-muted">
                    {describirEmpaque(e, insumo?.unidad)}
                  </p>
                </div>
                {apagado && <Chip tono="peligro">Apagado</Chip>}
                <IconButton
                  icono={apagado ? ArchiveRestore : EyeOff}
                  titulo={apagado ? 'Volver a usarlo' : 'Dejar de usarlo'}
                  onClick={() => (apagado ? encender(e) : apagar(e))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
