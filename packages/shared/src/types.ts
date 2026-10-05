export type TransferStatus =
  | 'CREATING'
  | 'UPLOADING'
  | 'READY'
  | 'DOWNLOADING'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'DELETING'
  | 'DELETED'
  | 'FAILED';

export type ReplicaStatus =
  | 'ACTIVE'
  | 'ORPHANED'
  | 'ORPHANED_PENDING_DELETE'
  | 'PURGED';

export type NodeStatus =
  | 'HEALTHY'
  | 'UNHEALTHY'
  | 'UNAVAILABLE'
  | 'RECOVERING';

export type ErrorCode =
  | 'INVALID_TRANSFER'
  | 'UNAUTHORIZED_ACCESS'
  | 'TRANSFER_EXPIRED'
  | 'CHUNK_NOT_FOUND'
  | 'NODE_UNAVAILABLE'
  | 'INTEGRITY_ERROR'
  | 'UPLOAD_ABORTED'
  | 'VALIDATION_ERROR';

export interface Transfer {
  fileId: string;
  capabilityHash: string;
  uploadSessionHash: string;
  downloadTokenHash: string | null;
  downloadTokenExpiresAt: string | null;
  originalNameEncrypted: string | null;
  totalSizeBytes: number;
  chunkCount: number;
  chunkSizeBytes: number;
  status: TransferStatus;
  downloadCount: number;
  maxDownloads: number;
  createdAt: string;
  expiresAt: string;
  downloadLeaseUntil: string | null;
  version: number;
}

export interface Chunk {
  chunkId: string;
  fileId: string;
  chunkIndex: number;
  sizeBytes: number;
  checksumSha256: string;
  status: 'PENDING' | 'STORED' | 'DELETED';
}

export interface ChunkReplica {
  replicaId: string;
  chunkId: string;
  nodeId: string;
  status: ReplicaStatus;
  createdAt: string;
}

export interface StorageNode {
  nodeId: string;
  endpointUrl: string;
  status: NodeStatus;
  totalCapacityBytes: number;
  usedCapacityBytes: number;
  activeOperations: number;
  lastHeartbeat: string;
}
