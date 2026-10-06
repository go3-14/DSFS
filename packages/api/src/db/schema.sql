PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transfers (
  file_id TEXT PRIMARY KEY,
  capability_hash TEXT NOT NULL,
  upload_session_hash TEXT NOT NULL,
  download_token_hash TEXT,
  download_token_expires_at TEXT,
  original_name_encrypted TEXT,
  total_size_bytes INTEGER NOT NULL CHECK (total_size_bytes >= 0),
  chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
  chunk_size_bytes INTEGER NOT NULL CHECK (chunk_size_bytes > 0),
  status TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  max_downloads INTEGER NOT NULL DEFAULT 1 CHECK (max_downloads >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  download_lease_until TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_transfers_status_expires_at
  ON transfers(status, expires_at);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES transfers(file_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  UNIQUE(file_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS storage_nodes (
  node_id TEXT PRIMARY KEY,
  endpoint_url TEXT NOT NULL,
  status TEXT NOT NULL,
  total_capacity_bytes INTEGER NOT NULL DEFAULT 0,
  used_capacity_bytes INTEGER NOT NULL DEFAULT 0,
  active_operations INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_storage_nodes_status_heartbeat
  ON storage_nodes(status, last_heartbeat);

CREATE TABLE IF NOT EXISTS chunk_replicas (
  replica_id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES storage_nodes(node_id),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chunk_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_replicas_node_status
  ON chunk_replicas(node_id, status);

CREATE TABLE IF NOT EXISTS chunk_placements (
  chunk_id TEXT NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES storage_nodes(node_id),
  placement_rank INTEGER NOT NULL CHECK (placement_rank >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chunk_id, node_id),
  UNIQUE (chunk_id, placement_rank)
);

CREATE INDEX IF NOT EXISTS idx_chunk_placements_node
  ON chunk_placements(node_id);
