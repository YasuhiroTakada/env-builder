import { Property } from '../models/Property';
import { PropertiesFileService } from './PropertiesFileService';

export interface FolderStructure {
  environment: string;
  environmentOrder: number;
  files: {
    name: string;
    path: string;
    content: string;
    fileOrder: number;
  }[];
}

export class FolderInitializationService {
  /**
   * Initializes properties from a folder structure
   * Expected structure: folder/[environment]/[component].properties
   */
  static async initializeFromFolder(): Promise<Property[]> {
    try {
      // Request folder selection from user
      const folderHandle = await this.selectFolder();
      if (!folderHandle) {
        throw new Error('No folder selected');
      }

      // Scan folder structure
      const folderStructure = await this.scanFolderStructure(folderHandle);
      
      // Validate the folder structure
      const validation = this.validateFolderStructure(folderStructure);
      
      if (!validation.isValid) {
        console.error('Validation errors:', validation.errors);
      }
      
      console.log(`Initialization summary: ${validation.summary.environments.length} environments, ${validation.summary.totalFiles} files, ${validation.summary.totalProperties} properties`);
      
      // Convert to properties
      const properties = await this.convertToProperties(folderStructure);
      
      return properties;
    } catch (error) {
      console.error('Failed to initialize from folder:', error);
      throw error;
    }
  }

  /**
   * Opens a folder picker dialog
   */
  private static async selectFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      // Check if the File System Access API is supported
      if ('showDirectoryPicker' in window) {
        return await (window as any).showDirectoryPicker({
          mode: 'read'
        });
      } else {
        throw new Error('Folder selection not supported in this browser');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null; // User cancelled
      }
      throw error;
    }
  }

  /**
   * Scans the folder structure recursively, preserving order
   */
  private static async scanFolderStructure(
    folderHandle: FileSystemDirectoryHandle
  ): Promise<FolderStructure[]> {
    const structures: FolderStructure[] = [];

    try {
      // Collect all entries first to maintain order
      const entries: [string, FileSystemHandle][] = [];
      for await (const entry of (folderHandle as any).entries()) {
        entries.push(entry);
      }

      const debugInfo: string[] = [];
      debugInfo.push(`Found ${entries.length} entries in selected folder`);

      // Sort entries by name to ensure consistent order
      // Use Japanese locale for proper handling of Japanese characters
      entries.sort(([a], [b]) => a.localeCompare(b, 'ja-JP'));

      let environmentOrder = 0;
      const skippedDirs: string[] = [];
      
      // Process directories (environments)
      for (const [name, handle] of entries) {
        if (handle.kind === 'directory') {
          const environment = name;
          const files: { name: string; path: string; content: string; fileOrder: number }[] = [];

          try {
            // Collect files in environment folder
            const fileEntries: [string, FileSystemHandle][] = [];
            for await (const fileEntry of (handle as any).entries()) {
              fileEntries.push(fileEntry);
            }

            // Sort files by name to ensure consistent order
            fileEntries.sort(([a], [b]) => a.localeCompare(b, 'ja-JP'));

            let fileOrder = 0;

            // Process properties files
            for (const [fileName, fileHandle] of fileEntries) {
              if (fileHandle.kind === 'file' && fileName.endsWith('.properties')) {
                try {
                  const file = await (fileHandle as any).getFile();
                  const content = await file.text();
                  
                  files.push({
                    name: fileName,
                    path: `${environment}/${fileName}`,
                    content,
                    fileOrder: fileOrder++
                  });
                } catch (error) {
                  console.error(`Failed to read file ${environment}/${fileName}:`, error);
                  // Continue processing other files
                }
              }
            }

            if (files.length > 0) {
              structures.push({
                environment,
                environmentOrder: environmentOrder++,
                files
              });
              debugInfo.push(`✓ ${environment}: ${files.length} properties files`);
            } else {
              skippedDirs.push(environment);
              debugInfo.push(`✗ ${environment}: no properties files found`);
            }
          } catch (dirError) {
            console.error(`Failed to process directory ${environment}:`, dirError);
            skippedDirs.push(`${environment} (error: ${dirError})`);
          }
        }
      }

      console.log('Folder scan summary:', debugInfo.join('\n'));
      if (skippedDirs.length > 0) {
        console.warn('Skipped directories:', skippedDirs);
      }

      return structures;
    } catch (error) {
      console.error('Failed to scan folder structure:', error);
      throw error;
    }
  }

  /**
   * Converts folder structure to Property objects preserving order
   */
  private static async convertToProperties(
    structures: FolderStructure[]
  ): Promise<Property[]> {
    const properties: Property[] = [];

    // Sort structures by environment order
    structures.sort((a, b) => a.environmentOrder - b.environmentOrder);

    for (const structure of structures) {
      const { environment, environmentOrder, files } = structure;

      // Sort files by file order
      const sortedFiles = [...files].sort((a, b) => a.fileOrder - b.fileOrder);

      for (const file of sortedFiles) {
        try {
          // Determine component from filename
          const component = PropertiesFileService.getComponentFromFilename(file.name);
          
          // Parse properties file with descriptions (preserving line order)
          const parsedProps = PropertiesFileService.parsePropertiesFileWithDescriptions(file.content);

          // Create Property objects with order information
          for (let i = 0; i < parsedProps.length; i++) {
            const { key, value, description } = parsedProps[i];
            
            properties.push({
              id: `${environment}_${key}`,
              environment,
              key,
              value,
              description: description || `Loaded from ${file.path}`,
              component,
              lastModified: new Date(),
              environmentOrder,
              fileOrder: file.fileOrder,
              lineOrder: i // Preserve the order within the file
            });
          }
        } catch (error) {
          console.error(`Failed to process file ${file.path}:`, error);
        }
      }
    }

    return properties;
  }

  /**
   * Gets unique environments from the loaded properties
   */
  static getEnvironmentsFromProperties(properties: Property[]): string[] {
    return Array.from(new Set(properties.map(p => p.environment))).sort();
  }

  /**
   * Gets unique components from the loaded properties
   */
  static getComponentsFromProperties(properties: Property[]): string[] {
    return Array.from(new Set(properties.map(p => p.component))).sort();
  }

  /**
   * Validates the folder structure before processing
   */
  static validateFolderStructure(structures: FolderStructure[]): {
    isValid: boolean;
    errors: string[];
    summary: {
      environments: string[];
      totalFiles: number;
      totalProperties: number;
    };
  } {
    const errors: string[] = [];
    let totalFiles = 0;
    let totalProperties = 0;

    if (structures.length === 0) {
      errors.push('No environment folders found');
    }

    const environments = structures.map(s => s.environment);
    
    for (const structure of structures) {
      if (structure.files.length === 0) {
        errors.push(`Environment '${structure.environment}' has no properties files`);
      }
      
      totalFiles += structure.files.length;
      
      // Count properties in each file
      for (const file of structure.files) {
        const lines = file.content.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && !trimmed.startsWith('#') && trimmed.includes('=');
        });
        totalProperties += lines.length;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      summary: {
        environments,
        totalFiles,
        totalProperties
      }
    };
  }
}