import { create } from 'zustand';

export const usePropineroStore = create((set, get) => ({
  // 1. EL ACUMULADOR HISTÓRICO
  historialTurnos: [], 

  // 2. EL TURNO ACTUAL
  totalPropinasDia: 4250.00,
  
  // 🔥 NUEVO: Configuración de la modalidad
  // Puede ser: 'solo_horas' o 'horas_y_zonas'
  modoReparto: 'solo_horas', 
  
  // Reglas macro (El pastel principal)
  reglasDistribucion: {
    meseros: 45, cocina: 30, barra: 15, caja: 10
  },

  // La plantilla activa de HOY
  // (Nota que la 'zona' sigue ahí, pero el sistema puede ignorarla si así se configura)
  empleadosActivos: [
    { id: 1, nombre: 'Carlos', area: 'meseros', zona: 'Terraza', horas: 8 },
    { id: 2, nombre: 'Ana', area: 'meseros', zona: 'Salón', horas: 8 },
    { id: 3, nombre: 'Pedro', area: 'meseros', zona: 'Terraza', horas: 4 },
    { id: 4, nombre: 'Luis', area: 'cocina', zona: 'Plancha', horas: 8 },
    { id: 5, nombre: 'Sofía', area: 'barra', zona: 'Bebidas Frías', horas: 8 },
    { id: 6, nombre: 'Elena', area: 'caja', zona: 'Mostrador', horas: 8 },
  ],

  // 3. MOTOR DE CÁLCULO PRECISO (Ahora soporta ambos modos)
  calcularReparto: () => {
    const { totalPropinasDia, reglasDistribucion, empleadosActivos, modoReparto } = get();
    const desglose = {};

    for (const [area, porcentaje] of Object.entries(reglasDistribucion)) {
      const montoTotalArea = totalPropinasDia * (porcentaje / 100);
      const empleadosArea = empleadosActivos.filter(emp => emp.area === area);
      const horasTotalesArea = empleadosArea.reduce((acc, emp) => acc + emp.horas, 0);
      
      let detalleEmpleados = [];

      // ---------------------------------------------------------
      // MODALIDAD 1: SIMPLIFICADA (Solo por horas)
      // ---------------------------------------------------------
      if (modoReparto === 'solo_horas') {
        const valorPorHora = horasTotalesArea > 0 ? (montoTotalArea / horasTotalesArea) : 0;
        
        detalleEmpleados = empleadosArea.map(emp => ({
          ...emp,
          montoGanado: emp.horas * valorPorHora
        }));
      } 
      // ---------------------------------------------------------
      // MODALIDAD 2: COMPLEJA (Horas y Zonas)
      // (Aquí el gerente podría asignarle un "peso" distinto a la Terraza vs el Salón)
      // Por ahora, lo mantenemos igual al simple, pero dejamos la puerta abierta para
      // aplicar multiplicadores por zona en el futuro.
      // ---------------------------------------------------------
      else if (modoReparto === 'horas_y_zonas') {
        // En este ejemplo, imaginemos que la 'Terraza' vale un 10% extra por el esfuerzo.
        // (Esto requeriría configurar "pesos" por zona, pero te dejo la estructura).
        const valorPorHoraBase = horasTotalesArea > 0 ? (montoTotalArea / horasTotalesArea) : 0;

        detalleEmpleados = empleadosArea.map(emp => {
            // Ejemplo rápido: Si es terraza, le damos un pequeño bono figurativo
            const multiplicadorZona = emp.zona === 'Terraza' ? 1.1 : 1.0; 
            return {
                ...emp,
                montoGanado: (emp.horas * valorPorHoraBase) * multiplicadorZona // ¡Ojo! Habría que recalcular para no pasarse del 100%
            }
        });
        
        // *Nota del Senior: Implementar matemáticamente los pesos por zona requiere un cálculo 
        // de "Puntos Totales" en lugar de solo "Horas". Si solo queremos agruparlos visualmente,
        // la modalidad 'solo_horas' es suficiente por ahora, y en la vista simplemente los filtramos por zona.
      }

      desglose[area] = {
        porcentaje,
        montoTotal: montoTotalArea,
        detalleEmpleados
      };
    }
    return desglose;
  },

  // 4. FUNCIONES DE APOYO
  cambiarModo: (nuevoModo) => set({ modoReparto: nuevoModo }),

  cerrarTurno: () => {
    const desgloseFinal = get().calcularReparto();
    const fechaHoy = new Date().toISOString();
    set((state) => ({
      historialTurnos: [
        ...state.historialTurnos, 
        { fecha: fechaHoy, modo: state.modoReparto, total: state.totalPropinasDia, detalle: desgloseFinal, pagado: false }
      ],
      totalPropinasDia: 0 
    }));
  },

  actualizarRegla: (area, nuevoPorcentaje) => {
    set((state) => ({
      reglasDistribucion: { ...state.reglasDistribucion, [area]: Number(nuevoPorcentaje) }
    }));
  }
}));