-- APAF-Lite Supabase / PostgreSQL Schema

-- 1. Telemetry Packets
CREATE TABLE IF NOT EXISTS telemetry_packets (
  id SERIAL PRIMARY KEY,
  packet_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ASPERA-3', 'MEX-OA')),
  instrument TEXT CHECK (instrument IN ('ELS', 'IMA', 'NPD') OR instrument IS NULL),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleaned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'CLEANED', 'PROCESSED', 'BLOCKED', 'REJECTED')),
  payload_json JSONB NOT NULL
);

-- 2. Intermediate Files
CREATE TABLE IF NOT EXISTS intermediate_files (
  id SERIAL PRIMARY KEY,
  packet_id INTEGER NOT NULL REFERENCES telemetry_packets(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleanup_notes TEXT,
  status TEXT NOT NULL DEFAULT 'OK' CHECK (status IN ('OK', 'BLOCKED'))
);

-- 3. IDFS Datasets
CREATE TABLE IF NOT EXISTS idfs_datasets (
  id SERIAL PRIMARY KEY,
  packet_id INTEGER NOT NULL REFERENCES telemetry_packets(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL CHECK (instrument IN ('ELS', 'IMA', 'NPD')),
  data_json JSONB NOT NULL,
  public_released INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ NOT NULL,
  processing_completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Archive Records
CREATE TABLE IF NOT EXISTS archive_records (
  id SERIAL PRIMARY KEY,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('TELEMETRY', 'INTERMEDIATE', 'IDFS')),
  artifact_id INTEGER NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL
);

-- 5. Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SCIENCE_TEAM', 'ADMIN'))
);

-- 6. System Logs
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
  context_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_telemetry_packets_status ON telemetry_packets(status);
CREATE INDEX IF NOT EXISTS idx_telemetry_packets_instrument ON telemetry_packets(instrument);
CREATE INDEX IF NOT EXISTS idx_idfs_datasets_instrument ON idfs_datasets(instrument);
CREATE INDEX IF NOT EXISTS idx_idfs_datasets_public_released ON idfs_datasets(public_released);
CREATE INDEX IF NOT EXISTS idx_archive_records_artifact ON archive_records(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_severity ON system_logs(severity);

-- Row Level Security (RLS) policies
ALTER TABLE telemetry_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE intermediate_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE idfs_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_telemetry_packets') THEN
    CREATE POLICY service_role_telemetry_packets ON telemetry_packets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_intermediate_files') THEN
    CREATE POLICY service_role_intermediate_files ON intermediate_files FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_idfs_datasets') THEN
    CREATE POLICY service_role_idfs_datasets ON idfs_datasets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_archive_records') THEN
    CREATE POLICY service_role_archive_records ON archive_records FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_users') THEN
    CREATE POLICY service_role_users ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_system_logs') THEN
    CREATE POLICY service_role_system_logs ON system_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
