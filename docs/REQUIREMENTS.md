# Functional & Non-Functional Requirements - VoidShare

## 1. Confirmed Functional Requirements

### 1.1 Anonymous Transfer & Access
- **FR-01 (No-Account Access)**: Users shall upload and download files without account creation, email verification, login credentials, or persistent identity tracking.
- **FR-02 (Capability-Based Retrieval)**: File access shall be controlled exclusively via possession of an unguessable, cryptographically random `File ID` and a `Secret/Password`.
- **FR-03 (Existence Privacy)**: The system shall not disclose whether a `File ID` exists or reveal file metadata to unauthenticated requests prior to validating the secret capability.

### 1.2 End-to-End Encryption (E2EE)
- **FR-04 (Client-Side Encryption)**: All files shall be encrypted in the client browser using AES-GCM before transmission over the network.
- **FR-05 (Zero Plaintext Ingestion)**: The API, backend workers, database, and storage nodes shall receive, store, and transmit only encrypted ciphertext.
- **FR-06 (Client-Side Decryption)**: File decryption shall occur strictly within the recipient's browser. Decryption keys must never be transmitted to or stored on backend infrastructure.

### 1.3 File Chunking & Resumability
- **FR-07 (Chunked Uploads)**: Large files shall be partitioned into chunks (e.g., configurable 2MB–10MB chunk sizing) on the client side.
- **FR-08 (Chunk Manifest & Ordering)**: The backend metadata service shall record chunk identifiers, ordering, byte sizes, and checksum hashes for file reassembly.
- **FR-09 (Resumable Uploads)**: In the event of a network interruption during upload, the client shall query the server for missing chunk indices and resume transmission without re-uploading completed chunks.

### 1.4 Distributed Storage & Placement
- **FR-10 (Multi-Node Distribution)**: Encrypted chunks shall be distributed across multiple independent storage nodes rather than stored on a single monolithic disk.
- **FR-11 (Data Placement Strategy)**: The backend coordinator shall implement deterministic or balanced placement (e.g., consistent hashing or round-robin capacity weighting) to distribute chunk allocations.
- **FR-12 (Storage Node Abstraction)**: Storage nodes shall expose a standardized storage interface (`put_chunk`, `get_chunk`, `delete_chunk`, `has_chunk`, `health_check`) decoupled from local filesystem paths.

### 1.5 Replication & Fault Tolerance
- **FR-13 (Configurable Replication)**: The system shall support storing multiple copies of each chunk across distinct storage nodes governed by a configurable `replication_factor` (e.g., $N=2$).
- **FR-14 (Failover Download)**: If a primary storage node hosting a chunk is unreachable, the coordinator shall seamlessly route the download request to an active replica node.
- **FR-15 (Under-Replication Recovery)**: When a storage node fails or is removed, the background recovery worker shall detect under-replicated chunks and trigger re-replication to healthy nodes.

### 1.6 Ephemeral Lifecycle & Deletion
- **FR-16 (Time-Based Auto-Deletion)**: Files shall automatically expire and be deleted once their configured TTL (e.g., 10 minutes, 1 hour, 24 hours) is reached.
- **FR-17 (Consumption-Based Auto-Deletion)**: The system shall support a "delete after first download" (or configured download count limit) policy.
- **FR-18 (Complete Replica Purge)**: When a file expires or is consumed, the deletion process must cascade across all storage nodes holding chunk replicas and delete metadata records.

---

## 2. Confirmed Non-Functional Requirements

### 2.1 Security & Privacy
- **NFR-01 (Decryption Key Isolation)**: Decryption keys or derived secrets shall never appear in API query parameters, database records, server logs, or telemetry payloads.
- **NFR-02 (Opaque Identifiers)**: File IDs shall be generated using cryptographically secure pseudorandom generators (CSPRNG) with sufficient entropy (e.g., 128+ bits / UUIDv4 / nanoid) to prevent enumeration attacks.
- **NFR-03 (Strict Data Minimization)**: Server logging shall record operational identifiers (`transfer_id`, `chunk_id`, `node_id`, `operation_type`, `error_code`) and strictly omit file payloads, plaintexts, or user secrets.

### 2.2 Concurrency & State Integrity
- **NFR-04 (Race Condition Prevention)**: The system must enforce concurrency controls (atomic database state transitions and distributed locking/fencing) to resolve races between concurrent downloads, expiration worker runs, and replication jobs.
- **NFR-05 (Download Completion Verification)**: Deletion under a "delete after download" policy shall only trigger after successful and complete receipt of all chunks by the client, not on initial request dispatch.

### 2.3 Reliability & Availability
- **NFR-06 (Node Health Monitoring)**: Storage nodes shall issue periodic heartbeats to the coordinator. Nodes failing to heartbeat within a designated threshold shall be flagged as `UNHEALTHY` / `UNAVAILABLE`.
- **NFR-07 (Graceful Degradation)**: Temporary unavailability of a non-replicated node or network hiccup shall return explicit, typed error messages (`NODE_UNAVAILABLE`, `CHUNK_MISSING`) rather than unhandled system panics.

### 2.4 Scalability & Performance
- **NFR-08 (Independent Scaling)**: API controllers, metadata databases, and storage nodes shall be architecturally decoupled to permit horizontal scaling.
- **NFR-09 (Parallel Chunk Transfer)**: The client and API layers shall support concurrent upload and download streams for multiple chunks.

---

## 3. Constraints & Operational Modes
- **CON-01 (Development Environment Simulation)**: During local development, multiple storage nodes shall be simulated using Docker containers with mounted volumes or distinct directory paths on a single host.
- **CON-02 (Production Extensibility)**: The storage abstraction layer must permit migration from simulated local nodes to independent physical servers, VPS disks, or object storage without rewriting core business logic.
- **CON-03 (Preservation of Existing Work)**: Existing frontend UI and backend endpoints must be inspected and integrated incrementally rather than replaced.

---

## 4. Technical Considerations & Open Decisions

| Topic | Status | Description / Options |
| :--- | :--- | :--- |
| **Chunk Size Standard** | `[PROPOSED]` | Default to 4MB or 8MB per chunk to balance browser memory usage with HTTP transfer overhead. |
| **Replication Default** | `[PROPOSED]` | Default `replication_factor = 2` for development and production clusters. |
| **Placement Algorithm** | `[PROPOSED]` | Consistent hashing ring with virtual nodes vs. capacity-weighted round robin. |
| **Database Selection** | `[DECISION REQUIRED]` | Relational (PostgreSQL / SQLite) vs. Document/K-V store for metadata and state locking. |
