# Product Requirements Document (PRD) - VoidShare

## 1. Product Vision
**VoidShare** is an **Anonymous E2EE Distributed Ephemeral File Transfer Platform** designed for temporary, cross-device file sharing without user accounts, registration, or permanent identity tracking. 

A sender uploads a file through the browser, where the file is encrypted client-side using robust cryptographic primitives (AES-GCM) so that the backend and storage infrastructure strictly handle ciphertext rather than plaintext. Large files are divided into chunks and stored across multiple distributed storage nodes. A recipient retrieves the transfer from another device using a cryptographically generated File ID and Secret/Password capability, after which encrypted chunks are fetched, reconstructed, and decrypted client-side. Files are strictly ephemeral and automatically destroyed according to configured time-to-live (TTL) or download-consumption policies.

The overarching design philosophy is to provide a radically simple user experience (**"Upload → get secret → share → download → gone"**) backed by a resilient, fault-tolerant distributed storage architecture.

---

## 2. Problem Statement
Traditional file-sharing services (e.g., Google Drive, Dropbox, WeTransfer) require some combination of:
- Mandatory account registration and login.
- Permanent or long-term file retention.
- Trusting the service provider with plaintext file contents and sensitive metadata.
- Requiring users to remember to manually delete files.
- Exposing personal identities, emails, or third-party cloud credentials.

VoidShare solves a distinct problem:
> *"I need to send a file to another person, but I don't want either of us to create an account, and I don't want the service provider to be able to read the file."*

---

## 3. Target Users & Scenarios

### 3.1 One-Off File Sharing
Users who need to send a file once and have no reason to create or link an account on a cloud storage platform.

### 3.2 Sharing Between Strangers
Senders and recipients who do not wish to establish persistent identities, share email addresses, or expose account metadata.

### 3.3 Public / Shared Computers
Users transferring files across public or shared workstations (e.g., university labs, internet cafes) without logging into personal cloud accounts.

### 3.4 Privacy-Sensitive Temporary Transfers
Users transferring sensitive data that must only exist for a finite, strictly enforced duration and vanish without traces.

### 3.5 Large File Transfers
Handling large files efficiently via chunking and parallel transfers rather than monolithic payload uploads.

### 3.6 Automated Expiration
Users who want hands-off lifecycle management where files expire automatically without requiring manual cleanup.

---

## 4. Product Scope

### 4.1 In Scope
- **Anonymous No-Login Model**: Capability-based access control via File ID + Secret/Password; zero user registration.
- **End-to-End Encryption (E2EE)**: Client-side AES-GCM encryption and decryption. Plaintext and decryption keys never reach the server, database, or logs.
- **Client-Side File Chunking**: Splitting files into encrypted chunks for parallel upload/download and distributed storage.
- **Distributed Ephemeral Storage**: Distributing chunks across multiple independent storage nodes with metadata tracking chunk ordering and locations.
- **Configurable Auto-Deletion**: Support for time-based expiration (e.g., 10 mins, 1 hour, 24 hours) and consumption-based deletion ("delete after first download").
- **Fault Tolerance & Replication**: Configurable replication factor, heartbeat-based node health monitoring, and failover retrieval from healthy replicas.
- **Resumable Transfers**: Ability to resume interrupted chunk uploads without restarting from zero.
- **Local Simulation to Multi-Node Deployment**: Developing and testing multi-node distribution locally (e.g., Docker containers / separate volumes) with an architecture ready for separate physical servers.

### 4.2 Out of Scope
- Permanent cloud storage or backup hosting.
- User accounts, user profiles, or social collaboration features.
- Public file directories, search engines, or file discovery feeds.
- Server-side file conversion, media streaming transcoding, or preview generation (which would violate E2EE).
- Native desktop/mobile apps (initial scope is a web-first responsive interface).

---

## 5. Core User Workflows

### 5.1 Sender Flow
```
Sender opens VoidShare website
      │
      ▼
Selects file & configures expiration policy (TTL / Download count)
      │
      ▼
Client-side browser encrypts file (AES-GCM) & splits into encrypted chunks
      │
      ▼
Encrypted chunks are uploaded concurrently
      │
      ▼
Backend controller places chunks across storage nodes & records metadata
      │
      ▼
Sender receives retrieval package (File ID + Secret / Password / Link)
      │
      ▼
Sender securely shares retrieval package with recipient
```

### 5.2 Recipient Flow
```
Recipient opens VoidShare website & enters File ID + Secret
      │
      ▼
Backend authorizes capability & locates required encrypted chunks
      │
      ▼
Encrypted chunks are fetched from healthy storage nodes & reassembled
      │
      ▼
Ciphertext delivered to recipient browser
      │
      ▼
Client-side browser decrypts ciphertext using secret key
      │
      ▼
Recipient saves original plaintext file
```

### 5.3 Automated Deletion Flow
```
Expiration condition reached (TTL expired OR download consumed)
      │
      ▼
Transfer state set to EXPIRED / DELETING (blocking new downloads)
      │
      ▼
Deletion worker instructs all storage nodes to purge all chunk replicas
      │
      ▼
Metadata database records removed / marked DELETED
      │
      ▼
Physical storage space reclaimed
```

---

## 6. Key Principles & Philosophy
1. **Zero Knowledge**: Server infrastructure is strictly a blind coordinator of encrypted chunks.
2. **Honest Security Claims**: Never claim the server knows "nothing"; accurately state that the server knows transfer metadata (size, chunk count, expiration) but never possesses plaintext or decryption keys.
3. **No Buzzwords Without Purpose**: Every distributed systems concept (chunking, replication, heartbeats, consistent hashing, concurrency controls) exists to solve a tangible engineering problem.
4. **Preserve Existing Work**: Build incrementally upon existing frontend and backend foundations rather than rewriting working modules from scratch.
