import { useEffect, useRef } from 'react';
import { useSyncStore } from '../store/useSyncStore';
import { useAppStore } from '../store/useAppStore';

// El evento 'online' del navegador llega ANTES de que la red esté realmente
// lista (DNS resolviendo, red cambiando). Vaciar la cola de inmediato produce
// ERR_NAME_NOT_RESOLVED / ERR_NETWORK_CHANGED ruidosos (que igual se reintentan
// y terminan cuadrando). Esperamos un momento y reconfirmamos antes de vaciar.
const RECONNECT_DELAY_MS = 2000;

export function useNetworkListener() {
  const { setOfflineStatus, processQueue } = useSyncStore();
  const timerRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleOnline = () => {
      setOfflineStatus(false);
      // Vaciado diferido: deja que la conexión se estabilice y reconfirma.
      // El toast de "N sincronizados" lo dispara processQueue, NO aquí
      // (evita duplicados y no depende de navigator.onLine).
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (navigator.onLine) processQueue();
      }, RECONNECT_DELAY_MS);
    };

    const handleOffline = () => {
      clearTimer(); // cancelar un vaciado pendiente si se vuelve a caer la red
      setOfflineStatus(true);
      useAppStore
        .getState()
        .showToast?.('Sin conexión: trabajando en modo offline.', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOfflineStatus, processQueue]);
}
