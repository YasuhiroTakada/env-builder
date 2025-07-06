import React from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';

interface ComponentSelectorProps {
  components: string[];
  selected: string;
  onChange: (component: string) => void;
}

export const ComponentSelector: React.FC<ComponentSelectorProps> = ({
  components,
  selected,
  onChange
}) => {

  return (
    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
      <ToggleButtonGroup
        value={selected}
        exclusive
        onChange={(_, value) => value && onChange(value)}
        aria-label="component selector"
      >
        {components.map((comp) => (
          <ToggleButton key={comp} value={comp} aria-label={comp}>
            {comp.toUpperCase()}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};