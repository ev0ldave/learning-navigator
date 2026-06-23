import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, List, ListItem, ListItemText,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Grid, Checkbox, FormControlLabel,
  Chip, OutlinedInput, IconButton, Tooltip
} from '@mui/material';
import { Add as AddIcon, Assessment as ReportIcon, Download as DownloadIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import { format, subMonths } from 'date-fns';
import { reportsAPI, usersAPI } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';

const Reports = () => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allStudents, setAllStudents] = useState(false);
  const [formData, setFormData] = useState({
    studentIds: [], startDate: subMonths(new Date(), 1), endDate: new Date(), type: 'individual_progress'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reportsRes, studentsRes] = await Promise.all([
        reportsAPI.getAll(),
        usersAPI.getMyStudents()
      ]);
      setReports(reportsRes.data.reports || []);
      setStudents(studentsRes.data.students || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const selectedIds = allStudents ? students.map(s => s._id) : formData.studentIds;
      
      if (selectedIds.length === 1) {
        // Single student - use individual report
        await reportsAPI.generateIndividual({
          studentId: selectedIds[0],
          startDate: formData.startDate.toISOString(),
          endDate: formData.endDate.toISOString()
        });
      } else {
        // Multiple students - use group report
        await reportsAPI.generateGroup({
          studentIds: selectedIds,
          startDate: formData.startDate.toISOString(),
          endDate: formData.endDate.toISOString()
        });
      }
      showSuccess('Report generated');
      setDialogOpen(false);
      setFormData({ ...formData, studentIds: [] });
      setAllStudents(false);
      fetchData();
    } catch (err) {
      showError('Failed to generate report');
    }
  };

  const handleExport = async (reportId, reportTitle) => {
    try {
      const response = await reportsAPI.export(reportId, 'pdf');
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = reportTitle.replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `${safeTitle}_${timestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showSuccess('Report exported as PDF');
    } catch (err) {
      showError('Failed to export report');
    }
  };

  const handleDelete = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this report?')) {
      return;
    }
    try {
      await reportsAPI.delete(reportId);
      showSuccess('Report deleted');
      fetchData();
    } catch (err) {
      showError('Failed to delete report');
    }
  };

  const handleStudentChange = (event) => {
    const value = event.target.value;
    setFormData({ ...formData, studentIds: typeof value === 'string' ? value.split(',') : value });
  };

  const canGenerate = allStudents ? students.length > 0 : formData.studentIds.length > 0;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h4">Reports</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Generate Report
        </Button>
      </Box>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : reports.length === 0 ? (
            <Box textAlign="center" py={4}>
              <ReportIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography color="text.secondary">No reports generated yet</Typography>
            </Box>
          ) : (
            <List>
              {reports.map(report => (
                <ListItem key={report._id} sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1 }}>
                  <ListItemText
                    primary={report.title}
                    secondary={`${report.type} • ${format(new Date(report.createdAt), 'MMM d, yyyy')}`}
                  />
                  <Button 
                    size="small" 
                    startIcon={<DownloadIcon />}
                    onClick={() => handleExport(report._id, report.title)}
                  >
                    Export
                  </Button>
                  <Tooltip title="Delete report">
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDelete(report._id)}
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Report</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allStudents}
                    onChange={(e) => {
                      setAllStudents(e.target.checked);
                      if (e.target.checked) {
                        setFormData({ ...formData, studentIds: [] });
                      }
                    }}
                  />
                }
                label="All Students"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth disabled={allStudents}>
                <InputLabel>Students</InputLabel>
                <Select
                  multiple
                  value={formData.studentIds}
                  onChange={handleStudentChange}
                  input={<OutlinedInput label="Students" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((id) => {
                        const student = students.find(s => s._id === id);
                        return student ? (
                          <Chip key={id} label={`${student.firstName} ${student.lastName}`} size="small" />
                        ) : null;
                      })}
                    </Box>
                  )}
                >
                  {students.map(s => (
                    <MenuItem key={s._id} value={s._id}>
                      <Checkbox checked={formData.studentIds.indexOf(s._id) > -1} />
                      {s.firstName} {s.lastName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <DatePicker
                label="Start Date"
                value={formData.startDate}
                onChange={(date) => setFormData({ ...formData, startDate: date })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={6}>
              <DatePicker
                label="End Date"
                value={formData.endDate}
                onChange={(date) => setFormData({ ...formData, endDate: date })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerate} variant="contained" disabled={!canGenerate}>
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reports;
