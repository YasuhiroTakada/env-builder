import React, { useState, useEffect, useRef } from 'react';
import { DataGrid, GridColDef, GridActionsCellItem, GridCellParams, GridRenderEditCellParams, useGridApiContext } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import { 
  Box, 
  Button, 
  Typography, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  TextField,
  Pagination,
  FormControlLabel,
  Switch,
  CircularProgress,
  IconButton
} from '@mui/material';
import { Property } from '../models/Property';

interface GroupedProperty {
  id: string;
  key: string;
  description: string;
  component: string;
  lastModified: Date;
  isPending?: boolean; // Mark pending properties
  [environmentName: string]: any; // Dynamic environment columns
}

interface PropertyGridProps {
  properties: Property[];
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onBatchSave?: (changes: Property[], deletions: Property[], customComment?: string) => Promise<void>;
  onAddPendingProperties?: (addFn: (properties: Property[]) => void) => void;
  onMarkForDeletion?: (markFn: (properties: Property[]) => void) => void;
  onRemoveEnvironment?: (environment: string, component: string) => void;
  selectedComponent: string;
}

// Custom edit input component that selects all text on focus
function CustomEditInputCell(props: GridRenderEditCellParams) {
  const { id, value, field } = props;
  const apiRef = useGridApiContext();
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    apiRef.current.setEditCellValue({ id, field, value: newValue });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      apiRef.current.stopCellEditMode({ id, field });
    } else if (event.key === 'Escape') {
      apiRef.current.stopCellEditMode({ id, field, ignoreModifications: true });
    }
  };

  // Display actual value even if it's shown as *** in non-edit mode
  const displayValue = value || '';

  return (
    <input
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleValueChange}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        padding: '0 16px',
        fontSize: 'inherit',
        fontFamily: 'inherit',
        backgroundColor: '#f0f7ff',
        boxSizing: 'border-box',
      }}
    />
  );
}

