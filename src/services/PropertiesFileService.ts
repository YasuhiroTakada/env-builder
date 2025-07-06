import { Property } from '../models/Property';

export class PropertiesFileService {
  /**
   * Parses a properties file content into key-value pairs with descriptions
   */
  static parsePropertiesFile(content: string): Record<string, string> {
    const properties: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Skip empty lines and comments
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('!')) {
        continue;
      }
      
      // Find the separator (= or :)
      const separatorIndex = trimmedLine.search(/[=:]/);
      if (separatorIndex === -1) continue;
      
      const key = trimmedLine.substring(0, separatorIndex).trim();
      const value = trimmedLine.substring(separatorIndex + 1).trim();
      
      if (key) {
        properties[key] = value;
      }
    }
    
    return properties;
  }

  /**
   * Parses a properties file content into key-value pairs with descriptions from comments
   * Returns an array to preserve order from the original file
   */
  static parsePropertiesFileWithDescriptions(content: string): { key: string; value: string; description: string; lineNumber: number }[] {
    const properties: { key: string; value: string; description: string; lineNumber: number }[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Skip comments but don't process them yet
      if (line.startsWith('#') || line.startsWith('!')) {
        continue;
      }
      
      // Find the separator (= or :)
      const separatorIndex = line.search(/[=:]/);
      if (separatorIndex === -1) continue;
      
      const key = line.substring(0, separatorIndex).trim();
      const value = line.substring(separatorIndex + 1).trim();
      
      if (key) {
        // Look for comment above this line
        let description = '';
        let commentLineIndex = i - 1;
        
        // Skip empty lines to find the comment
        while (commentLineIndex >= 0 && lines[commentLineIndex].trim() === '') {
          commentLineIndex--;
        }
        
        // Check if the line above is a comment
        if (commentLineIndex >= 0) {
          const commentLine = lines[commentLineIndex].trim();
          if (commentLine.startsWith('#') || commentLine.startsWith('!')) {
            // Make sure this comment line is not part of a different property section
            // by checking if there are any property lines between the comment and current line
            let hasPropertyBetween = false;
            for (let j = commentLineIndex + 1; j < i; j++) {
              const betweenLine = lines[j].trim();
              if (betweenLine && !betweenLine.startsWith('#') && !betweenLine.startsWith('!') && betweenLine.search(/[=:]/) !== -1) {
                hasPropertyBetween = true;
                break;
              }
            }
            
            if (!hasPropertyBetween) {
              description = commentLine.substring(1).trim();
            }
          }
        }
        
        properties.push({ key, value, description, lineNumber: i + 1 });
      }
    }
    
    return properties;
  }

  /**
   * Parses a properties file content preserving original order
   * Legacy method for backward compatibility
   */
  static parsePropertiesFileWithDescriptionsLegacy(content: string): Record<string, { value: string; description: string }> {
    const orderedProps = this.parsePropertiesFileWithDescriptions(content);
    const result: Record<string, { value: string; description: string }> = {};
    
    for (const prop of orderedProps) {
      result[prop.key] = { value: prop.value, description: prop.description };
    }
    
    return result;
  }
  
  /**
   * Loads properties from a directory structure
   * Expected structure: conf/[environment]/[component]/[component].properties
   */
  static async loadPropertiesFromDirectory(): Promise<Property[]> {
    const properties: Property[] = [];
    
    try {
      // This will be called from the main process with file system access
      const response = await fetch('/api/load-properties');
      const data = await response.json();
      
      if (data.error) {
        console.error('Error loading properties:', data.error);
        return properties;
      }
      
      return data.properties;
    } catch (error) {
      console.error('Failed to load properties from directory:', error);
      return properties;
    }
  }
  
  /**
   * Loads properties from server API (legacy method - now deprecated)
   * Use FolderInitializationService.initializeFromFolder() instead
   */
  static async loadInitialProperties(): Promise<Property[]> {
    console.warn('loadInitialProperties is deprecated. Use folder initialization instead.');
    return [];
  }
  
  /**
   * Determines the component type from filename
   */
  static getComponentFromFilename(filename: string): string {
    // Remove .properties extension
    const name = filename.replace('.properties', '');
    
    // Map common filenames to components
    const componentMap: Record<string, string> = {
      'env': 'env',
      'app-properties': 'app',
      'mail': 'mail',
      'mylist-app': 'mylist-app',
      'mylist-env': 'mylist-env',
      'url': 'url',
      'f4batch': 'f4batch',
      'fax-properties': 'fax',
      'gsearch': 'gsearch',
      'monitoring-env': 'monitoring-env'
    };
    
    return componentMap[name] || 'env';
  }
  
  /**
   * Creates property entries for missing components
   * Now uses environments from existing properties instead of hardcoded list
   */
  static createMissingComponentProperties(
    existingProperties: Property[],
    environments?: string[]
  ): Property[] {
    const newProperties: Property[] = [];
    
    // Get unique keys and components
    const uniqueKeys = new Set(existingProperties.map(p => p.key));
    const uniqueComponents = new Set(existingProperties.map(p => p.component));
    
    // Use provided environments or extract from existing properties
    const targetEnvironments = environments || Array.from(new Set(existingProperties.map(p => p.environment)));
    
    // For each unique key and component combination
    uniqueKeys.forEach(key => {
      uniqueComponents.forEach(component => {
        targetEnvironments.forEach(env => {
          // Check if this combination exists
          const exists = existingProperties.some(
            p => p.key === key && p.environment === env && p.component === component
          );
          
          if (!exists) {
            // Find a similar property to copy description from
            const similarProp = existingProperties.find(
              p => p.key === key && p.component === component
            );
            
            newProperties.push({
              id: `${env}_${key}`,
              environment: env,
              key,
              value: '',
              description: similarProp?.description || '',
              component,
              lastModified: new Date()
            });
          }
        });
      });
    });
    
    return newProperties;
  }
}