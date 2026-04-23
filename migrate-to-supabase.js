import Database from 'better-sqlite3'
import { supabaseAdmin } from './supabase-client.js'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.MESSAGES_DB_PATH ?? join(__dirname, 'messages.db')

console.log('🔄 Iniciando migración de SQLite a Supabase...\n')
console.log('📂 Base de datos origen:', DB_PATH)

// Verificar que existe la base de datos
try {
  const db = new Database(DB_PATH, { readonly: true })
  
  // Migrar mensajes
  console.log('\n📋 Migrando mensajes...')
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all()
  console.log(`   Encontrados ${messages.length} mensajes`)
  
  if (messages.length > 0) {
    let migrated = 0
    let errors = 0
    
    for (const msg of messages) {
      try {
        const { error } = await supabaseAdmin
          .from('messages')
          .upsert({
            id: msg.id,
            source: msg.source,
            donor_name: msg.donor_name,
            amount: msg.amount,
            text: msg.text,
            status: msg.status,
            retries: msg.retries || 0,
            audio_path: msg.audio_path,
            created_at: new Date(msg.created_at).toISOString(),
            updated_at: new Date(msg.updated_at).toISOString(),
            error_msg: msg.error_msg
          }, { onConflict: 'id' })
        
        if (error) {
          console.error(`   ❌ Error migrando mensaje ${msg.id}:`, error.message)
          errors++
        } else {
          migrated++
        }
      } catch (err) {
        console.error(`   ❌ Error procesando mensaje ${msg.id}:`, err.message)
        errors++
      }
    }
    
    console.log(`   ✅ Migrados: ${migrated}`)
    if (errors > 0) {
      console.log(`   ⚠️  Errores: ${errors}`)
    }
  }
  
  // Migrar settings
  console.log('\n⚙️  Migrando configuraciones...')
  const settings = db.prepare('SELECT * FROM settings').all()
  console.log(`   Encontradas ${settings.length} configuraciones`)
  
  if (settings.length > 0) {
    for (const setting of settings) {
      try {
        await supabaseAdmin
          .from('settings')
          .upsert({
            key: setting.key,
            value: setting.value,
            updated_at: new Date(setting.updated_at).toISOString()
          }, { onConflict: 'key' })
      } catch (err) {
        console.error(`   ❌ Error migrando setting ${setting.key}:`, err.message)
      }
    }
    console.log(`   ✅ Configuraciones migradas`)
  }
  
  // Migrar webhook_dedupe (si existe)
  try {
    const webhooks = db.prepare('SELECT * FROM webhook_dedupe').all()
    if (webhooks.length > 0) {
      console.log(`\n🔗 Migrando webhooks dedupe...`)
      console.log(`   Encontrados ${webhooks.length} registros`)
      
      for (const webhook of webhooks) {
        try {
          await supabaseAdmin
            .from('webhook_dedupe')
            .upsert({
              provider: webhook.provider,
              dedupe_key: webhook.dedupe_key,
              source: webhook.source,
              provider_event_id: webhook.provider_event_id,
              provider_delivery_id: webhook.provider_delivery_id,
              payload_json: webhook.payload_json,
              status: webhook.status,
              message_id: webhook.message_id,
              error_msg: webhook.error_msg,
              created_at: new Date(webhook.created_at).toISOString(),
              updated_at: new Date(webhook.updated_at).toISOString()
            }, { onConflict: ['provider', 'dedupe_key'] })
        } catch (err) {
          console.error(`   ❌ Error migrando webhook:`, err.message)
        }
      }
      console.log(`   ✅ Webhooks migrados`)
    }
  } catch (err) {
    console.log('   ℹ️  Tabla webhook_dedupe no existe (opcional)')
  }
  
  db.close()
  
  console.log('\n✅ Migración completada!')
  console.log('\n📝 Notas:')
  console.log('   1. Los archivos de audio en ./audio_cache/ siguen siendo válidos')
  console.log('   2. La base de datos SQLite original no se ha modificado')
  console.log('   3. Ejecuta "npm run check:supabase" para verificar la conexión')
  console.log('   4. Inicia el servidor con "npm start" para usar Supabase\n')
  
} catch (error) {
  if (error.code === 'SQLITE_CANTOPEN') {
    console.log('\n⚠️  No se encontró base de datos SQLite en:', DB_PATH)
    console.log('   Esto es normal si es una instalación nueva.')
    console.log('   La migración no es necesaria.\n')
  } else {
    console.error('\n❌ Error durante la migración:', error.message)
    process.exit(1)
  }
}
