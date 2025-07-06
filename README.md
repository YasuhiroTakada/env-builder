# Environment Properties Manager

A browser-based tool for managing configuration properties across multiple environments with DuckDB-WASM for Parquet file handling.

## Features

- **Multi-Environment Support**: Manage properties for batch, f4batch, index, and webapp environments
- **CRUD Operations**: Add, edit, and delete properties with ease
- **Environment Duplication**: Clone all properties from one environment to another
- **Encrypted Export**: Export properties as encrypted Parquet files using AES-256
- **Import/Export**: Support for both encrypted and plain Parquet files
- **Search & Filter**: Quick property lookup across environments
- **DuckDB-WASM**: Powerful SQL capabilities for data manipulation

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Usage

### Adding Properties
- Click "Add Property" button
- Select environment, enter key and value
- Optional: Add description for documentation

### Editing Properties
- Click edit icon in the property grid
- Modify value and description (environment and key are immutable)

### Duplicating Environments
- Click "Duplicate Environment" button
- Select source environment and enter new environment name
- All properties will be copied to the new environment

### Exporting Data
- Click "Export" button
- Enter encryption password
- Download encrypted `.parquet.enc` file

### Importing Data
- Click "Import" button
- Select `.parquet` or `.parquet.enc` file
- For encrypted files, enter the password

## Security

- All encryption is performed client-side using WebCrypto API
- AES-256-GCM encryption with PBKDF2 key derivation
- No data is sent to any server

## Technology Stack

- **TypeScript** - Type-safe development
- **React** - UI framework
- **Material-UI** - Component library
- **DuckDB-WASM** - In-browser SQL database
- **Vite** - Build tool
- **WebCrypto API** - Encryption