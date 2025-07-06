import { Property } from '../models/Property';

export class PropertiesParser {
  static parse(content: string, environment: string): Property[] {
    const lines = content.split('\n');
    const properties: Property[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }
      
      const key = line.substring(0, equalIndex).trim();
      const value = line.substring(equalIndex + 1).trim();
      
      let description = '';
      if (i > 0 && lines[i - 1].trim().startsWith('#')) {
        description = lines[i - 1].trim().substring(1).trim();
      }
      
      properties.push({
        id: `${environment}_${key}`,
        environment,
        key,
        value,
        description: description || undefined,
        component: 'env',
        lastModified: new Date()
      });
    }
    
    return properties;
  }
  
  static serialize(properties: Property[]): string {
    const groupedByEnv = properties.reduce((acc, prop) => {
      if (!acc[prop.environment]) {
        acc[prop.environment] = [];
      }
      acc[prop.environment].push(prop);
      return acc;
    }, {} as Record<string, Property[]>);
    
    const results: string[] = [];
    
    for (const [env, props] of Object.entries(groupedByEnv)) {
      results.push(`# Environment: ${env}`);
      results.push('');
      
      for (const prop of props.sort((a, b) => a.key.localeCompare(b.key))) {
        if (prop.description) {
          results.push(`# ${prop.description}`);
        }
        results.push(`${prop.key}=${prop.value}`);
        results.push('');
      }
    }
    
    return results.join('\n');
  }
}