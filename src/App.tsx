import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import AddIcon from '@mui/icons-material/Add';
import DeployIcon from '@mui/icons-material/Rocket';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import EnvironmentIcon from '@mui/icons-material/CloudQueue';

import { Property } from './models/Property';
import { DuckDBService } from './services/DuckDBService';
import { EncryptionService } from './services/EncryptionService';
import { DeploymentService } from './services/DeploymentService';
import { PropertiesFileService } from './services/PropertiesFileService';
import { FolderInitializationService } from './services/FolderInitializationService';
import { PropertyGrid } from './components/PropertyGrid';
import { ComponentSelector } from './components/ComponentSelector';
import { PropertyEditor } from './components/PropertyEditor';
import { AuditPage } from './components/AuditPage';
import { AuditService } from './services/AuditService';
import { AddEnvironmentDialog } from './components/AddEnvironmentDialog';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
  },
});

function App() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbService, setDbService] = useState<DuckDBService | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [keyFilter, setKeyFilter] = useState<string>('');
  const [initializeLoading, setInitializeLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<'main' | 'audit'>('main');
  const addPendingPropertiesRef = useRef<((properties: Property[]) => void) | null>(null);
  const markForDeletionRef = useRef<((properties: Property[]) => void) | null>(null);
  const [addEnvironmentDialogOpen, setAddEnvironmentDialogOpen] = useState(false);

  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    try {
      const service = new DuckDBService();
      await service.initialize();
      setDbService(service);
      
      // Check if database is empty
      const isEmpty = await service.checkIfEmpty();
      
      if (isEmpty) {
        // Start with empty state - require folder initialization
        console.log('Database is empty. Use the Initialize button to load properties from a folder.');
        setProperties([]);
        setError('Database is empty. Click the "Initialize" button to load properties from a folder structure.');
      } else {
        // Load existing properties from database
        const loadedProperties = await service.queryProperties();
        setProperties(loadedProperties);
      }
      
      setLoading(false);
    } catch (err) {
      setError('Failed to initialize database: ' + err);
      setLoading(false);
    }
  };


  const handleExport = async () => {
    if (!dbService || !password) return;
    
    try {
      const parquetData = await dbService.exportToParquet();
      const encryptedData = await EncryptionService.encrypt(parquetData, password);
      
      const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complete_snapshot_${new Date().toISOString().split('T')[0]}.parquet.enc`;
      a.click();
      URL.revokeObjectURL(url);
      
      setExportDialogOpen(false);
      setPassword('');
    } catch (err) {
      setError('Export failed: ' + err);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !dbService) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      if (file.name.endsWith('.enc')) {
        const passwordInput = prompt('Enter password to decrypt:');
        if (!passwordInput) return;
        
        const decrypted = await EncryptionService.decrypt(
          new Uint8Array(arrayBuffer),
          passwordInput
        );
        const importedProps = await dbService.importFromParquet(decrypted.buffer);
        setProperties(importedProps);
      } else if (file.name.endsWith('.properties')) {
        const content = new TextDecoder().decode(arrayBuffer);
        const importedProps = await handlePropertiesFileUpload(file.name, content);
        if (importedProps.length > 0) {
          const updatedProperties = [...properties, ...importedProps];
          await dbService.insertProperties(updatedProperties);
          setProperties(updatedProperties);
        }
      } else {
        const importedProps = await dbService.importFromParquet(arrayBuffer);
        setProperties(importedProps);
        
        // Show success message for combined import
        setSuccessMessage('Successfully imported complete snapshot with properties and audit history');
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err) {
      setError('Import failed: ' + err);
    }
  };

  const handlePropertiesFileUpload = async (filename: string, content: string): Promise<Property[]> => {
    const newProperties: Property[] = [];
    
    try {
      const component = PropertiesFileService.getComponentFromFilename(filename);
      const parsedProps = PropertiesFileService.parsePropertiesFileWithDescriptionsLegacy(content);
      
      // Get current environments from existing properties
      const currentEnvironments = availableEnvironments.length > 0 
        ? availableEnvironments 
        : ['default']; // Fallback if no environments exist yet
      
      for (const [key, { value, description }] of Object.entries(parsedProps)) {
        for (const env of currentEnvironments) {
          const propertyId = `${env}_${key}`;
          
          const existingProperty = properties.find(p => p.id === propertyId);
          if (!existingProperty) {
            newProperties.push({
              id: propertyId,
              environment: env,
              key,
              value,
              description: description || `Imported from ${filename}`,
              component,
              lastModified: new Date()
            });
          }
        }
      }
      
      return newProperties;
    } catch (error) {
      console.error('Failed to parse properties file:', error);
      return [];
    }
  };

  const handleSaveProperty = async (propertiesToSave: Property[]) => {
    try {
      if (editingProperty) {
        // Editing existing property - save immediately to database
        if (!dbService) return;
        
        let updatedProperties = [...properties];
        const auditLogs: any[] = [];
        
        const propertyToUpdate = propertiesToSave[0];
        const oldProperty = properties.find(p => p.id === propertyToUpdate.id);
        
        updatedProperties = properties.map(p => 
          p.id === propertyToUpdate.id ? propertyToUpdate : p
        );
        
        // Create audit log for update
        if (oldProperty) {
          auditLogs.push(AuditService.createAuditLog('UPDATE', propertyToUpdate, oldProperty));
        }
        
        // Save properties and audit logs
        await dbService.insertProperties(updatedProperties);
        await dbService.insertAuditLogs(auditLogs);
        
        setProperties(updatedProperties);
      } else {
        // Adding new properties - add to pending instead of saving immediately
        if (addPendingPropertiesRef.current) {
          addPendingPropertiesRef.current(propertiesToSave);
        }
      }
      
      setEditorOpen(false);
      setEditingProperty(null);
    } catch (err) {
      setError('Failed to save property: ' + err);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!dbService) return;
    
    try {
      const propertyToDelete = properties.find(p => p.id === id);
      if (!propertyToDelete) return;
      
      const updatedProperties = properties.filter(p => p.id !== id);
      
      // Create audit log for deletion
      const auditLog = AuditService.createAuditLog('DELETE', propertyToDelete);
      
      await dbService.insertProperties(updatedProperties);
      await dbService.insertAuditLog(auditLog);
      
      setProperties(updatedProperties);
    } catch (err) {
      setError('Failed to delete property: ' + err);
    }
  };

  const handleBatchSave = async (changes: Property[], deletions: Property[], customComment?: string) => {
    if (!dbService) return;
    
    try {
      // Create a map of existing properties for quick lookup
      const propertyMap = new Map(properties.map(p => [`${p.environment}_${p.key}`, p]));
      
      // Process deletions first
      deletions.forEach(deletion => {
        const key = `${deletion.environment}_${deletion.key}`;
        const existingProperty = propertyMap.get(key);
        
        if (existingProperty) {
          // Remove from property map
          propertyMap.delete(key);
        }
      });
      
      // Group changes by environment to detect new environments
      const changesByEnvironment = new Map<string, Property[]>();
      changes.forEach(change => {
        if (!changesByEnvironment.has(change.environment)) {
          changesByEnvironment.set(change.environment, []);
        }
        changesByEnvironment.get(change.environment)!.push(change);
      });
      
      // Check for new environments
      const existingEnvironments = new Set(properties.map(p => p.environment));
      const newEnvironments = Array.from(changesByEnvironment.keys()).filter(env => !existingEnvironments.has(env));
      
      // Process changes
      changes.forEach(change => {
        const key = `${change.environment}_${change.key}`;
        propertyMap.set(key, change);
      });
      
      // Convert back to array
      const updatedProperties = Array.from(propertyMap.values());
      
      // Determine if this is a batch operation or single operation
      const totalOperations = changes.length + deletions.length;
      
      if (totalOperations === 1) {
        // Single operation - create individual audit log
        const auditLogs: any[] = [];
        
        if (deletions.length === 1) {
          const deletion = deletions[0];
          const auditLog = AuditService.createAuditLog('DELETE', deletion);
          if (customComment) {
            auditLog.changeDetails = customComment;
          }
          auditLogs.push(auditLog);
        } else if (changes.length === 1) {
          const change = changes[0];
          const originalProperty = properties.find(p => p.id === change.id);
          
          if (originalProperty) {
            const auditLog = AuditService.createAuditLog('UPDATE', change, originalProperty);
            if (customComment) {
              auditLog.changeDetails = customComment;
            }
            auditLogs.push(auditLog);
          } else {
            const auditLog = AuditService.createAuditLog('CREATE', change);
            if (customComment) {
              auditLog.changeDetails = customComment;
            } else if (newEnvironments.includes(change.environment)) {
              auditLog.changeDetails = `Created property in new environment: ${change.environment}`;
            }
            auditLogs.push(auditLog);
          }
        }
        
        // Save to database
        await dbService.insertProperties(updatedProperties);
        await dbService.insertAuditLogs(auditLogs);
      } else {
        // Multiple operations - create batch audit log
        const batchAuditLog = AuditService.createBatchOperationAuditLog(changes, deletions, customComment, properties);
        
        // Save to database
        await dbService.insertProperties(updatedProperties);
        await dbService.insertAuditLog(batchAuditLog);
      }
      
      setProperties(updatedProperties);
      
      // Show success message
      const messages = [];
      if (deletions.length > 0) {
        messages.push(`Deleted ${deletions.length} properties`);
      }
      if (changes.length > 0) {
        messages.push(`Updated/added ${changes.length} properties`);
      }
      if (newEnvironments.length > 0) {
        messages.push(`Added ${newEnvironments.length} new environment(s): ${newEnvironments.join(', ')}`);
      }
      
      if (messages.length > 0) {
        setSuccessMessage(`Successfully saved changes: ${messages.join(', ')}`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err) {
      setError('Failed to save changes: ' + err);
    }
  };

  const handleFolderInitialization = async () => {
    if (!dbService) return;
    
    try {
      setInitializeLoading(true);
      setError(null);
      
      // Initialize from folder
      const folderProperties = await FolderInitializationService.initializeFromFolder();
      
      if (folderProperties.length === 0) {
        setError('No properties found in the selected folder');
        return;
      }
      
      // Clear existing data and load new properties
      await dbService.insertProperties(folderProperties);
      setProperties(folderProperties);
      
      // Show success message with summary
      const environments = FolderInitializationService.getEnvironmentsFromProperties(folderProperties);
      const components = FolderInitializationService.getComponentsFromProperties(folderProperties);
      
      // Show success in console and potentially as a snackbar
      console.log('Initialization successful:', {
        properties: folderProperties.length,
        environments: environments,
        components: components
      });
      
      // Set a success message
      setSuccessMessage(`Successfully initialized with ${folderProperties.length} properties from ${environments.length} environments: ${environments.join(', ')}`);
      
      // Clear any previous error message
      setError(null);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'No folder selected') {
        setError('Folder initialization failed: ' + errorMessage);
      }
    } finally {
      setInitializeLoading(false);
    }
  };

  const handleDeploy = async () => {
    try {
      setDeployLoading(true);
      const deploymentZip = await DeploymentService.createDeploymentPackage(properties);
      
      const url = URL.createObjectURL(deploymentZip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deployment_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      setDeployDialogOpen(false);
    } catch (err) {
      setError('Deployment failed: ' + err);
    } finally {
      setDeployLoading(false);
    }
  };

  const handleRestore = async (restoredProperties: Property[], deletions?: Property[]) => {
    if (!dbService) return;

    try {
      // Update the properties in the database
      let updatedProperties = [...properties];
      
      // Handle deletions first
      if (deletions && deletions.length > 0) {
        deletions.forEach(deletionProp => {
          updatedProperties = updatedProperties.filter(p => p.id !== deletionProp.id);
        });
      }
      
      // Handle restorations
      restoredProperties.forEach(restoredProp => {
        const index = updatedProperties.findIndex(p => p.id === restoredProp.id);
        if (index >= 0) {
          updatedProperties[index] = restoredProp;
        } else {
          updatedProperties.push(restoredProp);
        }
      });

      await dbService.insertProperties(updatedProperties);
      setProperties(updatedProperties);
      
      // Navigate back to main page
      setCurrentPage('main');
      
      // Generate success message
      const messages = [];
      if (restoredProperties.length > 0) {
        messages.push(`restored ${restoredProperties.length} properties`);
      }
      if (deletions && deletions.length > 0) {
        messages.push(`deleted ${deletions.length} properties`);
      }
      
      setSuccessMessage(`Successfully ${messages.join(' and ')}`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError('Failed to restore properties: ' + err);
    }
  };

  const handleAddEnvironment = (environmentName: string, sourceEnvironment: string | null) => {
    try {
      // Only add environment for selected component
      if (selectedComponent === 'all') {
        setError('Please select a specific component to add environment');
        return;
      }

      // Get unique property keys for the selected component only
      const componentProperties = properties.filter(p => p.component === selectedComponent);
      const uniqueKeys = Array.from(new Set(componentProperties.map(p => p.key)));
      
      // Create new properties for the environment
      const newProperties: Property[] = [];
      
      uniqueKeys.forEach(key => {
        // Get value from source environment if specified (for the same component)
        let value = '';
        let description = '';
        
        if (sourceEnvironment) {
          const sourceProperty = properties.find(p => 
            p.key === key && 
            p.environment === sourceEnvironment && 
            p.component === selectedComponent
          );
          if (sourceProperty) {
            value = sourceProperty.value;
            description = sourceProperty.description || '';
          }
        }
        
        newProperties.push({
          id: `${environmentName}_${key}`,
          environment: environmentName,
          key,
          value,
          description,
          component: selectedComponent,
          lastModified: new Date()
        });
      });
      
      // Add to pending properties instead of saving immediately
      if (addPendingPropertiesRef.current) {
        addPendingPropertiesRef.current(newProperties);
        
        // Show success message
        const sourceText = sourceEnvironment ? ` copied from "${sourceEnvironment}"` : ' with empty values';
        setSuccessMessage(`Environment "${environmentName}" added for component "${selectedComponent}" with ${newProperties.length} properties${sourceText}. Click "Save Changes" to commit.`);
        setTimeout(() => setSuccessMessage(null), 8000);
      }
    } catch (err) {
      setError('Failed to add environment: ' + err);
    }
  };

  const handleRemoveEnvironment = (environment: string, component: string) => {
    try {
      // Find properties to mark for deletion for the specific environment and component
      const propertiesToRemove = properties.filter(p => 
        p.environment === environment && p.component === component
      );

      if (propertiesToRemove.length === 0) {
        setError(`No properties found for environment "${environment}" in component "${component}"`);
        return;
      }

      // Mark properties for deletion instead of deleting immediately
      if (markForDeletionRef.current) {
        markForDeletionRef.current(propertiesToRemove);
        
        // Show success message
        setSuccessMessage(`Environment "${environment}" marked for removal from component "${component}". ${propertiesToRemove.length} properties marked for deletion. Click "Save Changes" to commit.`);
        setTimeout(() => setSuccessMessage(null), 8000);
      }
    } catch (err) {
      setError('Failed to mark environment for removal: ' + err);
    }
  };

  let filteredProperties = selectedComponent === 'all'
    ? properties
    : properties.filter(p => p.component === selectedComponent);
    
  // Apply key filter
  if (keyFilter) {
    filteredProperties = filteredProperties.filter(p => 
      p.key.toLowerCase().includes(keyFilter.toLowerCase())
    );
  }

  const availableComponents = ['all', ...Array.from(new Set(properties.map(p => p.component)))];
  const availableEnvironments = Array.from(new Set(properties.map(p => p.environment))).sort();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // Conditional rendering for different pages
  if (currentPage === 'audit') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuditPage
          dbService={dbService}
          onBack={() => setCurrentPage('main')}
          onRestore={handleRestore}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Environment Properties Manager
            </Typography>
            <Button
              color="inherit"
              startIcon={<FolderIcon />}
              onClick={handleFolderInitialization}
              disabled={initializeLoading}
            >
              {initializeLoading ? 'Initializing...' : 'Initialize'}
            </Button>
            <Button
              color="inherit"
              startIcon={<HistoryIcon />}
              onClick={() => setCurrentPage('audit')}
            >
              Audit
            </Button>
            <Button
              color="inherit"
              startIcon={<UploadIcon />}
              component="label"
            >
              Import
              <input
                type="file"
                hidden
                accept=".parquet,.enc,.properties"
                onChange={handleImport}
              />
            </Button>
            <Button
              color="inherit"
              startIcon={<DownloadIcon />}
              onClick={() => setExportDialogOpen(true)}
            >
              Export
            </Button>
            <Button
              color="inherit"
              startIcon={<DeployIcon />}
              onClick={() => setDeployDialogOpen(true)}
            >
              Deploy
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth={false} sx={{ mt: 4, mb: 4, flexGrow: 1, px: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mb: 2 }}>
              {successMessage}
            </Alert>
          )}

          {/* Component Selector Row */}
          <Box sx={{ mb: 2 }}>
            <ComponentSelector
              components={availableComponents}
              selected={selectedComponent}
              onChange={setSelectedComponent}
            />
          </Box>

          {/* Key Filter Row */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <TextField
              placeholder="Filter by key..."
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
              size="small"
              sx={{ width: 400 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<EnvironmentIcon />}
                onClick={() => setAddEnvironmentDialogOpen(true)}
                disabled={selectedComponent === 'all'}
              >
                Add Environment
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => {
                  setEditingProperty(null);
                  setEditorOpen(true);
                }}
              >
                Add Property
              </Button>
            </Box>
          </Box>

          <PropertyGrid
            properties={filteredProperties}
            onEdit={(property) => {
              setEditingProperty(property);
              setEditorOpen(true);
            }}
            onDelete={handleDeleteProperty}
            onBatchSave={handleBatchSave}
            onAddPendingProperties={(addFn) => {
              addPendingPropertiesRef.current = addFn;
            }}
            onMarkForDeletion={(markFn) => {
              markForDeletionRef.current = markFn;
            }}
            onRemoveEnvironment={handleRemoveEnvironment}
            selectedComponent={selectedComponent}
          />
        </Container>

        <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
          <DialogTitle>Export Complete Snapshot</DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                This will export a complete snapshot including:
              </Typography>
              <ul style={{ marginTop: '8px', marginBottom: '16px' }}>
                <li>All {properties.length} properties</li>
                <li>Complete audit history and change logs</li>
                <li>Environment and component configurations</li>
              </ul>
              <Typography variant="body2" color="text.secondary">
                The exported file will be encrypted and can be imported later to restore the complete state.
              </Typography>
            </Box>
            <TextField
              autoFocus
              margin="dense"
              label="Encryption Password"
              type="password"
              fullWidth
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Enter a password to encrypt the exported file"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={!password}>Export Complete Snapshot</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deployDialogOpen} onClose={() => setDeployDialogOpen(false)}>
          <DialogTitle>Deploy Properties</DialogTitle>
          <DialogContent>
            <Box sx={{ py: 2 }}>
              <Typography variant="body1" gutterBottom>
                This will create a deployment package containing:
              </Typography>
              <ul>
                <li>Property files organized by environment</li>
                <li>Deployment metadata and README</li>
                <li>All {properties.length} properties across {Array.from(new Set(properties.map(p => p.environment))).length} environments</li>
              </ul>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                The deployment package will be downloaded as a ZIP file.
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeployDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleDeploy} 
              disabled={deployLoading}
              variant="contained"
              startIcon={deployLoading ? <CircularProgress size={20} /> : <DeployIcon />}
            >
              {deployLoading ? 'Creating...' : 'Deploy'}
            </Button>
          </DialogActions>
        </Dialog>

        <PropertyEditor
          open={editorOpen}
          property={editingProperty}
          environments={availableEnvironments.length > 0 ? availableEnvironments : ['default']}
          onSave={handleSaveProperty}
          onClose={() => {
            setEditorOpen(false);
            setEditingProperty(null);
          }}
        />

        <AddEnvironmentDialog
          open={addEnvironmentDialogOpen}
          onClose={() => setAddEnvironmentDialogOpen(false)}
          onSave={handleAddEnvironment}
          properties={properties}
          selectedComponent={selectedComponent}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;