-- Esquema para Supabase - Sistema TTS
-- Ejecutar este archivo en el Editor SQL de Supabase

-- Habilitar extensión para UUID (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source TEXT NOT NULL CHECK(source IN ('manual','webhook')),
    donor_name TEXT,
    amount DECIMAL(10,2),
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','QUEUED','SYNTHESIZING','READY','PLAYING','PAUSED','DONE','FAILED','SKIPPED')),
    retries INTEGER NOT NULL DEFAULT 0,
    audio_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_msg TEXT
);

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Tabla de deduplicación de webhooks
CREATE TABLE IF NOT EXISTS webhook_dedupe (
    provider TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'webhook',
    provider_event_id TEXT,
    provider_delivery_id TEXT,
    payload_json JSONB,
    status TEXT NOT NULL DEFAULT 'CLAIMED'
        CHECK(status IN ('CLAIMED','PROCESSED','FAILED')),
    message_id UUID REFERENCES messages(id),
    error_msg TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (provider, dedupe_key)
);

-- Índices para webhook_dedupe
CREATE INDEX IF NOT EXISTS idx_webhook_dedupe_status ON webhook_dedupe(status);
CREATE INDEX IF NOT EXISTS idx_webhook_dedupe_created ON webhook_dedupe(created_at DESC);

-- Tabla de configuración (settings)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_dedupe_updated_at BEFORE UPDATE ON webhook_dedupe
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insertar configuración por defecto (usando ON CONFLICT para evitar errores si ya existen)
INSERT INTO settings (key, value) VALUES
    ('audioProfilePreference', 'auto'),
    ('messageFilterEnabled', 'false'),
    ('messageFilterBlacklist', '[]'),
    ('ttsVoice', 'es-AR-TomasNeural'),
    ('ttsPreset', 'neutral'),
    ('kickBotConfig', '{"enabled":false,"channel":"","prefix":"!","allowTtsFromChat":false,"allowCommandsFromMods":true,"allowCommandsFromVip":false,"viewerCommands":["help","status","tts"],"moderatorCommands":["help","status","tts","skip","replay","voice","preset","cancel","delete","restore"],"streamerCommands":["help","status","tts","skip","replay","voice","preset","cancel","delete","restore"]}')
ON CONFLICT (key) DO NOTHING;

-- Políticas de seguridad (RLS - Row Level Security)
-- Nota: Ajusta estas políticas según tus necesidades de seguridad

-- Habilitar RLS en las tablas
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_dedupe ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Políticas para messages (permitir todas las operaciones con la clave anon)
CREATE POLICY "Allow anon to read messages" ON messages
    FOR SELECT USING (true);

CREATE POLICY "Allow anon to insert messages" ON messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon to update messages" ON messages
    FOR UPDATE USING (true);

-- Políticas para webhook_dedupe
CREATE POLICY "Allow anon to read webhook_dedupe" ON webhook_dedupe
    FOR SELECT USING (true);

CREATE POLICY "Allow anon to insert webhook_dedupe" ON webhook_dedupe
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon to update webhook_dedupe" ON webhook_dedupe
    FOR UPDATE USING (true);

-- Políticas para settings (solo lectura para anon, escritura requiere service_role)
CREATE POLICY "Allow anon to read settings" ON settings
    FOR SELECT USING (true);

-- Nota: La escritura en settings se hace con service_role key desde el servidor

-- Storage para archivos de audio (ejecutar desde el Dashboard de Supabase)
-- 1. Ve a Storage en el dashboard
-- 2. Crea un bucket llamado 'tts-audio'
-- 3. Configura el bucket como público o privado según necesites

-- Políticas para el bucket tts-audio (ajusta según necesites):
-- Si el bucket es público:
-- CREATE POLICY "Allow public access to tts-audio" ON storage.objects
--    FOR SELECT USING (bucket_id = 'tts-audio');

-- Si el bucket es privado (usar URLs firmadas):
-- CREATE POLICY "Allow authenticated access to tts-audio" ON storage.objects
--    FOR SELECT USING (bucket_id = 'tts-audio' AND auth.role() = 'authenticated');

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Esquema de Supabase creado exitosamente!';
END $$;
