import { Property } from '../models/Property';
import { PropertiesParser } from '../services/PropertiesParser';

export class PropertyScanner {
  static async scanDirectory(files: FileList): Promise<Property[]> {
    const allProperties: Property[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!file.name.endsWith('.properties')) {
        continue;
      }
      
      const environment = this.extractEnvironmentFromPath(file.webkitRelativePath || file.name);
      const content = await this.readFile(file);
      const properties = PropertiesParser.parse(content, environment);
      
      allProperties.push(...properties);
    }
    
    return this.deduplicateProperties(allProperties);
  }
  
  private static extractEnvironmentFromPath(path: string): string {
    const parts = path.split('/');
    
    if (parts.includes('batch')) return 'batch';
    if (parts.includes('f4batch')) return 'f4batch';
    if (parts.includes('index')) return 'index';
    if (parts.includes('webapp')) return 'webapp';
    
    return 'unknown';
  }
  
  private static readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
  
  private static deduplicateProperties(properties: Property[]): Property[] {
    const seen = new Set<string>();
    const unique: Property[] = [];
    
    for (const prop of properties) {
      const key = `${prop.environment}_${prop.key}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(prop);
      }
    }
    
    return unique;
  }
  
  static getAllUniqueKeys(properties: Property[]): string[] {
    const keys = new Set<string>();
    properties.forEach(p => keys.add(p.key));
    return Array.from(keys).sort();
  }
  
  static getPropertiesByKey(properties: Property[], key: string): Property[] {
    return properties.filter(p => p.key === key);
  }
  
  static getMissingProperties(properties: Property[], environments: string[]): Array<{
    environment: string;
    key: string;
  }> {
    const allKeys = this.getAllUniqueKeys(properties);
    const missing: Array<{ environment: string; key: string }> = [];
    
    for (const env of environments) {
      for (const key of allKeys) {
        const exists = properties.some(p => p.environment === env && p.key === key);
        if (!exists) {
          missing.push({ environment: env, key });
        }
      }
    }
    
    return missing;
  }
}