// ─── PROVEEDORES (piloto del skin editorial · Proyecto D · tanda 2) ──────────
// Segundo piloto: valida el CRUD completo (grid de tarjetas + modal de alta y
// edición + confirmación destructiva) sobre las primitivas adm-*.
// Además estrena el enganche con el BUSCADOR GLOBAL: si se llega aquí desde el
// topbar, el término viene en location.state.busquedaGlobal y precarga el
// filtro. Ese es el contrato que replicará el resto de pantallas en la tanda 5.
// Lógica de datos INTACTA (upsert + enqueueAction + baja lógica).

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  User,
  Building2,
  Trash2,
  Edit3,
  AlertTriangle,
  ShoppingCart,
  ArchiveRestore,
} from 'lucide-react';
import {
  PageShell,
  PageHeader,
  Card,
  CardBody,
  Button,
  IconButton,
  Chip,
  EmptyState,
  SearchField,
  SegmentedControl,
  Field,
  Input,
  Textarea,
  Modal,
  ConfirmModal,
} from '../../components/ui';

const EMPTY = {
  nombre: '',
  rfc: '',
  telefono: '',
  email: '',
  contacto: '',
  direccion: '',
  notas: '',
};

const ESTADOS = [
  { id: 'Activos', label: 'Activos' },
  { id: 'Inactivos', label: 'Inactivos' },
];

