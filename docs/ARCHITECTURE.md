# System Architecture - VoidShare

## 1. Five-Layer System Architecture

The VoidShare architecture is structured across five core layers:

```mermaid
graph TD
    L1[1. User Experience Layer<br>• Anonymous Upload/Download UI • Expiration Controls • Progress State]
    L2[2. Client Security Layer<br>• AES-GCM 256-bit Encryption • Key & Nonce Generation • Decryption Engine]
    L3[3. Transfer Coordination Layer<br>• File Chunking • Manifests • Resumability • Capability Authorization]
    L4[4. Distributed Systems Layer<br>• Node Registry • Data Placement • Replication • Heartbeats • Failure Recovery]
    L5[5. Ephemeral Lifecycle Layer<br>• Expiration Worker • Consumption Triggers • Multi-Node Chunk Purge]

    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5
```

---

## 2. High-Level Component Topology

```
                   ┌────────────────────────────────────────┐
                   │             Browser Client             │
                   │  - File Selection    - AES-GCM Enc/Dec │
                   │  - Secret Handling   - Chunk Slicing   │
                   └───────────────────┬────────────────────┘
                                       │ HTTPS / REST API
                                       ▼
                   ┌────────────────────────────────────────┐
                   │             API Controller             │
                   │  - Transfer Lifecycle Management       │
                   │  - Capability-based Authorization      │
                   │  - Upload/Download Stream Orchestrator │
                   └─────────┬──────────────┬───────────────┘
                             │              │
        ┌────────────────────┴───┐      ┌───┴────────────────────┐
        ▼                        ▼      ▼                        ▼
┌───────────────┐      ┌────────────────────┐      ┌───────────────────┐
│  Metadata DB  │      │ Storage Node Mgr   │      │ Background        │
│  (State, TTL, │      │ - Heartbeat Monitor│      │ Workers           │
│   Manifests)  │      │ - Placement Engine │      │ - Expiration Sweeper
└───────────────┘      │ - Health State     │      │ - Recovery Worker │
                       └─────────┬──────────┘      └───────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Storage Node 1   │    │ Storage Node 2   │    │ Storage Node 3   │
│ - Chunk Storage  │    │ - Chunk Storage  │    │ - Chunk Storage  │
│ - Node Health API│    │ - Node Health API│    │ - Node Health API│
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

---

## 3. Subsystem Breakdown & Responsibilities

### 3.1 Client (Browser)
- **Zero-Knowledge Crypto**: Generates ephemeral symmetric encryption keys (AES-GCM 256-bit) and initialization vectors (IVs).
- **Chunk Partitioning**: Slices plaintext files into uniform byte chunks, encrypts them, and computes integrity checksums.
- **Secret Management**: Encodes retrieval secret/password into capability tokens or shareable URLs (anchor hash fragments `#secret` to avoid transmitting secrets in HTTP headers to server).
- **Decryption & Reconstruction**: Fetches encrypted chunks in sequence, verifies checksums, decrypts into local memory/Blob, and triggers client file download.

### 3.2 API / Controller
- **Capability Verification**: Validates whether the supplied File ID and capability token match active database records without leaking file existence to unauthorized requests.
- **Transfer Orchestration**: Manages upload sessions, returns upload manifests, assigns storage nodes for chunks, and routes download stream requests.
- **Decoupled Architecture**: Strictly forwards ciphertext streams; never participates in plaintext processing.

### 3.3 Metadata Database
- **Small-Footprint Coordination**: Stores only file records, chunk ordering, replica node mappings, TTL timestamps, and download counters.
- **Zero Key Storage**: Plaintext file contents and client decryption keys are **strictly forbidden** from database persistence.

### 3.4 Storage Node Manager & Background Workers
- **Heartbeat & Health Monitor**: Collects periodic heartbeats from registered storage nodes; tracks states: `HEALTHY`, `UNHEALTHY`, `UNAVAILABLE`, `RECOVERING`.
- **Placement Engine**: Determines primary and replica node allocations for each chunk (via consistent hashing or capacity weighting).
- **Expiration Worker**: Scans for transfers past their TTL or download threshold, sets status to `DELETING`, and dispatches bulk delete RPCs to storage nodes.
- **Recovery Worker**: Scans for chunks whose replica count falls below the configured replication threshold due to node failures and dispatches re-replication jobs.

### 3.5 Storage Nodes
- **Pluggable Interface**: Exposes a clean, modular storage interface decoupled from underlying storage media:
  - `put_chunk(chunk_id, data_stream)`
  - `get_chunk(chunk_id) -> stream`
  - `delete_chunk(chunk_id)`
  - `has_chunk(chunk_id) -> bool`
  - `health_check() -> status`
- **Isolation**: Each node operates independently, managing its dedicated volume or directory space.

---

## 4. End-to-End Data Flows

