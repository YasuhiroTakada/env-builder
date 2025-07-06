export interface AuditLog {
  id: string;
  timestamp: Date;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'BATCH';
  tableName: 'properties';
  recordId: string;
  propertyKey: string;
  environment: string;
  component: string;
  oldValue?: string;
  newValue?: string;
  oldDescription?: string;
  newDescription?: string;
  changeDetails: string;
  userId?: string;
  sessionId: string;
}

export interface AuditLogEntry extends AuditLog {
  canRestore: boolean;
}

export interface RestorePoint {
  timestamp: Date;
  recordId: string;
  propertyKey: string;
  environment: string;
  component: string;
  value: string;
  description?: string;
  lastModified: Date;
}