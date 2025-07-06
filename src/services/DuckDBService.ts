import * as duckdb from '@duckdb/duckdb-wasm';
import { Property } from '../models/Property';
import { AuditLog } from '../models/AuditLog';

export class DuckDBService {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;

  async initialize() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: 'text/javascript',
      })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    this.conn = await this.db.connect();

    await this.createTables();
  }

  private async createTables() {
    if (!this.conn) throw new Error('Database not initialized');
    
    // Create properties table
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id VARCHAR PRIMARY KEY,
        environment VARCHAR NOT NULL,
        key VARCHAR NOT NULL,
        value TEXT,
        description TEXT,
        component VARCHAR,
        last_modified TIMESTAMP,
        environment_order INTEGER,
        file_order INTEGER,
        line_order INTEGER
      )
    `);

    // Create audit_logs table
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        action VARCHAR NOT NULL,
        table_name VARCHAR NOT NULL,
        record_id VARCHAR NOT NULL,
        property_key VARCHAR NOT NULL,
        environment VARCHAR NOT NULL,
        component VARCHAR NOT NULL,
        old_value TEXT,
        new_value TEXT,
        old_description TEXT,
        new_description TEXT,
        change_details TEXT NOT NULL,
        user_id VARCHAR,
        session_id VARCHAR NOT NULL
      )
    `);
    
    // Check if properties table is empty
    const result = await this.conn.query('SELECT COUNT(*) as count FROM properties');
    const count = result.toArray()[0].count;
    
    if (count === 0) {
      console.log('Database is empty, will load initial data');
    } else {
      console.log(`Database contains ${count} properties`);
    }
  }
  
  async checkIfEmpty(): Promise<boolean> {
    if (!this.conn) throw new Error('Database not initialized');
    
    const result = await this.conn.query('SELECT COUNT(*) as count FROM properties');
    const count = result.toArray()[0].count;
    return count === 0;
  }

  async insertProperties(properties: Property[]) {
    if (!this.conn) throw new Error('Database not initialized');
    
    await this.conn.query('DELETE FROM properties');
    
    const stmt = await this.conn.prepare(`
      INSERT INTO properties (id, environment, key, value, description, component, last_modified, environment_order, file_order, line_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const prop of properties) {
      await stmt.query(
        prop.id,
        prop.environment,
        prop.key,
        prop.value,
        prop.description || null,
        prop.component || 'env',
        prop.lastModified || new Date(),
        prop.environmentOrder || null,
        prop.fileOrder || null,
        prop.lineOrder || null
      );
    }
    
    await stmt.close();
  }

  async exportToParquet(): Promise<Uint8Array> {
    if (!this.conn) throw new Error('Database not initialized');
    
    // Create combined export with both properties and audit logs
    await this.conn.query(`
      CREATE TEMPORARY TABLE temp_combined_export AS 
      SELECT 
        'properties' as table_type,
        id,
        environment,
        key,
        value,
        description,
        component,
        strftime('%Y-%m-%d %H:%M:%S', last_modified) as last_modified,
        environment_order,
        file_order,
        line_order,
        NULL as timestamp,
        NULL as action,
        NULL as record_id,
        NULL as property_key,
        NULL as old_value,
        NULL as new_value,
        NULL as old_description,
        NULL as new_description,
        NULL as change_details,
        NULL as user_id,
        NULL as session_id
      FROM properties
      
      UNION ALL
      
      SELECT 
        'audit_logs' as table_type,
        id,
        environment,
        property_key as key,
        new_value as value,
        new_description as description,
        component,
        NULL as last_modified,
        NULL as environment_order,
        NULL as file_order,
        NULL as line_order,
        strftime('%Y-%m-%d %H:%M:%S', timestamp) as timestamp,
        action,
        record_id,
        property_key,
        old_value,
        new_value,
        old_description,
        new_description,
        change_details,
        user_id,
        session_id
      FROM audit_logs
      
      ORDER BY table_type, environment, key
    `);
    
    await this.conn.query(`
      COPY temp_combined_export TO '/combined_export.parquet' (FORMAT PARQUET)
    `);
    
    const parquetBuffer = await this.db!.copyFileToBuffer('/combined_export.parquet');
    return new Uint8Array(parquetBuffer);
  }

  async importFromParquet(buffer: ArrayBuffer): Promise<Property[]> {
    if (!this.conn) throw new Error('Database not initialized');
    
    await this.db!.registerFileBuffer('import.parquet', new Uint8Array(buffer));
    
    // Create temporary table from imported parquet
    await this.conn.query('DROP TABLE IF EXISTS imported_data');
    await this.conn.query(`
      CREATE TABLE imported_data AS 
      SELECT * FROM read_parquet('import.parquet')
    `);
    
    // Check if this is a combined export (has table_type column) or legacy properties-only export
    const columnsResult = await this.conn.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'imported_data' AND column_name = 'table_type'
    `);
    
    const hasCombinedFormat = columnsResult.toArray().length > 0;
    
    if (hasCombinedFormat) {
      // Handle combined format - import both properties and audit logs
      await this.importCombinedData();
    } else {
      // Handle legacy format - import only properties
      await this.importLegacyProperties();
    }
    
    // Return the imported properties
    const result = await this.conn.query(`
      SELECT * FROM properties ORDER BY environment, key
    `);
    
    const properties: Property[] = [];
    for (const row of result.toArray()) {
      properties.push({
        id: row.id as string,
        environment: row.environment as string,
        key: row.key as string,
        value: row.value as string,
        description: row.description as string,
        component: row.component as string,
        lastModified: row.last_modified ? new Date(row.last_modified as string) : new Date(),
        environmentOrder: row.environment_order as number || undefined,
        fileOrder: row.file_order as number || undefined,
        lineOrder: row.line_order as number || undefined
      });
    }
    
    return properties;
  }

  private async importCombinedData(): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');
    
    // Clear existing data
    await this.conn.query('DELETE FROM properties');
    await this.conn.query('DELETE FROM audit_logs');
    
    // Import properties
    await this.conn.query(`
      INSERT INTO properties (
        id, environment, key, value, description, component, 
        last_modified, environment_order, file_order, line_order
      )
      SELECT 
        id, environment, key, value, description, component,
        CASE 
          WHEN last_modified IS NOT NULL THEN strptime(last_modified, '%Y-%m-%d %H:%M:%S')
          ELSE CURRENT_TIMESTAMP
        END as last_modified,
        environment_order, file_order, line_order
      FROM imported_data 
      WHERE table_type = 'properties'
    `);
    
    // Import audit logs
    await this.conn.query(`
      INSERT INTO audit_logs (
        id, timestamp, action, table_name, record_id, property_key,
        environment, component, old_value, new_value, old_description,
        new_description, change_details, user_id, session_id
      )
      SELECT 
        id,
        CASE 
          WHEN timestamp IS NOT NULL THEN strptime(timestamp, '%Y-%m-%d %H:%M:%S')
          ELSE CURRENT_TIMESTAMP
        END as timestamp,
        action, 'properties' as table_name, record_id, property_key,
        environment, component, old_value, new_value, old_description,
        new_description, change_details, user_id, session_id
      FROM imported_data 
      WHERE table_type = 'audit_logs'
    `);
  }

  private async importLegacyProperties(): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');
    
    // Clear existing properties
    await this.conn.query('DELETE FROM properties');
    
    // Import legacy properties format
    await this.conn.query(`
      INSERT INTO properties (
        id, environment, key, value, description, component, 
        last_modified, environment_order, file_order, line_order
      )
      SELECT 
        id, environment, key, value, description, component,
        CASE 
          WHEN last_modified IS NOT NULL THEN last_modified
          ELSE CURRENT_TIMESTAMP
        END as last_modified,
        environment_order, file_order, line_order
      FROM imported_data
    `);
  }

  async queryProperties(filter?: { environment?: string; searchTerm?: string }): Promise<Property[]> {
    if (!this.conn) throw new Error('Database not initialized');
    
    let query = 'SELECT * FROM properties WHERE 1=1';
    const params: any[] = [];
    
    if (filter?.environment) {
      query += ' AND environment = ?';
      params.push(filter.environment);
    }
    
    if (filter?.searchTerm) {
      query += ' AND (key LIKE ? OR value LIKE ? OR description LIKE ?)';
      const searchPattern = `%${filter.searchTerm}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ' ORDER BY environment, key';
    
    const stmt = await this.conn.prepare(query);
    const result = await stmt.query(...params);
    await stmt.close();
    
    return result.toArray().map(row => ({
      id: row.id as string,
      environment: row.environment as string,
      key: row.key as string,
      value: row.value as string,
      description: row.description as string,
      component: row.component as string,
      lastModified: row.last_modified ? new Date(row.last_modified as string) : new Date(),
      environmentOrder: row.environment_order as number || undefined,
      fileOrder: row.file_order as number || undefined,
      lineOrder: row.line_order as number || undefined
    }));
  }

  async close() {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
  }

  // Audit logging methods
  async insertAuditLog(auditLog: AuditLog): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');

    await this.conn.query(`
      INSERT INTO audit_logs (
        id, timestamp, action, table_name, record_id, property_key, 
        environment, component, old_value, new_value, old_description, 
        new_description, change_details, user_id, session_id
      ) VALUES (
        '${auditLog.id}',
        '${auditLog.timestamp.toISOString()}',
        '${auditLog.action}',
        '${auditLog.tableName}',
        '${auditLog.recordId}',
        '${auditLog.propertyKey}',
        '${auditLog.environment}',
        '${auditLog.component}',
        ${auditLog.oldValue ? `'${auditLog.oldValue.replace(/'/g, "''")}'` : 'NULL'},
        ${auditLog.newValue ? `'${auditLog.newValue.replace(/'/g, "''")}'` : 'NULL'},
        ${auditLog.oldDescription ? `'${auditLog.oldDescription.replace(/'/g, "''")}'` : 'NULL'},
        ${auditLog.newDescription ? `'${auditLog.newDescription.replace(/'/g, "''")}'` : 'NULL'},
        '${auditLog.changeDetails.replace(/'/g, "''")}',
        ${auditLog.userId ? `'${auditLog.userId}'` : 'NULL'},
        '${auditLog.sessionId}'
      )
    `);
  }

  async insertAuditLogs(auditLogs: AuditLog[]): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');
    
    for (const auditLog of auditLogs) {
      await this.insertAuditLog(auditLog);
    }
  }

  async queryAuditLogs(limit = 1000, offset = 0): Promise<AuditLog[]> {
    if (!this.conn) throw new Error('Database not initialized');

    const result = await this.conn.query(`
      SELECT * FROM audit_logs 
      ORDER BY timestamp DESC 
      LIMIT ${limit} OFFSET ${offset}
    `);

    return result.toArray().map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      propertyKey: row.property_key,
      environment: row.environment,
      component: row.component,
      oldValue: row.old_value,
      newValue: row.new_value,
      oldDescription: row.old_description,
      newDescription: row.new_description,
      changeDetails: row.change_details,
      userId: row.user_id,
      sessionId: row.session_id
    }));
  }

  async queryAuditLogsByProperty(propertyKey: string, environment: string): Promise<AuditLog[]> {
    if (!this.conn) throw new Error('Database not initialized');

    const result = await this.conn.query(`
      SELECT * FROM audit_logs 
      WHERE property_key = '${propertyKey}' AND environment = '${environment}'
      ORDER BY timestamp DESC
    `);

    return result.toArray().map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      propertyKey: row.property_key,
      environment: row.environment,
      component: row.component,
      oldValue: row.old_value,
      newValue: row.new_value,
      oldDescription: row.old_description,
      newDescription: row.new_description,
      changeDetails: row.change_details,
      userId: row.user_id,
      sessionId: row.session_id
    }));
  }

  async getAuditLogStats(): Promise<{
    totalLogs: number;
    totalActions: { action: string; count: number }[];
    recentActivity: AuditLog[];
  }> {
    if (!this.conn) throw new Error('Database not initialized');

    // Get total count
    const totalResult = await this.conn.query('SELECT COUNT(*) as count FROM audit_logs');
    const totalLogs = totalResult.toArray()[0].count;

    // Get action counts
    const actionsResult = await this.conn.query(`
      SELECT action, COUNT(*) as count 
      FROM audit_logs 
      GROUP BY action 
      ORDER BY count DESC
    `);
    const totalActions = actionsResult.toArray().map(row => ({
      action: row.action,
      count: row.count
    }));

    // Get recent activity (last 10 logs)
    const recentActivity = await this.queryAuditLogs(10, 0);

    return {
      totalLogs,
      totalActions,
      recentActivity
    };
  }

  async exportAuditLogsToParquet(): Promise<Uint8Array> {
    if (!this.conn) throw new Error('Database not initialized');

    // Create a temporary table with all audit logs
    await this.conn.query(`
      CREATE TEMPORARY TABLE temp_audit_export AS 
      SELECT * FROM audit_logs ORDER BY timestamp DESC
    `);

    // Export to parquet (simplified implementation)
    await this.conn.query(`
      COPY temp_audit_export TO 'audit_logs.parquet' (FORMAT PARQUET)
    `);
    
    // Read the parquet file data
    const parquetResult = await this.conn.query(`
      SELECT * FROM read_parquet('audit_logs.parquet')
    `);
    
    return parquetResult.toArray() as any; // This would need proper parquet export implementation
  }
}