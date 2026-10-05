# Architectural & Design Decision Records (ADRs) - VoidShare

This document records the foundational architectural and technical decisions established for VoidShare.

---

## ADR-001: Anonymous E2EE Architecture with Client-Side AES-GCM

- **Status**: `Approved`
- **Context**: The platform requires confidential file transfer without user identity tracking or allowing the server access to plaintext files.
- **Decision**: All encryption and decryption operations will occur exclusively within the client browser using the Web Crypto API standard `AES-256-GCM`. Decryption keys are generated client-side and never transmitted to or stored on server infrastructure.
- **Consequences**: Server and storage nodes strictly process encrypted binary blobs. Server compromises cannot expose plaintext file contents.

---

## ADR-002: Capability-Based Access Control via Cryptographic File ID + Secret

- **Status**: `Approved`
- **Context**: The system rejects persistent user accounts and passwords while requiring secure access restriction for transfers.
- **Decision**: Implement capability-based security where possession of a cryptographically unguessable File ID and Secret grants the capability to retrieve the file. The secret is encoded into the URL hash fragment (`#secret`), ensuring it is not sent in HTTP headers.
- **Consequences**: No user registration or session management is needed. Unauthorized queries are returned generic `404 Not Found` without disclosing file existence.

---

## ADR-003: Chunked Distributed Storage with Modular Storage Node Abstraction

- **Status**: `Approved`
- **Context**: Storing large files as monolithic objects on a single server disk prevents scalability, limits parallelism, and fails to demonstrate distributed systems concepts.
- **Decision**: Files are split into encrypted chunks (default 4MB) and distributed across multiple storage nodes. Storage nodes adhere to an abstract interface (`put_chunk`, `get_chunk`, `delete_chunk`, `has_chunk`, `health_check`) decoupled from filesystem specifics.
- **Consequences**: Enables parallel chunk transfers, resumable uploads, multi-node load distribution, and easy future migration to VPS disks or object storage.

---

## ADR-004: Ephemeral Lifecycle with Multi-Condition Auto-Deletion

- **Status**: `Approved`
- **Context**: VoidShare is an ephemeral transfer platform, not a permanent cloud storage provider. Storage must be continuously reclaimed.
- **Decision**: Support dual auto-deletion triggers: Time-to-Live (TTL) expiration (e.g. 1 hour, 24 hours) and consumption policy ("delete after first download"). An asynchronous expiration worker orchestrates the deletion of all chunk replicas across storage nodes and removes metadata.
- **Consequences**: Storage capacity scales with concurrent traffic rather than cumulative history. Concurrency locks are required to avoid deleting files during active downloads.

---

## ADR-005: Local Multi-Node Simulation via Docker Containers and Separate Volumes

- **Status**: `Approved`
- **Context**: Distributed concepts (placement, replication, heartbeats, node failures) need to be developed and verified locally without requiring multiple physical machines immediately.
- **Decision**: Local development will simulate independent storage nodes using separate Docker containers or dedicated storage volume directories, while executing genuine distributed network protocols.
- **Consequences**: Provides realistic distributed failure domains and network simulation on a single host machine, perfectly portable to multi-server production environments later.

---

## ADR-006: Heartbeat-Driven Failure Detection and Replica Failover

- **Status**: `Approved`
- **Context**: In a distributed multi-node topology, storage nodes may crash or become unreachable.
- **Decision**: Storage nodes send periodic heartbeats (10s interval) to the Node Manager. If a node fails, it is marked `UNAVAILABLE`, read requests automatically failover to secondary chunk replicas, and an asynchronous recovery worker initiates re-replication.
- **Consequences**: Demonstrates fault tolerance, self-healing redundancy, and high availability without downtime.

---

## ADR-007: Preservation and Incremental Integration of Existing Codebase

- **Status**: `Approved`
- **Context**: The existing repository contains functional frontend and backend work.
- **Decision**: Inspect and preserve existing functional code, incrementally integrating distributed components around working modules rather than performing a disruptive rewrite.
- **Consequences**: Minimizes regression risk and accelerates time to functional distributed integration.

---

## ADR-008: TypeScript Monorepo and Capability-Safe Ephemeral Transfer Contracts

- **Status**: `Approved`
- **Context**: The implementation is being built from the documentation-only repository in deliberate phases. The system needs a single language, a runnable local multi-node topology, client-only encryption, and explicit capability handling without exposing secrets.
- **Decision**: Use TypeScript everywhere in an npm-workspaces monorepo containing `packages/api`, `packages/storage-node`, `packages/web`, and `packages/shared`. Use Fastify for the API and storage nodes, Vite + React for the web client, SQLite through `better-sqlite3` for metadata, and Vitest for tests. The API listens on port 8080, storage nodes use ports 9001–9003, and the web client uses port 5173. Development runs three storage-node processes through `concurrently`. Files are capped at 200 MB, TTL choices are 10 minutes, 1 hour, or 24 hours, chunks default to 4 MB, and replication is N=2 across three nodes.
- **Consequences**: The first five phases produce a complete single-node E2EE transfer product. Later phases add placement, replication, failover, health monitoring, recovery, concurrency control, cleanup, and hardening without changing the language or database stack.

### Security and lifecycle rules

- The URL secret is 32 random bytes. HKDF-SHA256 derives `encKey` with info `voidshare-enc` and `authToken` with info `voidshare-auth`. The server never receives `encKey`.
- The server stores `sha256(authToken)`, never the raw auth token. Every encrypted chunk uses AAD consisting of `fileId`, `chunkIndex` as u32, and `totalChunks` as u32.
- Ciphertext chunks use a 12-byte IV and a 16-byte GCM tag, adding 28 bytes per chunk. The client initializes the transfer before encrypting because `fileId` is part of the AAD.
- `download_lease_until` protects active downloads. An expired `DOWNLOADING` lease is eligible to become `READY` again. Sweeping also collects expired downloads, stale `CREATING`/`UPLOADING` rows older than 30 minutes, and rows stuck in `DELETING`.
- Capability validation occurs before lifecycle-state errors: unknown IDs and invalid capabilities return generic `404`; a valid capability for a consumed or expired transfer returns `410`.

### Session capabilities

- Transfer initialization creates a separate high-entropy upload-session token. Only its hash is persisted. Upload, resumable-status, and finalize requests require the raw token.
- Successful access atomically acquires the 60-second download lease, creates a high-entropy opaque download token, and persists only its hash and expiry. Chunk reads and completion require that token. Completion, deletion, or lease replacement invalidates it.
- Resumable uploads are exposed through `GET /api/transfers/:fileId/status`, which returns acknowledged chunk indices after upload-session authorization.

### Implementation governance

- Phase N must pass its verification and required failure demonstration before Phase N+1 begins.
- Each listed phase commit is made in order, each phase ends with a tag (`phase-N`, with Phase 13 also tagged `v1.0.0`), and the user is prompted before continuing to the next phase.
