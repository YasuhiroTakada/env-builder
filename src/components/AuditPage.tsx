import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  TextField,
  InputAdornment,
  Pagination,
  Card,
  CardContent,
  Grid
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Restore as RestoreIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { AuditLog, AuditLogEntry } from '../models/AuditLog';
import { Property } from '../models/Property';
import { DuckDBService } from '../services/DuckDBService';
import { AuditService } from '../services/AuditService';

interface AuditPageProps {
  dbService: DuckDBService | null;
  onBack: () => void;
  onRestore: (properties: Property[], deletions?: Property[]) => void;
}

export const AuditPage: React.FC<AuditPageProps> = ({ dbService, onBack, onRestore }) => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [stats, setStats] = useState<{
    totalLogs: number;
    totalActions: { action: string; count: number }[];
    recentActivity: AuditLog[];
  } | null>(null);

  const LOGS_PER_PAGE = 50;

  useEffect(() => {
    loadAuditLogs();
    loadStats();
  }, [page, searchTerm]);

  const loadAuditLogs = async () => {
    if (!dbService) return;

    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * LOGS_PER_PAGE;
      const logs = await dbService.queryAuditLogs(LOGS_PER_PAGE, offset);
      
      // Filter by search term if provided
      const filteredLogs = searchTerm
        ? logs.filter(log => 
            log.propertyKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.environment.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.component.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.changeDetails.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : logs;

      // Add restore capability info
      const logsWithRestore: AuditLogEntry[] = filteredLogs.map(log => ({
        ...log,
        canRestore: log.action === 'UPDATE' || log.action === 'DELETE' || log.action === 'CREATE' || log.action === 'BATCH'
      }));

      setAuditLogs(logsWithRestore);
      
      // Calculate total pages (this is simplified - in real app, you'd get total count from DB)
      setTotalPages(Math.ceil(logs.length / LOGS_PER_PAGE));
    } catch (err) {
      setError('Failed to load audit logs: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!dbService) return;

    try {
      const statsData = await dbService.getAuditLogStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load audit stats:', err);
    }
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };

  const handleRestoreClick = (log: AuditLog) => {
    setSelectedLog(log);
    setRestoreDialogOpen(true);
  };

  const handleRestore = async () => {
    if (!selectedLog || !dbService) return;

    try {
      if (selectedLog.action === 'BATCH') {
        // For BATCH operations, parse the stored batch data and reverse all operations
        try {
          const batchData = JSON.parse(selectedLog.newValue || '{}');
          const restoredProperties: Property[] = [];
          const deletedProperties: Property[] = [];

          // Reverse changes (restore to original values)
          if (batchData.changes) {
            batchData.changes.forEach((change: any) => {
              if (change.originalProperty) {
                // This was an update - restore original
                restoredProperties.push({
                  ...change.originalProperty,
                  lastModified: new Date()
                });
              } else {
                // This was a create - delete it
                deletedProperties.push(change.property);
              }
            });
          }

          // Reverse deletions (restore deleted properties)
          if (batchData.deletions) {
            batchData.deletions.forEach((deletion: Property) => {
              restoredProperties.push({
                ...deletion,
                lastModified: new Date()
              });
            });
          }

          // Create batch restore audit log
          const restoreAuditLog = AuditService.createAuditLog(
            'RESTORE',
            restoredProperties[0] || deletedProperties[0] || { 
              id: 'batch_restore',
              key: 'batch_restore',
              environment: 'multiple',
              component: 'multiple',
              value: '',
              description: '',
              lastModified: new Date()
            },
            undefined,
            `Restored batch operation from audit log: ${selectedLog.id} (${restoredProperties.length} restored, ${deletedProperties.length} deleted)`
          );

          // Save audit log
          await dbService.insertAuditLog(restoreAuditLog);

          // Call parent restore handler
          onRestore(restoredProperties, deletedProperties);

          setRestoreDialogOpen(false);
          setSelectedLog(null);
          
          // Reload logs to show the restore action
          loadAuditLogs();
        } catch (parseErr) {
          setError('Failed to parse batch operation data: ' + parseErr);
        }
      } else if (selectedLog.action === 'CREATE') {
        // For CREATE operations, "restore" means deleting the created property
        const propertyToDelete: Property = {
          id: selectedLog.recordId,
          key: selectedLog.propertyKey,
          environment: selectedLog.environment,
          component: selectedLog.component,
          value: selectedLog.newValue || '',
          description: selectedLog.newDescription || '',
          lastModified: new Date()
        };

        // Create restore audit log for deletion
        const restoreAuditLog = AuditService.createAuditLog(
          'DELETE',
          propertyToDelete,
          undefined,
          `Restored (deleted) property created in audit log: ${selectedLog.id}`
        );

        // Save audit log
        await dbService.insertAuditLog(restoreAuditLog);

        // Call parent restore handler with deletion
        onRestore([], [propertyToDelete]);

        setRestoreDialogOpen(false);
        setSelectedLog(null);
        
        // Reload logs to show the restore action
        loadAuditLogs();
      } else {
        // For UPDATE/DELETE operations, restore to previous state
        const restoredProperty: Property = {
          id: selectedLog.recordId,
          key: selectedLog.propertyKey,
          environment: selectedLog.environment,
          component: selectedLog.component,
          value: selectedLog.oldValue || '',
          description: selectedLog.oldDescription || '',
          lastModified: new Date()
        };

        // Create restore audit log
        const restoreAuditLog = AuditService.createAuditLog(
          'RESTORE',
          restoredProperty,
          undefined,
          `Restored from audit log: ${selectedLog.id}`
        );

        // Save audit log
        await dbService.insertAuditLog(restoreAuditLog);

        // Call parent restore handler
        onRestore([restoredProperty]);

        setRestoreDialogOpen(false);
        setSelectedLog(null);
        
        // Reload logs to show the restore action
        loadAuditLogs();
      }
    } catch (err) {
      setError('Failed to restore property: ' + err);
    }
  };

  const getActionColor = (action: string): 'success' | 'warning' | 'error' | 'info' => {
    switch (action) {
      case 'CREATE': return 'success';
      case 'UPDATE': return 'warning';
      case 'DELETE': return 'error';
      case 'RESTORE': return 'info';
      case 'BATCH': return 'info';
      default: return 'info';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleString();
  };

  if (loading) {
    return (
      <Container>
        <Typography>Loading audit logs...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Audit Logs
        </Typography>
        <Button
          startIcon={<DownloadIcon />}
          variant="outlined"
          onClick={() => {
            // TODO: Implement audit log export
            console.log('Export audit logs');
          }}
        >
          Export Logs
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="textSecondary">
                  Total Logs
                </Typography>
                <Typography variant="h4">
                  {stats.totalLogs}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={9}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="textSecondary" sx={{ mb: 2 }}>
                  Actions Overview
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {stats.totalActions.map(({ action, count }) => (
                    <Chip
                      key={action}
                      label={`${action}: ${count}`}
                      color={getActionColor(action)}
                      variant="outlined"
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Search */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search by property key, environment, component, or change details..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Audit Logs Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Property</TableCell>
                <TableCell>Environment</TableCell>
                <TableCell>Component</TableCell>
                <TableCell>Change Details</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.action}
                      color={getActionColor(log.action)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {log.propertyKey}
                    </Typography>
                  </TableCell>
                  <TableCell>{log.environment}</TableCell>
                  <TableCell>{log.component}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 300 }}>
                      {log.changeDetails}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(log)}
                        title="View Details"
                      >
                        <VisibilityIcon />
                      </IconButton>
                      {log.canRestore && (
                        <IconButton
                          size="small"
                          onClick={() => handleRestoreClick(log)}
                          title="Restore to this state"
                          color="primary"
                        >
                          <RestoreIcon />
                        </IconButton>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      </Paper>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Audit Log Details</DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography><strong>ID:</strong> {selectedLog.id}</Typography>
              <Typography><strong>Timestamp:</strong> {formatTimestamp(selectedLog.timestamp)}</Typography>
              <Typography><strong>Action:</strong> <Chip label={selectedLog.action} color={getActionColor(selectedLog.action)} size="small" /></Typography>
              <Typography><strong>Property:</strong> {selectedLog.propertyKey}</Typography>
              <Typography><strong>Environment:</strong> {selectedLog.environment}</Typography>
              <Typography><strong>Component:</strong> {selectedLog.component}</Typography>
              <Typography><strong>Session ID:</strong> {selectedLog.sessionId}</Typography>
              
              {selectedLog.oldValue && (
                <Box>
                  <Typography><strong>Old Value:</strong></Typography>
                  <Paper sx={{ p: 1, bgcolor: '#ffebee' }}>
                    <Typography variant="body2">{selectedLog.oldValue}</Typography>
                  </Paper>
                </Box>
              )}
              
              {selectedLog.newValue && (
                <Box>
                  <Typography><strong>New Value:</strong></Typography>
                  <Paper sx={{ p: 1, bgcolor: '#e8f5e8' }}>
                    <Typography variant="body2">{selectedLog.newValue}</Typography>
                  </Paper>
                </Box>
              )}
              
              {selectedLog.oldDescription && (
                <Box>
                  <Typography><strong>Old Description:</strong></Typography>
                  <Paper sx={{ p: 1, bgcolor: '#ffebee' }}>
                    <Typography variant="body2">{selectedLog.oldDescription}</Typography>
                  </Paper>
                </Box>
              )}
              
              {selectedLog.newDescription && (
                <Box>
                  <Typography><strong>New Description:</strong></Typography>
                  <Paper sx={{ p: 1, bgcolor: '#e8f5e8' }}>
                    <Typography variant="body2">{selectedLog.newDescription}</Typography>
                  </Paper>
                </Box>
              )}
              
              <Typography><strong>Change Details:</strong> {selectedLog.changeDetails}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle>
          {selectedLog?.action === 'CREATE' ? 'Confirm Deletion' : 
           selectedLog?.action === 'BATCH' ? 'Confirm Batch Restore' : 'Confirm Restore'}
        </DialogTitle>
        <DialogContent>
          {selectedLog?.action === 'BATCH' ? (
            <Box>
              <Typography>
                Are you sure you want to restore this batch operation? This will reverse all operations performed in the batch.
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Batch operation details:</strong>
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {selectedLog.changeDetails}
                </Typography>
                {(() => {
                  try {
                    const batchData = JSON.parse(selectedLog.newValue || '{}');
                    const updateCount = batchData.changes?.filter((c: any) => c.originalProperty).length || 0;
                    const createCount = batchData.changes?.filter((c: any) => !c.originalProperty).length || 0;
                    const deleteCount = batchData.deletions?.length || 0;
                    
                    return (
                      <Box sx={{ mt: 1 }}>
                        {updateCount > 0 && (
                          <Typography variant="body2" color="warning.main">
                            • {updateCount} updated properties will be reverted to original values
                          </Typography>
                        )}
                        {createCount > 0 && (
                          <Typography variant="body2" color="error.main">
                            • {createCount} created properties will be deleted
                          </Typography>
                        )}
                        {deleteCount > 0 && (
                          <Typography variant="body2" color="success.main">
                            • {deleteCount} deleted properties will be restored
                          </Typography>
                        )}
                      </Box>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </Box>
            </Box>
          ) : selectedLog?.action === 'CREATE' ? (
            <Typography>
              Are you sure you want to delete the property "{selectedLog?.propertyKey}" 
              in environment "{selectedLog?.environment}"? This will reverse the creation operation.
            </Typography>
          ) : (
            <Typography>
              Are you sure you want to restore the property "{selectedLog?.propertyKey}" 
              in environment "{selectedLog?.environment}" to its previous state?
            </Typography>
          )}
          
          {selectedLog?.action === 'CREATE' && selectedLog?.newValue && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2"><strong>Will delete property with value:</strong></Typography>
              <Paper sx={{ p: 1, bgcolor: '#ffebee', mt: 1 }}>
                <Typography variant="body2">{selectedLog.newValue}</Typography>
              </Paper>
            </Box>
          )}
          
          {selectedLog?.action !== 'CREATE' && selectedLog?.action !== 'BATCH' && selectedLog?.oldValue && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2"><strong>Will restore to:</strong></Typography>
              <Paper sx={{ p: 1, bgcolor: '#e8f5e8', mt: 1 }}>
                <Typography variant="body2">{selectedLog.oldValue}</Typography>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleRestore} 
            variant="contained" 
            color={selectedLog?.action === 'CREATE' ? 'error' : 'primary'}
          >
            {selectedLog?.action === 'CREATE' ? 'Delete Property' : 
             selectedLog?.action === 'BATCH' ? 'Restore Batch' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};