const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Endpoint to scan properties files from conf/production/batch
app.get('/api/scan-properties', async (req, res) => {
  try {
    const confPath = path.join(process.cwd(), 'conf', 'production', 'batch');
    const files = [];
    
    try {
      const dirContents = await fs.readdir(confPath);
      
      for (const file of dirContents) {
        if (file.endsWith('.properties')) {
          const filePath = path.join(confPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          files.push({
            path: filePath,
            filename: file,
            content: content
          });
        }
      }
    } catch (err) {
      console.error('Error reading directory:', err);
      // If directory doesn't exist, return empty array
      if (err.code === 'ENOENT') {
        return res.json({ files: [], message: 'Directory not found, using default properties' });
      }
      throw err;
    }
    
    res.json({ files });
  } catch (error) {
    console.error('Error scanning properties:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to load properties from all environments
app.get('/api/load-properties', async (req, res) => {
  try {
    const confPath = path.join(process.cwd(), 'conf');
    const properties = [];
    const environments = ['production', 'ST', 'A', 'C', 'sv2378', 'localhost'];
    
    for (const env of environments) {
      const envPath = path.join(confPath, env);
      
      try {
        const components = await fs.readdir(envPath);
        
        for (const component of components) {
          const componentPath = path.join(envPath, component);
          const stats = await fs.stat(componentPath);
          
          if (stats.isDirectory()) {
            const files = await fs.readdir(componentPath);
            
            for (const file of files) {
              if (file.endsWith('.properties')) {
                const filePath = path.join(componentPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                
                properties.push({
                  environment: env,
                  component: component,
                  filename: file,
                  content: content
                });
              }
            }
          }
        }
      } catch (err) {
        // Skip if environment directory doesn't exist
        if (err.code !== 'ENOENT') {
          console.error(`Error reading ${env}:`, err);
        }
      }
    }
    
    res.json({ properties });
  } catch (error) {
    console.error('Error loading properties:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create directory structure endpoint
app.post('/api/create-directories', async (req, res) => {
  try {
    const { environments, components } = req.body;
    const confPath = path.join(process.cwd(), 'conf');
    
    // Create conf directory if it doesn't exist
    await fs.mkdir(confPath, { recursive: true });
    
    // Create environment/component structure
    for (const env of environments) {
      for (const component of components) {
        const dirPath = path.join(confPath, env, component);
        await fs.mkdir(dirPath, { recursive: true });
      }
    }
    
    res.json({ success: true, message: 'Directories created successfully' });
  } catch (error) {
    console.error('Error creating directories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save properties to file
app.post('/api/save-properties', async (req, res) => {
  try {
    const { environment, component, filename, content } = req.body;
    const filePath = path.join(process.cwd(), 'conf', environment, component, filename);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, content, 'utf-8');
    
    res.json({ success: true, message: 'Properties saved successfully' });
  } catch (error) {
    console.error('Error saving properties:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create .data directory for database
app.post('/api/ensure-data-dir', async (req, res) => {
  try {
    const dataPath = path.join(process.cwd(), '.data');
    await fs.mkdir(dataPath, { recursive: true });
    res.json({ success: true, path: dataPath });
  } catch (error) {
    console.error('Error creating data directory:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});