import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseSilent = process.env.SUPABASE_SILENT === '1' || process.env.NODE_ENV === 'test' || !supabaseUrl

if (!supabaseSilent && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('⚠️  ADVERTENCIA: Faltan variables de entorno de Supabase. Usando valores por defecto.')
}

// Cliente para operaciones públicas (usado por el servidor)
export const supabase = createClient(
  supabaseUrl || 'https://tu-proyecto.supabase.co',
  supabaseAnonKey || 'tu_anon_key_aqui'
)

// Cliente para operaciones privilegiadas (usado por el servidor para escrituras)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://tu-proyecto.supabase.co',
  supabaseServiceKey || 'tu_service_role_key_aqui'
)

if (!supabaseSilent) console.log('✅ Cliente Supabase inicializado')
