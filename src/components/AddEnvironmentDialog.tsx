import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert
} from '@mui/material';
import { Property } from '../models/Property';

interface AddEnvironmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (environmentName: string, sourceEnvironment: string | null) => void;
  properties: Property[];
  selectedComponent: string;
}

export const AddEnvironmentDialog: React.FC<AddEnvironmentDialogProps> = ({
  open,
  onClose,
  onSave,
  properties,
  selectedComponent
}) => {
  const [environmentName, setEnvironmentName] = useState('');
  const [sourceEnvironment, setSourceEnvironment] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    // Validate environment name
    if (!environmentName.trim()) {
      setError('Environment name is required');
      return;
    }

    onSave(environmentName.trim(), sourceEnvironment || null);
    handleClose();
  };

  const handleClose = () => {
    setEnvironmentName('');
    setSourceEnvironment('');
    setError(null);
    onClose();
  };

  // Get component-specific properties and keys
  const componentProperties = properties.filter(p => p.component === selectedComponent);
  const uniqueKeys = Array.from(new Set(componentProperties.map(p => p.key)));
  
  // Get environments that exist for this component
  const componentEnvironments = Array.from(new Set(componentProperties.map(p => p.environment)));
  
  const sourceProps = sourceEnvironment 
    ? componentProperties.filter(p => p.environment === sourceEnvironment)
    : [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Environment for "{selectedComponent}"</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box sx={{ p: 2, bgcolor: '#e3f2fd', borderRadius: 1 }}>
            <Typography variant="body2" color="primary">
              Adding environment for component: <strong>{selectedComponent}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Will create {uniqueKeys.length} properties for this component only
            </Typography>
          </Box>

          <TextField
            autoFocus
            label="Environment Name"
            value={environmentName}
            onChange={(e) => setEnvironmentName(e.target.value)}
            fullWidth
            placeholder="e.g., staging, production, test"
            helperText="Enter a unique name for the new environment"
          />

          <FormControl fullWidth>
            <InputLabel>Copy Properties From (Optional)</InputLabel>
            <Select
              value={sourceEnvironment}
              onChange={(e) => setSourceEnvironment(e.target.value)}
              label="Copy Properties From (Optional)"
            >
              <MenuItem value="">
                <em>Create empty environment</em>
              </MenuItem>
              {componentEnvironments.map((env) => {
                const envProps = componentProperties.filter(p => p.environment === env);
                return (
                  <MenuItem key={env} value={env}>
                    {env} ({envProps.length} properties)
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {sourceEnvironment && (
            <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Will copy {sourceProps.length} properties from "{sourceEnvironment}" environment.
                {uniqueKeys.length > sourceProps.length && (
                  <> Missing properties will be created with empty values.</>
                )}
              </Typography>
            </Box>
          )}

          {!sourceEnvironment && (
            <Box sx={{ p: 2, bgcolor: '#fff3cd', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Will create {uniqueKeys.length} empty properties for the new environment.
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={!environmentName.trim()}
        >
          Add Environment
        </Button>
      </DialogActions>
    </Dialog>
  );
};