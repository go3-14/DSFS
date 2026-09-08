# Technical Requirements Document (TRD) - VoidShare

## 1. Cryptographic Specifications

### 1.1 Cryptographic Primitives
- **Algorithm**: AES-GCM (Galois/Counter Mode) with 256-bit key length (`AES-256-GCM`).
- **Implementation**: Browser native `window.crypto.subtle` (Web Crypto API) for hardware-accelerated encryption and decryption.
- **Initialization Vector (IV)**: 96-bit (12 bytes) cryptographically random IV generated via `crypto.getRandomValues()` for each chunk or encrypted payload. IVs are prepended or packaged alongside ciphertext chunks.
- **Authentication Tag**: 128-bit authentication tag generated automatically by AES-GCM for ciphertext integrity verification.

### 1.2 Capability & Secret Handling
- **File ID**: 128-bit random token (e.g. UUIDv4 or Nanoid with custom alphanumeric alphabet) generated securely on client/server.
- **Secret / Decryption Key**: 256-bit key generated entirely on the sender's client.
- **URL Sharing Format**: `https://voidshare.app/#/download/<fileId>#<secretKey>`
  - *Design Note*: The decryption secret is stored in the URL hash fragment (`#<secretKey>`) which browsers **never transmit** to the server in HTTP request headers.
- **Zero-Knowledge Capability Token**: If the server needs to verify password authorization before dispatching chunks, the client derives a verification token via `HMAC-SHA256(secretKey, fileId)` or a salted Argon2/PBKDF2 hash, ensuring the raw decryption key remains completely hidden from the server.

---

## 2. Chunking & Streaming Protocols

### 2.1 Chunking Parameters
- **Default Chunk Size**: 4 MB (Configurable between 1 MB and 10 MB based on network characteristics).
- **Chunk Slicing**: Executed via JavaScript `File.prototype.slice()`.
- **Integrity Checksum**: Each chunk calculates a SHA-256 hash of its ciphertext. The hash is validated by the storage node upon upload and by the recipient client before decryption.

### 2.2 Resumable Transfer Protocol
- **Upload Manifest Request**: Senders query `GET /api/transfers/:fileId/status` to receive an array of acknowledged chunk indices.
- **Differential Upload**: The client dispatches only unacknowledged chunk indices.
- **Concurrency Limit**: Browser chunk uploads/downloads throttled to a default concurrency limit (e.g., 3–4 parallel chunk streams) to prevent browser thread congestion.

---

## 3. Storage Node Abstraction Contract

Storage nodes implement a standard decoupled interface to ensure backend independence:

```typescript
interface IStorageNode {
  // Store an encrypted chunk payload
  putChunk(chunkId: string, stream: ReadableStream, sizeBytes: number): Promise<ChunkWriteResult>;
  
  // Retrieve an encrypted chunk stream
  getChunk(chunkId: string): Promise<ReadableStream>;
  
  // Purge a chunk from physical storage
  deleteChunk(chunkId: string): Promise<boolean>;
  
  // Verify chunk presence and byte integrity
  hasChunk(chunkId: string): Promise<boolean>;
  
  // Return storage node health, disk space, and active loads
  healthCheck(): Promise<NodeHealthReport>;
}

interface NodeHealthReport {
  nodeId: string;
  status: 'HEALTHY' | 'UNHEALTHY' | 'UNAVAILABLE' | 'RECOVERING';
  totalSpaceBytes: number;
  availableSpaceBytes: number;
  activeOperations: number;
  uptimeSeconds: number;
}
```

---

## 4. Heartbeat & Failure Detection Protocol

### 4.1 Node Heartbeat Cycle
- **Heartbeat Interval**: Storage nodes send a heartbeat HTTP POST / WebSocket ping to the Node Manager every **10 seconds**.
- **Heartbeat Payload**: Includes `nodeId`, `timestamp`, `availableSpaceBytes`, `activeOperationsCount`.
- **Timeout & Transitions**:
  - **Missed 2 heartbeats (20s)**: Node marked `UNHEALTHY` (Scheduler halts assigning new upload chunks to this node).
  - **Missed 5 heartbeats (50s)**: Node marked `UNAVAILABLE` (Failover routes all reads to secondary replicas; Recovery worker evaluates chunk re-replication).
  - **Reconnected Node**: Node enters `RECOVERING` state to audit its chunk catalog against metadata records before returning to `HEALTHY`.

---

## 5. Concurrency Control & State Machine

### 5.1 Critical State Transitions
```
                ┌───────────┐
                │ CREATING  │
                └─────┬─────┘
                      │ (All chunks uploaded)
                      ▼
                ┌───────────┐
       ┌───────►│   READY   │◄────────┐
       │        └─────┬─────┘         │ (Download error / aborted)
       │              │ (Download started)
       │              ▼
       │        ┌───────────┐         │
       └────────┤DOWNLOADING├─────────┘
                └─────┬─────┘
                      │ (Download complete & policy == DELETE_AFTER_DOWNLOAD)
                      ▼
                ┌───────────┐
  (TTL Expired) │ CONSUMED  │
       ────────►└─────┬─────┘
                      │
                      ▼
                ┌───────────┐
                │ DELETING  │
                └─────┬─────┘
                      │ (All replicas purged)
                      ▼
                ┌───────────┐
                │  DELETED  │
                └───────────┘
```

### 5.2 Concurrency Scenarios & Mitigations
1. **Simultaneous Download and Expiration**:
   - When the Expiration Worker targets a transfer, it attempts an atomic CAS transition `READY → DELETING`.
   - If the state is currently `DOWNLOADING`, the Expiration Worker sets a pending expiration flag and waits for active chunk streams to finish (or applies a grace timeout of 60s) before transitioning to `DELETING`.
2. **Two Simultaneous Downloads on "Delete-After-Download"**:
   - Atomic database increment on `active_downloads`.
   - The first download that completes and verifies all chunks successfully triggers the transition to `CONSUMED`. Subsequent requests receive `410 Gone / Transfer Expired`.
3. **Replication during Deletion**:
   - If a file is marked `DELETING`, any ongoing replication jobs for its chunks abort immediately.

---

## 6. Observability, Telemetry & Logging Rules

### 6.1 Strict Logging Privacy Guardrails
- **NEVER LOG**:
  - Raw decryption keys, passwords, or secret fragments.
  - Plaintext file contents, decrypted byte buffers.
  - Plaintext file names if client specifies privacy mode.
- **PERMITTED LOGGING**:
  - `transferId`, `chunkId`, `chunkIndex`, `nodeId`
  - Operation type (`CHUNK_UPLOAD`, `CHUNK_DOWNLOAD`, `REPLICATION_START`, `EXPIRATION_PURGE`)
  - Latency, chunk size (bytes), error categories (`NODE_UNAVAILABLE`, `INTEGRITY_MISMATCH`)

### 6.2 Error Classification Matrix

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `INVALID_TRANSFER` | 404 | File ID does not exist or was deleted |
| `UNAUTHORIZED_ACCESS` | 401 / 403 | Invalid secret capability or token |
| `TRANSFER_EXPIRED` | 410 | Transfer reached TTL or download limit |
| `CHUNK_NOT_FOUND` | 404 | Chunk missing from specified storage node |
| `NODE_UNAVAILABLE` | 503 | Target storage node unreachable (triggers replica failover) |
| `INTEGRITY_ERROR` | 422 | SHA-256 or AES-GCM auth tag verification mismatch |
| `UPLOAD_ABORTED` | 400 | Incomplete upload session timed out |
