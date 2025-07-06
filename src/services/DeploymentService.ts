import JSZip from 'jszip';
import { Property } from '../models/Property';

export class DeploymentService {
  /**
   * Creates a zip archive containing all property files organized by environment
   */
  static async createDeploymentZip(properties: Property[]): Promise<Blob> {
    const zip = new JSZip();
    
    // Group properties by environment and component
    const environmentGroups = this.groupPropertiesByEnvironment(properties);
    
    // Create files for each environment
    for (const [environment, envProperties] of Object.entries(environmentGroups)) {
      const envFolder = zip.folder(environment);
      if (!envFolder) continue;
      
      // Group by component within each environment
      const componentGroups = this.groupPropertiesByComponent(envProperties);
      
      for (const [component, compProperties] of Object.entries(componentGroups)) {
        const fileName = this.getComponentFileName(component);
        const content = this.generatePropertiesFileContent(compProperties);
        envFolder.file(fileName, content);
      }
    }
    
    // Generate and return the zip
    return await zip.generateAsync({ type: 'blob' });
  }
  
  /**
   * Groups properties by environment
   */
  private static groupPropertiesByEnvironment(properties: Property[]): Record<string, Property[]> {
    return properties.reduce((acc, property) => {
      if (!acc[property.environment]) {
        acc[property.environment] = [];
      }
      acc[property.environment].push(property);
      return acc;
    }, {} as Record<string, Property[]>);
  }
  
  /**
   * Groups properties by component
   */
  private static groupPropertiesByComponent(properties: Property[]): Record<string, Property[]> {
    return properties.reduce((acc, property) => {
      if (!acc[property.component]) {
        acc[property.component] = [];
      }
      acc[property.component].push(property);
      return acc;
    }, {} as Record<string, Property[]>);
  }
  
  /**
   * Generates the content for a properties file preserving original order
   */
  private static generatePropertiesFileContent(properties: Property[]): string {
    const lines: string[] = [];
    
    // Add header with timestamp
    lines.push(`# Generated on ${new Date().toISOString()}`);
    lines.push(`# Environment Properties`);
    lines.push('');
    
    // Sort properties by their original order if available, otherwise by key
    const sortedProperties = properties.sort((a, b) => {
      // If both have order information, use it
      if (a.lineOrder !== undefined && b.lineOrder !== undefined) {
        // First sort by file order, then by line order within file
        if (a.fileOrder !== b.fileOrder) {
          return (a.fileOrder || 0) - (b.fileOrder || 0);
        }
        return a.lineOrder - b.lineOrder;
      }
      
      // If only one has order information, prioritize it
      if (a.lineOrder !== undefined && b.lineOrder === undefined) {
        return -1;
      }
      if (a.lineOrder === undefined && b.lineOrder !== undefined) {
        return 1;
      }
      
      // Fallback to alphabetical sorting
      return a.key.localeCompare(b.key);
    });
    
    // Generate properties preserving original structure
    let lastFileOrder = -1;
    
    for (const property of sortedProperties) {
      // Add file separator comment when switching files
      if (property.fileOrder !== undefined && property.fileOrder !== lastFileOrder) {
        if (lastFileOrder !== -1) {
          lines.push(''); // Add spacing between files
        }
        lastFileOrder = property.fileOrder;
      }
      
      // Add description as comment if available
      if (property.description) {
        lines.push(`# ${property.description}`);
      }
      
      // Add the property
      lines.push(`${property.key}=${property.value}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  
  /**
   * Gets the filename for a component
   */
  private static getComponentFileName(component: string): string {
    const fileMap: Record<string, string> = {
      env: 'env.properties',
      app: 'app-properties.properties',
      mail: 'mail.properties',
      'mylist-app': 'mylist-app.properties',
      'mylist-env': 'mylist-env.properties',
      url: 'url.properties',
      f4batch: 'f4batch.properties',
      fax: 'fax-properties.properties',
      gsearch: 'gsearch.properties',
      'monitoring-env': 'monitoring-env.properties'
    };
    
    return fileMap[component] || `${component}.properties`;
  }
  
  /**
   * Creates a deployment package with metadata
   */
  static async createDeploymentPackage(properties: Property[]): Promise<Blob> {
    const zip = new JSZip();
    
    // Add property files
    const propertyZip = await this.createDeploymentZip(properties);
    const propertyZipBuffer = await propertyZip.arrayBuffer();
    zip.file('properties.zip', propertyZipBuffer);
    
    // Add deployment metadata
    const metadata = {
      generatedAt: new Date().toISOString(),
      environments: Array.from(new Set(properties.map(p => p.environment))),
      components: Array.from(new Set(properties.map(p => p.component))),
      totalProperties: properties.length,
      version: '1.0.0'
    };
    
    zip.file('deployment-info.json', JSON.stringify(metadata, null, 2));
    
    // Add README
    const readme = this.generateReadme(metadata);
    zip.file('README.md', readme);
    
    return await zip.generateAsync({ type: 'blob' });
  }
  
  /**
   * Generates README content for deployment
   */
  private static generateReadme(metadata: any): string {
    return `# Environment Properties Deployment

## Deployment Information
- **Generated**: ${metadata.generatedAt}
- **Version**: ${metadata.version}
- **Total Properties**: ${metadata.totalProperties}

## Environments
${metadata.environments.map((env: string) => `- ${env}`).join('\n')}

## Component Files
${metadata.components.map((comp: string) => `- ${comp}.properties`).join('\n')}

## Structure
\`\`\`
├── properties.zip          # Main property files
│   ├── production/
│   │   ├── env.properties
│   │   ├── app-properties.properties
│   │   └── mail.properties
│   ├── ST/
│   │   ├── env.properties
│   │   └── ...
│   └── ...
├── deployment-info.json    # Deployment metadata
└── README.md              # This file
\`\`\`

## Usage
1. Extract the properties.zip file
2. Deploy the environment-specific folders to your target systems
3. Ensure proper file permissions and ownership
4. Restart services as needed

## Notes
- Properties are organized by environment and component
- Each file includes generation timestamp and descriptions
- Sensitive values should be verified before deployment
`;
  }
}