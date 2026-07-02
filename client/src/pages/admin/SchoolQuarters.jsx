import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, IconButton, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel,
  Switch, CircularProgress, Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ActiveIcon
} from '@mui/icons-material';
import { adminAPI } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';

const QUARTER_OPTIONS = [
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' }
];

const SchoolQuarters = () => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [quarters, setQuarters] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuarter, setEditingQuarter] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [quarterToDelete, setQuarterToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    year: new Date().getFullYear(),
    quarter: 'fall',
    startDate: '',
    endDate: '',
    isActive: false
  });

  useEffect(() => {
    fetchQuarters();
  }, []);

  const fetchQuarters = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getQuarters();
      setQuarters(response.data.quarters || []);
    } catch (err) {
      console.error('Error fetching quarters:', err);
      showError('Failed to load school quarters');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (quarter = null) => {
    if (quarter) {
      setEditingQuarter(quarter);
      setFormData({
        name: quarter.name,
        year: quarter.year,
        quarter: quarter.quarter,
        startDate: quarter.startDate.split('T')[0],
        endDate: quarter.endDate.split('T')[0],
        isActive: quarter.isActive
      });
    } else {
      setEditingQuarter(null);
      setFormData({
        name: '',
        year: new Date().getFullYear(),
        quarter: 'fall',
        startDate: '',
        endDate: '',
        isActive: false
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingQuarter(null);
  };

  const handleSubmit = async () => {
    try {
      if (editingQuarter) {
        await adminAPI.updateQuarter(editingQuarter._id, formData);
        showSuccess('Quarter updated successfully');
      } else {
        await adminAPI.createQuarter(formData);
        showSuccess('Quarter created successfully');
      }
      handleCloseDialog();
      fetchQuarters();
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Operation failed';
      showError(message);
    }
  };

  const handleActivate = async (quarter) => {
    try {
      await adminAPI.activateQuarter(quarter._id);
      showSuccess(`${quarter.name} is now the active quarter`);
      fetchQuarters();
    } catch (err) {
      showError('Failed to activate quarter');
    }
  };

  const handleDeleteClick = (quarter) => {
    setQuarterToDelete(quarter);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await adminAPI.deleteQuarter(quarterToDelete._id);
      showSuccess('Quarter deleted successfully');
      setDeleteConfirmOpen(false);
      setQuarterToDelete(null);
      fetchQuarters();
    } catch (err) {
      showError('Failed to delete quarter');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">School Quarters</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Quarter
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        School quarters define the scheduling boundaries. Meetings cannot be scheduled outside the active quarter dates.
        Recurring meetings will automatically stop at the quarter end date.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Year</TableCell>
              <TableCell>Quarter</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>End Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quarters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No school quarters defined. Add one to enable date restrictions.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              quarters.map((quarter) => (
                <TableRow key={quarter._id} sx={{ bgcolor: quarter.isActive ? 'action.selected' : 'inherit' }}>
                  <TableCell>
                    <Typography fontWeight={quarter.isActive ? 600 : 400}>
                      {quarter.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{quarter.year}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{quarter.quarter}</TableCell>
                  <TableCell>{formatDate(quarter.startDate)}</TableCell>
                  <TableCell>{formatDate(quarter.endDate)}</TableCell>
                  <TableCell>
                    {quarter.isActive ? (
                      <Chip icon={<ActiveIcon />} label="Active" color="success" size="small" />
                    ) : (
                      <Chip label="Inactive" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!quarter.isActive && (
                      <Button
                        size="small"
                        onClick={() => handleActivate(quarter)}
                        sx={{ mr: 1 }}
                      >
                        Activate
                      </Button>
                    )}
                    <IconButton size="small" onClick={() => handleOpenDialog(quarter)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDeleteClick(quarter)} color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingQuarter ? 'Edit Quarter' : 'Add New Quarter'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Quarter Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Fall 2026"
            />
            <Box display="flex" gap={2}>
              <TextField
                label="Year"
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Quarter"
                select
                value={formData.quarter}
                onChange={(e) => setFormData({ ...formData, quarter: e.target.value })}
                sx={{ flex: 1 }}
              >
                {QUARTER_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box display="flex" gap={2}>
              <TextField
                label="Start Date"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="End Date"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              }
              label="Set as active quarter"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.name || !formData.startDate || !formData.endDate}
          >
            {editingQuarter ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Quarter?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{quarterToDelete?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SchoolQuarters;
