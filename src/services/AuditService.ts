import { AuditLog, RestorePoint } from '../models/AuditLog';
import { Property } from '../models/Property';

export class AuditService {
  private static sessionId = this.generateSessionId();

  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private static generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Create an audit log entry for property creation
   */
  static createAuditLog(
    action: AuditLog['action'],
    property: Property,
    oldProperty?: Property,
    changeDetails?: string
  ): AuditLog {
    const auditLog: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      action,
      tableName: 'properties',
      recordId: property.id,
      propertyKey: property.key,
      environment: property.environment,
      component: property.component,
      changeDetails: changeDetails || this.generateChangeDetails(action, property, oldProperty),
      sessionId: this.sessionId
    };

    // Add old/new values for updates
    if (action === 'UPDATE' && oldProperty) {
      auditLog.oldValue = oldProperty.value;
      auditLog.newValue = property.value;
      auditLog.oldDescription = oldProperty.description;
      auditLog.newDescription = property.description;
    } else if (action === 'CREATE') {
      auditLog.newValue = property.value;
      auditLog.newDescription = property.description;
    } else if (action === 'DELETE') {
      auditLog.oldValue = property.value;
      auditLog.oldDescription = property.description;
    }

    return auditLog;
  }

  /**
   * Generate change details description
   */
  private static generateChangeDetails(
    action: AuditLog['action'],
    property: Property,
    oldProperty?: Property
  ): string {
    const envKey = `${property.environment}.${property.key}`;
    
    switch (action) {
      case 'CREATE':
        return `Created property '${envKey}' in ${property.component} with value: '${property.value}'`;
      
      case 'UPDATE':
        if (!oldProperty) return `Updated property '${envKey}'`;
        
        const changes: string[] = [];
        if (oldProperty.value !== property.value) {
          changes.push(`value: '${oldProperty.value}' → '${property.value}'`);
        }
        if (oldProperty.description !== property.description) {
          changes.push(`description: '${oldProperty.description || '(empty)'}' → '${property.description || '(empty)'}'`);
        }
        if (oldProperty.component !== property.component) {
          changes.push(`component: '${oldProperty.component}' → '${property.component}'`);
        }
        
        return `Updated property '${envKey}': ${changes.join(', ')}`;
      
      case 'DELETE':
        return `Deleted property '${envKey}' from ${property.component} (was: '${property.value}')`;
      
      case 'RESTORE':
        return `Restored property '${envKey}' to previous state`;
      
      default:
        return `${action} operation on property '${envKey}'`;
    }
  }

  /**
   * Create audit logs for batch operations
   */
  static createBatchAuditLogs(
    properties: Property[],
    oldProperties: Property[] = [],
    action: AuditLog['action'] = 'UPDATE'
  ): AuditLog[] {
    const auditLogs: AuditLog[] = [];

    properties.forEach(property => {
      const oldProperty = oldProperties.find(p => p.id === property.id);
      
      // Determine the actual action for this property
      let actualAction = action;
      if (!oldProperty && action === 'UPDATE') {
        actualAction = 'CREATE';
      }

      auditLogs.push(this.createAuditLog(actualAction, property, oldProperty));
    });

    return auditLogs;
  }

  /**
   * Create a single audit log entry for batch operations
   */
  static createBatchOperationAuditLog(
    changes: Property[],
    deletions: Property[],
    customComment?: string,
    originalProperties?: Property[]
  ): AuditLog {
    const totalOperations = changes.length + deletions.length;
    const operationCounts = [];
    
    if (changes.length > 0) {
      operationCounts.push(`${changes.length} properties updated/added`);
    }
    if (deletions.length > 0) {
      operationCounts.push(`${deletions.length} properties deleted`);
    }
    
    const defaultComment = `Batch operation: ${operationCounts.join(', ')}`;
    
    // Create detailed batch operation data
    const batchData = {
      changes: changes.map(change => ({
        property: change,
        originalProperty: originalProperties?.find(p => p.id === change.id)
      })),
      deletions: deletions
    };

    const auditLog: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      action: 'BATCH',
      tableName: 'properties',
      recordId: `batch_${Date.now()}`,
      propertyKey: `batch_operation_${totalOperations}_properties`,
      environment: 'multiple',
      component: 'multiple',
      changeDetails: customComment || defaultComment,
      sessionId: this.sessionId,
      // Store batch operation details in newValue as JSON
      newValue: JSON.stringify(batchData),
      oldValue: `${totalOperations} operations`
    };

    return auditLog;
  }

  /**
   * Create restore point from current property state
   */
  static createRestorePoint(property: Property): RestorePoint {
    return {
      timestamp: new Date(),
      recordId: property.id,
      propertyKey: property.key,
      environment: property.environment,
      component: property.component,
      value: property.value,
      description: property.description,
      lastModified: property.lastModified
    };
  }

  /**
   * Convert restore point back to property
   */
  static restorePointToProperty(restorePoint: RestorePoint): Property {
    return {
      id: restorePoint.recordId,
      key: restorePoint.propertyKey,
      environment: restorePoint.environment,
      component: restorePoint.component,
      value: restorePoint.value,
      description: restorePoint.description,
      lastModified: new Date() // Update to current time for the restore
    };
  }

  /**
   * Get session ID for current session
   */
  static getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Generate new session (useful for new application loads)
   */
  static newSession(): string {
    this.sessionId = this.generateSessionId();
    return this.sessionId;
  }
}