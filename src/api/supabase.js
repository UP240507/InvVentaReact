import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Faltan las variables VITE_SUPABASE_URL y/o VITE_SUPABASE_KEY en el archivo .env');
}

// Cliente principal para la operación diaria
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_KEY || 'placeholder-key'
);

// Cliente secundario para flujos de auth sin persistencia
export const supabaseAdminAuth = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_KEY || 'placeholder-key',
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'admin-auth-token' // 👈 ESTA LÍNEA ELIMINA EL WARNING
        }
    }
);