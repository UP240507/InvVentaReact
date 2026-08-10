// src/features/inventario/useInventoryStore.js
// Delegado a useAppStore — este store solo expone la interfaz
// que esperan los componentes de inventario.
import { useAppStore } from '../../store/useAppStore';

// Helper hook para componentes React
export const useInventoryStore = () => {
  const { productos, recetas, descontarStock, actualizarStock } = useAppStore();
  return {
    // ✅ Alias: los componentes de inventario usan 'insumos', el store usa 'productos'
    insumos: productos,
    productos,
    recetas,
    descontarStock,
    actualizarStock,
  };
};

// Para llamadas fuera de componentes (ej. desde usePosStore)
export const inventoryActions = {
  descontarPorVenta: (orden) => {
    const ingredientes = [];
    for (const item of orden) {
      for (const ing of item.receta.ingredientes || []) {
        const existente = ingredientes.find(
          (i) => i.productoId === ing.productoId,
        );
        if (existente) {
          existente.cantidad += ing.cantidad * item.cantidad;
        } else {
          ingredientes.push({
            productoId: ing.productoId,
            cantidad: ing.cantidad * item.cantidad,
            merma: ing.merma ?? 0,
          });
        }
      }
    }
    useAppStore.getState().descontarStock(ingredientes);
  },
};
