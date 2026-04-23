import 'dotenv/config'
import { supabase, supabaseAdmin } from './supabase-client.js'

console.log('🔍 Verificando conexión a Supabase...\n')

// Verificar variables de entorno
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno:')
  console.error('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '❌ FALTANTE')
  console.error('   SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓' : '❌ FALTANTE')
  console.error('\n📝 Por favor configura estas variables en tu archivo .env')
  process.exit(1)
}

console.log('✓ Variables de entorno encontradas')
console.log('   URL:', process.env.SUPABASE_URL)
console.log('   ANON KEY:', process.env.SUPABASE_ANON_KEY ? '***' + process.env.SUPABASE_ANON_KEY.slice(-4) : 'NO CONFIGURADA')

async function checkConnection() {
  try {
    // Test 1: Conexión básica (lectura)
    console.log('\n📡 Test 1: Conexión básica...')
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .limit(1)
    
    if (error) {
      if (error.code === '42P01') {
        console.error('❌ ERROR: Las tablas no existen en Supabase')
        console.error('   Por favor ejecuta el archivo supabase-schema.sql en el Editor SQL de Supabase')
        console.error('   URL: https://supabase.com/dashboard/project/_/sql/new')
      } else if (error.code === '42501') {
        console.error('❌ ERROR: Problema de permisos (RLS)')
        console.error('   Verifica las políticas de seguridad en Supabase')
      } else {
        console.error('❌ ERROR:', error.message)
        console.error('   Código:', error.code)
      }
      return false
    }
    
    console.log('✓ Conexión exitosa! Datos:', data)
    
    // Test 2: Escritura con service_role (si está disponible)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('\n📡 Test 2: Permisos de escritura...')
      const testKey = `test_${Date.now()}`
      const { error: writeError } = await supabaseAdmin
        .from('settings')
        .upsert({ key: testKey, value: 'test', updated_at: new Date().toISOString() })
      
      if (writeError) {
        console.warn('⚠️  Advertencia: No se pudo escribir con service_role:', writeError.message)
      } else {
        console.log('✓ Escritura exitosa!')
        
        // Limpiar test
        await supabaseAdmin
          .from('settings')
          .delete()
          .eq('key', testKey)
      }
    } else {
      console.log('\n⚠️  SUPABASE_SERVICE_ROLE_KEY no configurada (opcional para escrituras)')
    }
    
    console.log('\n✅ ¡Todo listo! Tu conexión a Supabase está funcionando correctamente.')
    return true
    
  } catch (error) {
    console.error('❌ ERROR inesperado:', error.message)
    return false
  }
}

checkConnection()
  .then(success => {
    if (!success) {
      console.log('\n📚 Revisa la guía SUPABASE_MIGRATION_GUIDE.md para más información.')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('Error fatal:', error)
    process.exit(1)
  })