### 4.1 Upload & Placement Flow
```mermaid
sequenceDiagram
    autonumber
    actor Sender as Sender Browser
    participant API as API Controller
    participant Meta as Metadata DB
    participant NodeMgr as Storage Node Mgr
    participant S1 as Storage Node 1 (Primary)
    participant S2 as Storage Node 2 (Replica)

    Sender->>Sender: Generate AES-GCM Key & slice file into Chunks
    Sender->>Sender: Encrypt Chunks
    Sender->>API: POST /api/transfers (init transfer, chunk count, policy)
    API->>Meta: Create Transfer record (status: CREATING)
    API->>NodeMgr: Request placement for N chunks (rep_factor=2)
    NodeMgr-->>API: Chunk placement plan (e.g., Chunk 1 -> S1, S2)
    API-->>Sender: Return Transfer ID + Chunk Upload Instructions
    
    loop For Each Chunk
        Sender->>API: PUT Chunk 1 (Ciphertext)
        API->>S1: put_chunk(Chunk 1)
        API->>S2: put_chunk(Chunk 1) [Replication]
        API->>Meta: Record chunk status uploaded
    end

    Sender->>API: POST /api/transfers/{id}/finalize
    API->>Meta: Set status = READY
    API-->>Sender: Transfer Ready Confirmation
    Sender->>Sender: Present File ID + Secret link to user
```

### 4.2 Retrieval & Failover Flow
```mermaid
sequenceDiagram
    autonumber
    actor Recipient as Recipient Browser
    participant API as API Controller
    participant Meta as Metadata DB
    participant NodeMgr as Storage Node Mgr
    participant S1 as Storage Node 1 (Unhealthy)
    participant S2 as Storage Node 2 (Healthy Replica)

    Recipient->>API: POST /api/transfers/{id}/access (Secret Token)
    API->>Meta: Validate capability & check status == READY
    API->>Meta: Increment active download counter
    API->>Meta: Fetch chunk replica locations
    API-->>Recipient: Return Chunk Manifest & Download Authorization

    loop For Each Chunk
        Recipient->>API: GET Chunk 1
        API->>NodeMgr: Check S1 health
        Note over API,S1: S1 Unhealthy / Timeout!
        API->>S2: Failover: get_chunk(Chunk 1)
        S2-->>API: Ciphertext Stream
        API-->>Recipient: Stream Ciphertext Chunk 1
        Recipient->>Recipient: Verify chunk checksum
    end

    Recipient->>Recipient: Reassemble & Decrypt with Secret Key -> Original File
    Recipient->>API: POST /api/transfers/{id}/complete
    API->>Meta: Record successful download & evaluate deletion policy
```

---

## 5. Distributed Systems Concepts in VoidShare

| Concept | Problem Solved | Mechanism in VoidShare |
| :--- | :--- | :--- |
| **Data Partitioning (Chunking)** | Large files cannot be uploaded or held in memory as one monolithic block. | Client divides encrypted payload into uniform chunks. |
| **Distributed Placement** | Avoid bottlenecking a single disk and distribute storage across nodes. | Node Manager places chunks across nodes using placement logic (e.g. Consistent Hashing ring). |
| **Replication** | Prevent data loss when individual storage nodes crash or disconnect. | Configurable `replication_factor = N`; chunks stored on primary and replica nodes. |
| **Failure Detection** | Identify offline nodes to stop assigning new work and enable failover. | Storage nodes send periodic heartbeats to Node Manager; timeout flags node unhealthy. |
| **Fault Tolerance & Recovery** | Maintain availability and restore redundancy after node outages. | Coordinator redirects downloads to replica nodes; background recovery worker re-replicates under-replicated chunks. |
| **Concurrency Control** | Prevent race conditions (e.g., simultaneous download and expiration deletion). | Atomic database state transitions (`READY` → `DOWNLOADING` → `CONSUMED` → `DELETING`) and optimistic/pessimistic locking. |
| **Distributed Cleanup** | Reclaim storage and ensure ephemeral guarantees across all replicas. | Expiration worker broadcasts delete RPCs to all replica nodes upon TTL expiry or consumption. |

---

## 6. Local Simulation vs Production Deployment

```
[ Local Development Simulation ]
Host Machine (Localhost)
├── API Server (Port 8080)
├── Metadata DB (SQLite / PostgreSQL)
├── Storage Node 1 (Docker Container / Volume A / Port 9001)
├── Storage Node 2 (Docker Container / Volume B / Port 9002)
└── Storage Node 3 (Docker Container / Volume C / Port 9003)

[ Production Multi-Node Topology ]
                 Internet
                    │
            [ Load Balancer ]
             │             │
      ┌──────▼──────┐ ┌────▼────────┐
      │ API Node 1  │ │ API Node 2  │
      └──────┬──────┘ └────┬────────┘
             │             │
       [ Metadata Cluster / DB ]
             │
      ┌──────┴──────────────────────┐
      ▼                             ▼
[ VPS / Node 1 ]             [ VPS / Node 2 ]             [ VPS / Node 3 ]
(Dedicated Disk)             (Dedicated Disk)             (Dedicated Disk)
```