export default function ProveedoresScreen() {
  const { proveedores, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Precarga del buscador global del topbar (si se llegó desde ahí).
  const [busqueda, setBusqueda] = useState(
    location.state?.busquedaGlobal ?? '',
  );
  const [filtroEstado, setFiltroEstado] = useState('Activos');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const [proveedorAEliminar, setProveedorAEliminar] = useState(null);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const lista = (proveedores || [])
    .filter((p) => {
      if (filtroEstado === 'Activos' && p.activo === false) return false;
      if (filtroEstado === 'Inactivos' && p.activo !== false) return false;

      const matchBusqueda =
        (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.rfc || '').toLowerCase().includes(busqueda.toLowerCase());
      return matchBusqueda;
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const abrirNuevo = () => {
    setForm(EMPTY);
    setEditId(null);
    setShowModal(true);
  };
  const abrirEditar = (p) => {
    setForm({ ...p });
    setEditId(p.id);
    setShowModal(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!form.nombre.trim())
      return showToast('El nombre del proveedor es obligatorio.', 'error');

    // CRÍTICO (RLS tenant_proveedores estricto): sin restaurante_id el insert se rechaza.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );

    const prov = {
      ...form,
      id: editId || Date.now(),
      activo: true,
      restaurante_id: restauranteId,
    };

    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);

    setShowModal(false);
    showToast(
      editId
        ? 'Proveedor actualizado'
        : `"${prov.nombre}" agregado exitosamente`,
      'success',
    );
  };

  const confirmarEliminar = () => {
    if (!proveedorAEliminar) return;
    const prov = { ...proveedorAEliminar, activo: false };

    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);

    showToast(`Proveedor ocultado del sistema.`, 'success');
    setProveedorAEliminar(null);
  };

  const reactivarProveedor = (p) => {
    const prov = { ...p, activo: true };
    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);
    showToast(`Proveedor ${p.nombre} reactivado exitosamente.`, 'success');
  };

  const dato = (Icono, valor, extra = '') =>
    valor ? (
      <div className="flex items-start gap-2.5 text-sm text-adm-ink">
        <Icono className="w-4 h-4 text-adm-muted shrink-0 mt-0.5" />
        <span className={extra}>{valor}</span>
      </div>
    ) : null;

  return (
    <PageShell>
      <PageHeader
        icono={Truck}
        titulo="Proveedores"
        descripcion="Directorio y cadena de suministro"
        acciones={
          <Button icono={Plus} onClick={abrirNuevo}>
            Nuevo proveedor
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <SearchField
          icono={Search}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor o RFC…"
          className="flex-1 max-w-md"
        />
        <SegmentedControl
          opciones={ESTADOS}
          valor={filtroEstado}
          onChange={setFiltroEstado}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-8 pr-1">
        {lista.length === 0 ? (
          <EmptyState
            icono={Truck}
            titulo={`Sin proveedores ${filtroEstado.toLowerCase()}`}
            descripcion="No hay proveedores que coincidan con tu búsqueda."
            accion={
              filtroEstado === 'Activos' ? (
                <Button icono={Plus} onClick={abrirNuevo}>
                  Agregar el primero
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lista.map((p) => {
              const inactivo = p.activo === false;
              return (
                <Card
                  key={p.id}
                  hover={!inactivo}
                  className={inactivo ? 'opacity-70' : ''}
                >
                  <CardBody className="flex flex-col h-full">
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-ui bg-adm-chip text-adm-chip-fg flex items-center justify-center font-fraunces font-bold text-lg shrink-0">
                          {(p.nombre || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3
                            className="font-fraunces font-bold text-adm-ink leading-tight truncate"
                            title={p.nombre}
                          >
                            {p.nombre}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {p.rfc && (
                              <span className="text-[10px] font-mono font-bold text-adm-muted">
                                {p.rfc}
                              </span>
                            )}
                            {inactivo && <Chip tono="peligro">Oculto</Chip>}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-0.5 shrink-0">
                        {inactivo ? (
                          <IconButton
                            icono={ArchiveRestore}
                            titulo="Reactivar proveedor"
                            onClick={() => reactivarProveedor(p)}
                          />
                        ) : (
                          <>
                            <IconButton
                              icono={ShoppingCart}
                              titulo="Crear orden de compra"
                              onClick={() =>
                                navigate('/compras', {
                                  state: { preselectedProveedor: p },
                                })
                              }
                            />
                            <IconButton
                              icono={Edit3}
                              titulo="Editar"
                              onClick={() => abrirEditar(p)}
                            />
                            <IconButton
                              icono={Trash2}
                              titulo="Ocultar"
                              className="hover:text-adm-danger"
                              onClick={() => setProveedorAEliminar(p)}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2.5 flex-1">
                      {dato(User, p.contacto)}
                      {dato(Phone, p.telefono)}
                      {dato(Mail, p.email)}
                      {dato(
                        Building2,
                        p.direccion,
                        'line-clamp-2 leading-snug',
                      )}
                    </div>

                    {p.notas && (
                      <div className="mt-4 bg-adm-bg border border-adm-border rounded-ui p-3">
                        <p className="text-[10px] font-bold text-adm-muted uppercase tracking-[0.16em] mb-1">
                          Notas
                        </p>
                        <p className="text-xs text-adm-muted line-clamp-2 italic">
                          "{p.notas}"
                        </p>
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showModal && (
        <Modal
          as="form"
          onSubmit={guardar}
          titulo={editId ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={() => setShowModal(false)}
          pie={
            <>
              <Button
                variante="secundario"
                className="flex-1"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                {editId ? 'Guardar cambios' : 'Agregar proveedor'}
              </Button>
            </>
          }
        >
          <Field label="Nombre de la empresa" requerido>
            <Input
              value={form.nombre || ''}
              onChange={set('nombre')}
              placeholder="Ej. Distribuidora del Norte S.A."
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="RFC">
              <Input
                value={form.rfc || ''}
                onChange={set('rfc')}
                placeholder="XAXX010101000"
              />
            </Field>
            <Field label="Teléfono">
              <Input
                type="tel"
                value={form.telefono || ''}
                onChange={set('telefono')}
                placeholder="(00) 0000-0000"
              />
            </Field>
          </div>
          <Field label="Correo electrónico">
            <Input
              type="email"
              value={form.email || ''}
              onChange={set('email')}
              placeholder="ventas@proveedor.mx"
            />
          </Field>
          <Field label="Nombre del contacto">
            <Input
              value={form.contacto || ''}
              onChange={set('contacto')}
              placeholder="Nombre del agente o vendedor"
            />
          </Field>
          <Field label="Dirección física">
            <Input
              value={form.direccion || ''}
              onChange={set('direccion')}
              placeholder="Calle, número, colonia, ciudad"
            />
          </Field>
          <Field label="Notas / observaciones">
            <Textarea
              rows={3}
              value={form.notas || ''}
              onChange={set('notas')}
              placeholder="Ej. Días de entrega, condiciones…"
            />
          </Field>
        </Modal>
      )}

      {/* MODAL ELIMINAR */}
      {proveedorAEliminar && (
        <ConfirmModal
          icono={AlertTriangle}
          titulo="¿Ocultar proveedor?"
          textoConfirmar="Ocultar"
          onCancelar={() => setProveedorAEliminar(null)}
          onConfirmar={confirmarEliminar}
          mensaje={
            <>
              El proveedor{' '}
              <strong className="text-adm-ink">
                {proveedorAEliminar.nombre}
              </strong>{' '}
              se ocultará de las listas para no afectar órdenes de compra
              pasadas.
            </>
          }
        />
      )}
    </PageShell>
  );
}
