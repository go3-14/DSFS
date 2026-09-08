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
