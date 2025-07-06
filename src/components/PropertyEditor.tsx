import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Checkbox,
  FormControlLabel,
  Typography
} from '@mui/material';
import { Property } from '../models/Property';

interface PropertyEditorProps {
  open: boolean;
  property: Property | null;
  environments: string[];
  onSave: (properties: Property[]) => void; // Changed to handle multiple properties
  onClose: () => void;
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  open,
  property,
  environments,
  onSave,
  onClose
}) => {
  const [formData, setFormData] = useState({
    key: '',
    description: '',
    component: 'env',
    environmentValues: {} as Record<string, string>,
    applyToAll: false,
    globalValue: ''
  });

  useEffect(() => {
    if (property) {
      // For editing existing property - populate form with existing data
      setFormData({
        key: property.key,
        description: property.description || '',
        component: property.component,
        environmentValues: { [property.environment]: property.value },
        applyToAll: false,
        globalValue: property.value
      });
    } else {
      // For new property - reset form
      const initialEnvValues: Record<string, string> = {};
      environments.forEach(env => {
        initialEnvValues[env] = '';
      });
      
      setFormData({
        key: '',
        description: '',
        component: 'env',
        environmentValues: initialEnvValues,
        applyToAll: false,
        globalValue: ''
      });
    }
  }, [property, environments, open]);

  const handleEnvironmentValueChange = (env: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      environmentValues: {
        ...prev.environmentValues,
        [env]: value
      }
    }));
  };

  const handleApplyToAllChange = (checked: boolean) => {
    setFormData(prev => {
      if (checked) {
        // Apply global value to all environments
        const newEnvValues: Record<string, string> = {};
        environments.forEach(env => {
          newEnvValues[env] = prev.globalValue;
        });
        return {
          ...prev,
          applyToAll: checked,
          environmentValues: newEnvValues
        };
      } else {
        return {
          ...prev,
          applyToAll: checked
        };
      }
    });
  };

  const handleGlobalValueChange = (value: string) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        globalValue: value
      };
      
      if (prev.applyToAll) {
        // Update all environment values if apply to all is checked
        const newEnvValues: Record<string, string> = {};
        environments.forEach(env => {
          newEnvValues[env] = value;
        });
        newData.environmentValues = newEnvValues;
      }
      
      return newData;
    });
  };

  const handleSave = () => {
    if (!formData.key || !formData.description) {
      return;
    }

    const propertiesToSave: Property[] = [];
    
    if (property) {
      // Editing existing property - only save the single property
      const updatedProperty: Property = {
        ...property,
        key: formData.key,
        description: formData.description,
        component: formData.component,
        value: formData.environmentValues[property.environment] || '',
        lastModified: new Date()
      };
      propertiesToSave.push(updatedProperty);
    } else {
      // Creating new properties - create one for each environment with a value
      environments.forEach(env => {
        const value = formData.environmentValues[env];
        if (value) { // Only create properties for environments with values
          const newProperty: Property = {
            id: `${env}_${formData.key}`,
            environment: env,
            key: formData.key,
            value: value,
            description: formData.description,
            component: formData.component,
            lastModified: new Date()
          };
          propertiesToSave.push(newProperty);
        }
      });
    }

    onSave(propertiesToSave);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{property ? 'Edit Property' : 'Add New Property'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {/* Component selection at top */}
          <FormControl fullWidth>
            <InputLabel>Component File</InputLabel>
            <Select
              value={formData.component}
              onChange={(e) => setFormData({ ...formData, component: e.target.value })}
              label="Component File"
            >
              <MenuItem value="env">env.properties</MenuItem>
              <MenuItem value="app">app-properties.properties</MenuItem>
              <MenuItem value="mail">mail.properties</MenuItem>
              <MenuItem value="mylist-app">mylist-app.properties</MenuItem>
              <MenuItem value="mylist-env">mylist-env.properties</MenuItem>
              <MenuItem value="url">url.properties</MenuItem>
              <MenuItem value="f4batch">f4batch.properties</MenuItem>
              <MenuItem value="fax">fax-properties.properties</MenuItem>
              <MenuItem value="gsearch">gsearch.properties</MenuItem>
              <MenuItem value="monitoring-env">monitoring-env.properties</MenuItem>
            </Select>
          </FormControl>

          {/* Key field */}
          <TextField
            fullWidth
            label="Key"
            value={formData.key}
            onChange={(e) => setFormData({ ...formData, key: e.target.value })}
            disabled={!!property}
            placeholder="e.g., db.url, app.name"
            required
          />

          {/* Description field - required */}
          <TextField
            fullWidth
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this property"
            required
            error={!formData.description}
            helperText={!formData.description ? "Description is required" : ""}
          />

          {/* Apply to all environments checkbox and global value */}
          {!property && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.applyToAll}
                    onChange={(e) => handleApplyToAllChange(e.target.checked)}
                  />
                }
                label="Apply same value to all environments"
              />

              {formData.applyToAll && (
                <TextField
                  fullWidth
                  label="Value for all environments"
                  value={formData.globalValue}
                  onChange={(e) => handleGlobalValueChange(e.target.value)}
                  multiline
                  rows={2}
                  placeholder="This value will be applied to all environments"
                />
              )}
            </>
          )}

          {/* Environment-specific value fields */}
          {!formData.applyToAll && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Environment Values
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {environments.map((env) => (
                  <TextField
                    key={env}
                    fullWidth
                    label={`${env} Value`}
                    value={formData.environmentValues[env] || ''}
                    onChange={(e) => handleEnvironmentValueChange(env, e.target.value)}
                    multiline
                    rows={2}
                    placeholder={`Value for ${env} environment`}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* For editing existing property, show single value field */}
          {property && (
            <TextField
              fullWidth
              label={`Value for ${property.environment}`}
              value={formData.environmentValues[property.environment] || ''}
              onChange={(e) => handleEnvironmentValueChange(property.environment, e.target.value)}
              multiline
              rows={3}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!formData.key || !formData.description}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};