export const PropertyGrid: React.FC<PropertyGridProps> = ({ properties, onEdit, onDelete, onBatchSave, onAddPendingProperties, onMarkForDeletion, onRemoveEnvironment, selectedComponent }) => {
  const [editedRows, setEditedRows] = useState<Record<string, GroupedProperty>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState<GroupedProperty[]>([]);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [changeComment, setChangeComment] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Property[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showAllRows, setShowAllRows] = useState(false);
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingProperties, setDeletingProperties] = useState<Property[]>([]);
  
  const ROWS_PER_PAGE = 100; // Maximum allowed by MIT DataGrid
  
  // Get unique environments from properties
  const environments = React.useMemo(() => {
    return Array.from(new Set(properties.map(p => p.environment))).sort();
  }, [properties]);
  
  // Group properties by key (including pending properties)
  const groupedProperties: GroupedProperty[] = React.useMemo(() => {
    const grouped: Record<string, GroupedProperty> = {};
    
    // Add existing properties
    properties.forEach(property => {
      const key = property.key;
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          key: property.key,
          description: property.description || '',
          component: property.component,
          lastModified: property.lastModified
        };
      }
      // Add the value for this environment
      (grouped[key] as any)[property.environment] = property.value;
      // Update lastModified to the most recent
      if (property.lastModified > grouped[key].lastModified) {
        grouped[key].lastModified = property.lastModified;
      }
    });
    
    // Add pending properties
    pendingProperties.forEach(property => {
      const key = property.key;
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          key: property.key,
          description: property.description || '',
          component: property.component,
          lastModified: property.lastModified,
          isPending: true // Mark as pending
        };
      }
      // Add the value for this environment
      (grouped[key] as any)[property.environment] = property.value;
      // Mark as pending
      (grouped[key] as any).isPending = true;
      // Update lastModified to the most recent
      if (property.lastModified > grouped[key].lastModified) {
        grouped[key].lastModified = property.lastModified;
      }
    });
    
    return Object.values(grouped);
  }, [properties, pendingProperties]);

  // Update original data when properties change
  useEffect(() => {
    setOriginalData(groupedProperties);
  }, [groupedProperties]);

  // Reset page when properties change (component selection change)
  useEffect(() => {
    setCurrentPage(0);
  }, [properties]);

  // Update hasChanges when pending properties or deleting properties change
  useEffect(() => {
    setHasChanges(Object.keys(editedRows).length > 0 || pendingProperties.length > 0 || deletingProperties.length > 0);
  }, [pendingProperties, editedRows, deletingProperties]);

  // Function to add pending properties (called from parent)
  const addPendingProperties = (props: Property[]) => {
    setPendingProperties(prev => [...prev, ...props]);
  };

  // Function to mark properties for deletion (called from parent)
  const markPropertiesForDeletion = (props: Property[]) => {
    setDeletingProperties(prev => [...prev, ...props]);
  };

  // Expose the functions through the callback
  useEffect(() => {
    if (onAddPendingProperties) {
      onAddPendingProperties(addPendingProperties);
    }
  }, [onAddPendingProperties]);

  useEffect(() => {
    if (onMarkForDeletion) {
      onMarkForDeletion(markPropertiesForDeletion);
    }
  }, [onMarkForDeletion]);

  // Apply edits to the display data
  const allDisplayData = groupedProperties.map(row => {
    return editedRows[row.id] || row;
  });

  // Handle pagination vs show all
  const displayData = showAllRows 
    ? allDisplayData 
    : allDisplayData.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

  const totalPages = Math.ceil(allDisplayData.length / ROWS_PER_PAGE);

  // Debug: Log row count
  console.log(`PropertyGrid: Total rows: ${allDisplayData.length}, Showing: ${displayData.length}, Page: ${currentPage + 1}/${totalPages}`);

  const handleCellEdit = (newRow: GroupedProperty, _oldRow: GroupedProperty) => {
    const originalRow = originalData.find(row => row.id === newRow.id);
    
    if (!originalRow) return newRow;
    
    // Check if there are any actual changes
    let hasRowChanges = false;
    Object.keys(newRow).forEach(key => {
      if (newRow[key as keyof GroupedProperty] !== originalRow[key as keyof GroupedProperty]) {
        hasRowChanges = true;
      }
    });
    
    if (hasRowChanges) {
      const newEditedRows = { ...editedRows, [newRow.id]: newRow };
      setEditedRows(newEditedRows);
      setHasChanges(Object.keys(newEditedRows).length > 0 || pendingProperties.length > 0);
    } else {
      // Remove from edited rows if it's back to original
      const newEditedRows = { ...editedRows };
      delete newEditedRows[newRow.id];
      setEditedRows(newEditedRows);
      setHasChanges(Object.keys(newEditedRows).length > 0 || pendingProperties.length > 0);
    }
    
    return newRow;
  };

  const generateChangeDetails = (changes: Property[]): string => {
    const changeSummary: string[] = [];
    const propertyChanges: Record<string, { key?: string; description?: string; environments: string[] }> = {};
    
    // Group changes by property key
    changes.forEach(change => {
      const originalRow = originalData.find(row => row.id === change.key);
      if (!originalRow) return;
      
      if (!propertyChanges[originalRow.key]) {
        propertyChanges[originalRow.key] = { environments: [] };
      }
      
      const propChange = propertyChanges[originalRow.key];
      
      // Check for key changes
      if (change.key !== originalRow.key) {
        propChange.key = `'${originalRow.key}' → '${change.key}'`;
      }
      
      // Check for description changes
      if (change.description !== originalRow.description) {
        propChange.description = `'${originalRow.description || '(empty)'}' → '${change.description || '(empty)'}'`;
      }
      
      // Add environment to the list
      if (!propChange.environments.includes(change.environment)) {
        propChange.environments.push(change.environment);
      }
    });
    
    // Generate summary text
    Object.entries(propertyChanges).forEach(([originalKey, change]) => {
      const parts: string[] = [];
      
      if (change.key) {
        parts.push(`renamed key: ${change.key}`);
      }
      if (change.description) {
        parts.push(`updated description: ${change.description}`);
      }
      if (change.environments.length > 0) {
        parts.push(`modified values in: ${change.environments.join(', ')}`);
      }
      
      if (parts.length > 0) {
        changeSummary.push(`Property '${originalKey}': ${parts.join(', ')}`);
      }
    });
    
    return changeSummary.length > 0 
      ? `Batch update: ${changeSummary.join('; ')}`
      : 'Batch property updates';
  };

  const handleSave = () => {
    if (!onBatchSave) return;
    
    const changes: Property[] = [];
    
    // Add pending properties to changes
    changes.push(...pendingProperties);
    
    Object.entries(editedRows).forEach(([rowId, editedRow]) => {
      const originalRow = originalData.find(row => row.id === rowId);
      if (!originalRow) return;
      
      // Check for key and description changes
      const keyChanged = editedRow.key !== originalRow.key;
      const descriptionChanged = editedRow.description !== originalRow.description;
      
      // Check for value changes in each environment
      environments.forEach(env => {
        const originalValue = originalRow[env];
        const newValue = editedRow[env];
        const valueChanged = originalValue !== newValue;
        
        if (keyChanged || descriptionChanged || valueChanged) {
          const existingProperty = properties.find(p => p.key === originalRow.key && p.environment === env);
          if (existingProperty) {
            changes.push({
              ...existingProperty,
              key: editedRow.key,
              value: newValue || '',
              description: editedRow.description,
              lastModified: new Date()
            });
          } else if (newValue) {
            // Create new property if it doesn't exist but has a value
            changes.push({
              id: `${env}_${editedRow.key}`,
              environment: env,
              key: editedRow.key,
              value: newValue,
              description: editedRow.description,
              component: editedRow.component,
              lastModified: new Date()
            });
          }
        }
      });
    });
    
    // Generate default comment and show dialog
    const defaultComment = generateChangeDetails(changes);
    setChangeComment(defaultComment);
    setPendingChanges(changes);
    setCommentDialogOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!onBatchSave) return;
    
    try {
      setSaving(true);
      await onBatchSave(pendingChanges, deletingProperties, changeComment);
      setEditedRows({});
      setHasChanges(false);
      setCommentDialogOpen(false);
      setChangeComment('');
      setPendingChanges([]);
      setPendingProperties([]); // Clear pending properties after save
      setDeletingProperties([]); // Clear deleting properties after save
    } catch (error) {
      console.error('Save failed:', error);
      // Keep dialog open on error so user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSave = () => {
    setCommentDialogOpen(false);
    setChangeComment('');
    setPendingChanges([]);
  };

  const handleCancel = () => {
    setEditedRows({});
    setHasChanges(false);
    setPendingProperties([]); // Clear pending properties on cancel
    setDeletingProperties([]); // Clear deleting properties on cancel
  };

  const getCellClassName = (params: GridCellParams) => {
    const { id, field } = params;
    const currentRow = allDisplayData.find(row => row.id === id);
    
    // Check if this specific property (key + environment combination) is marked for deletion
    if (environments.includes(field)) {
      // This is an environment column - check if this specific property is marked for deletion
      const isMarkedForDeletion = deletingProperties.some(delProp => 
        delProp.key === currentRow?.key && delProp.environment === field
      );
      if (isMarkedForDeletion) {
        return 'deleting-cell';
      }
    } else {
      // For non-environment columns (key, description, component, etc.)
      // Only show deletion styling if ALL environments for this property key are being deleted
      // (i.e., the entire property is being removed)
      if (currentRow?.key) {
        const propertyEnvironments = properties
          .filter(p => p.key === currentRow.key)
          .map(p => p.environment);
        
        const deletingEnvironments = deletingProperties
          .filter(delProp => delProp.key === currentRow.key)
          .map(delProp => delProp.environment);
        
        // Show deletion styling only if all environments for this key are being deleted
        const allEnvironmentsDeleting = propertyEnvironments.length > 0 && 
          propertyEnvironments.every(env => deletingEnvironments.includes(env));
        
        if (allEnvironmentsDeleting) {
          return 'deleting-cell';
        }
      }
    }
    
    // Check if this is a pending property
    if (currentRow?.isPending) {
      return 'pending-cell';
    }
    
    const editedRow = editedRows[id as string];
    if (!editedRow) return '';
    
    const originalRow = originalData.find(row => row.id === id);
    if (!originalRow) return '';
    
    const originalValue = originalRow[field as keyof GroupedProperty];
    const editedValue = editedRow[field as keyof GroupedProperty];
    
    // Handle undefined values - treat empty string and undefined as different
    if (originalValue !== editedValue) {
      return 'edited-cell';
    }
    return '';
  };

  const renderCellWithDiff = (params: any, isEnvironmentColumn = false) => {
    const { id, field, value, api } = params;
    const editedRow = editedRows[id as string];
    const originalRow = originalData.find(row => row.id === id);
    
    const handleDoubleClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      // Trigger edit mode
      api.startCellEditMode({ id, field });
    };
    
    if (!editedRow || !originalRow) {
      const displayValue = value === '***' ? '•••' : value || (isEnvironmentColumn ? '—' : '');
      return (
        <div 
          style={{ 
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: '1.5',
            width: '100%',
            overflow: 'visible',
            cursor: 'pointer'
          }}
          onDoubleClick={handleDoubleClick}
        >
          {displayValue}
        </div>
      );
    }
    
    const originalValue = originalRow[field as keyof GroupedProperty];
    const editedValue = editedRow[field as keyof GroupedProperty];
    
    // If values are the same, show normal display
    if (originalValue === editedValue) {
      const displayValue = value === '***' ? '•••' : value || (isEnvironmentColumn ? '—' : '');
      return (
        <div 
          style={{ 
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: '1.5',
            width: '100%',
            overflow: 'visible',
            cursor: 'pointer'
          }}
          onDoubleClick={handleDoubleClick}
        >
          {displayValue}
        </div>
      );
    }
    
    // Show diff view for changed values
    const oldValue = originalValue === '***' ? '•••' : originalValue || (isEnvironmentColumn ? '—' : '');
    const newValue = editedValue === '***' ? '•••' : editedValue || (isEnvironmentColumn ? '—' : '');
    
    return (
      <div 
        style={{ 
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          lineHeight: '1.3',
          width: '100%',
          overflow: 'visible',
          fontSize: '12px',
          cursor: 'pointer'
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Old value (deletion) */}
        <div style={{
          backgroundColor: '#ffebee',
          color: '#d32f2f',
          padding: '2px 4px',
          marginBottom: '2px',
          borderLeft: '3px solid #f44336',
          textDecoration: 'line-through'
        }}>
          - {oldValue}
        </div>
        {/* New value (addition) */}
        <div style={{
          backgroundColor: '#e8f5e8',
          color: '#2e7d32',
          padding: '2px 4px',
          borderLeft: '3px solid #4caf50'
        }}>
          + {newValue}
        </div>
      </div>
    );
  };


  const columns: GridColDef[] = React.useMemo(() => {
    const staticColumns: GridColDef[] = [
      {
        field: 'no',
        headerName: 'No',
        width: 60,
        sortable: false,
        renderCell: (params) => {
          const rowIndex = displayData.findIndex(row => row.id === params.id);
          const globalIndex = showAllRows ? rowIndex : (currentPage * ROWS_PER_PAGE) + rowIndex;
          return globalIndex + 1;
        }
      },
      { 
        field: 'component', 
        headerName: 'Component', 
        width: 120,
        renderCell: (params) => {
          const fileMap: Record<string, string> = {
            env: 'env',
            app: 'app-properties',
            mail: 'mail',
            'mylist-app': 'mylist-app',
            'mylist-env': 'mylist-env',
            url: 'url',
            f4batch: 'f4batch',
            fax: 'fax-properties',
            gsearch: 'gsearch',
            'monitoring-env': 'monitoring-env'
          };
          return fileMap[params.value] || params.value || 'env';
        }
      },
      { 
        field: 'key', 
        headerName: 'Key', 
        width: 200,
        editable: true,
        cellClassName: getCellClassName,
        renderCell: (params) => renderCellWithDiff(params, false),
        renderEditCell: (params) => <CustomEditInputCell {...params} />
      },
      { 
        field: 'description', 
        headerName: 'Description', 
        width: 250,
        editable: true,
        cellClassName: getCellClassName,
        renderCell: (params) => renderCellWithDiff(params, false),
        renderEditCell: (params) => <CustomEditInputCell {...params} />
      }
    ];

    // Add dynamic environment columns
    const environmentColumns: GridColDef[] = environments.map(env => ({
      field: env,
      headerName: env,
      width: 150,
      editable: true,
      cellClassName: getCellClassName,
      renderCell: (params) => renderCellWithDiff(params, true),
      renderEditCell: (params) => <CustomEditInputCell {...params} />,
      renderHeader: () => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Typography variant="inherit" noWrap>
            {env}
          </Typography>
          {onRemoveEnvironment && selectedComponent !== 'all' && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Mark environment "${env}" for removal from component "${selectedComponent}"? Properties will be marked for deletion and you can save changes to commit.`)) {
                  onRemoveEnvironment(env, selectedComponent);
                }
              }}
              sx={{ 
                ml: 1, 
                color: 'error.main',
                '&:hover': { backgroundColor: 'error.light', color: 'white' }
              }}
              title={`Remove environment "${env}"`}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )
    }));

    const endColumns: GridColDef[] = [
      { 
        field: 'lastModified', 
        headerName: 'Last Modified', 
        width: 180,
        valueFormatter: (params) => {
          if (params.value) {
            return new Date(params.value).toLocaleString();
          }
          return '';
        }
      },
      {
        field: 'actions',
        type: 'actions',
        headerName: 'Actions',
        width: 70,
        getActions: (params) => {
          return [
            <GridActionsCellItem
              icon={<DeleteIcon />}
              label="Delete"
              onClick={() => {
                if (confirm('Are you sure you want to delete this property from all environments?')) {
                  // Delete all properties with this key
                  const propertiesToDelete = properties.filter(p => p.key === params.row.key);
                  propertiesToDelete.forEach(p => onDelete(p.id));
                }
              }}
            />
          ];
        }
      }
    ];

    return [...staticColumns, ...environmentColumns, ...endColumns];
  }, [environments, displayData, properties, onEdit, onDelete, onRemoveEnvironment, selectedComponent]);

  return (
    <Box>
      {/* Save/Cancel Buttons Row */}
      {hasChanges && (
        <Box sx={{ mb: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #dee2e6' }}>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            You have unsaved changes. Please save or cancel your modifications.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button 
              variant="outlined" 
              color="secondary" 
              startIcon={<CancelIcon />}
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {/* Row Display Controls */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={showAllRows}
                onChange={(e) => {
                  setShowAllRows(e.target.checked);
                  if (e.target.checked) {
                    setCurrentPage(0);
                  }
                }}
              />
            }
            label={`Show all ${allDisplayData.length} rows (may be slow)`}
          />
          {!showAllRows && (
            <Typography variant="body2" color="text.secondary">
              Showing {displayData.length} of {allDisplayData.length} rows
            </Typography>
          )}
        </Box>
        
        {!showAllRows && totalPages > 1 && (
          <Pagination
            count={totalPages}
            page={currentPage + 1}
            onChange={(_, page) => setCurrentPage(page - 1)}
            color="primary"
            showFirstButton
            showLastButton
          />
        )}
      </Box>

      {/* Data Grid */}
      <Box sx={{ 
        width: '100%', 
        position: 'relative'
      }}>
        <DataGrid
          rows={displayData}
          columns={columns}
          processRowUpdate={handleCellEdit}
          onProcessRowUpdateError={(error) => console.error(error)}
          hideFooterPagination
          hideFooter
          autoHeight={showAllRows}
          getRowHeight={() => 'auto'}
          disableVirtualization={showAllRows}
          disableRowSelectionOnClick
          disableColumnFilter
          disableColumnSelector
          disableDensitySelector
          disableColumnMenu
        initialState={{
          columns: {
            columnVisibilityModel: {},
          },
        }}
        sx={{
          // Fix header to be sticky on vertical scroll
          '& .MuiDataGrid-main': {
            overflow: 'unset',
          },
          '& .MuiDataGrid-columnHeaders': {
            position: 'sticky',
            top: 0,
            zIndex: 1000,
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid rgba(224, 224, 224, 1)',
          },
          '& .MuiDataGrid-virtualScroller': {
            marginTop: '0px !important',
          },
          '& .MuiDataGrid-virtualScrollerContent': {
            paddingTop: '0px !important',
          },
          // Make first 4 columns sticky (No, Component, Key, Description)
          '& .MuiDataGrid-columnHeader:nth-of-type(1)': {
            position: 'sticky !important',
            left: '0px !important',
            zIndex: 1001,
            backgroundColor: '#f5f5f5',
          },
          '& .MuiDataGrid-cell:nth-of-type(1)': {
            position: 'sticky !important',
            left: '0px !important',
            zIndex: 999,
            backgroundColor: '#ffffff',
          },
          '& .MuiDataGrid-columnHeader:nth-of-type(2)': {
            position: 'sticky !important',
            left: '60px !important',
            zIndex: 1001,
            backgroundColor: '#f5f5f5',
          },
          '& .MuiDataGrid-cell:nth-of-type(2)': {
            position: 'sticky !important',
            left: '60px !important',
            zIndex: 999,
            backgroundColor: '#ffffff',
          },
          '& .MuiDataGrid-columnHeader:nth-of-type(3)': {
            position: 'sticky !important',
            left: '180px !important',
            zIndex: 1001,
            backgroundColor: '#f5f5f5',
          },
          '& .MuiDataGrid-cell:nth-of-type(3)': {
            position: 'sticky !important',
            left: '180px !important',
            zIndex: 999,
            backgroundColor: '#ffffff',
          },
          '& .MuiDataGrid-columnHeader:nth-of-type(4)': {
            position: 'sticky !important',
            left: '380px !important',
            zIndex: 1001,
            backgroundColor: '#f5f5f5',
            boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)',
          },
          '& .MuiDataGrid-cell:nth-of-type(4)': {
            position: 'sticky !important',
            left: '380px !important',
            zIndex: 999,
            backgroundColor: '#ffffff',
            boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)',
          },
          '& .MuiDataGrid-cell': {
            borderRight: '1px solid rgba(224, 224, 224, 1)',
            overflow: 'visible',
            padding: '4px',
            '&.edited-cell': {
              backgroundColor: '#f8f9fa !important',
              border: '2px solid #007bff !important',
              '&:hover': {
                backgroundColor: '#e9ecef !important',
              }
            },
            '&.pending-cell': {
              backgroundColor: '#e8f5e8 !important',
              border: '2px solid #4caf50 !important',
              '&:hover': {
                backgroundColor: '#c8e6c9 !important',
              }
            },
            '&.deleting-cell': {
              backgroundColor: '#ffebee !important',
              border: '2px solid #f44336 !important',
              textDecoration: 'line-through',
              opacity: 0.7,
              '&:hover': {
                backgroundColor: '#ffcdd2 !important',
              }
            }
          },
          '& .MuiDataGrid-row': {
            maxHeight: 'none !important',
          },
          '& .MuiDataGrid-renderingZone': {
            maxHeight: 'none !important',
          },
          '& .MuiDataGrid-virtualScrollerRenderZone': {
            position: 'relative !important',
            height: 'auto !important',
          },
          '& .MuiDataGrid-cell--textLeft': {
            overflow: 'visible',
          },
          '& .MuiDataGrid-editInputCell': {
            overflow: 'visible',
            '& .MuiInputBase-root': {
              height: 'auto',
              '& textarea, & input': {
                resize: 'vertical',
                overflow: 'auto',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                minHeight: '36px',
                padding: '8px',
              }
            }
          },
        }}
        />
      </Box>

      {/* Comment Dialog */}
      <Dialog 
        open={commentDialogOpen} 
        onClose={saving ? undefined : handleCancelSave} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Add Comment for Changes</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Change Comment"
            multiline
            rows={4}
            fullWidth
            variant="outlined"
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
            helperText="Describe the changes being made (auto-generated summary can be edited)"
            disabled={saving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelSave} disabled={saving}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmSave} 
            variant="contained" 
            color="primary"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : null}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

