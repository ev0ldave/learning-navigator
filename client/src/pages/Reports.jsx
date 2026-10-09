import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, List, ListItem, ListItemText,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Grid, Checkbox, FormControlLabel,
  Chip, OutlinedInput, IconButton, Tooltip, Accordion, AccordionSummary,
  AccordionDetails, FormGroup, Divider, Paper, Switch, Alert, Menu, ListItemIcon
} from '@mui/material';
import { 
  Add as AddIcon, Assessment as ReportIcon, Download as DownloadIcon, 
  Delete as DeleteIcon, ExpandMore as ExpandMoreIcon, TuneOutlined as TuneIcon,
  BarChart as ChartIcon, Schedule as TimeIcon, Group as GroupIcon,
  TrendingUp as TrendIcon, Visibility as ViewIcon, PictureAsPdf as PdfIcon,
  GridOn as ExcelIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import { format, subMonths } from 'date-fns';
import { reportsAPI, usersAPI } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';
import ReportDashboard from '../components/reports/ReportDashboard';

// Category icons for metrics
const categoryIcons = {
  sessions: <ChartIcon fontSize="small" />,
  performance: <TrendIcon fontSize="small" />,
  time: <TimeIcon fontSize="small" />,
  engagement: <GroupIcon fontSize="small" />,
  breakdown: <ChartIcon fontSize="small" />,
  trends: <TrendIcon fontSize="small" />
};

const Reports = () => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportOptions, setReportOptions] = useState(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [exportReportId, setExportReportId] = useState(null);
  const [exportReportTitle, setExportReportTitle] = useState('');
  
  const [formData, setFormData] = useState({
    studentIds: [],
    allStudents: false,
    startDate: subMonths(new Date(), 1),
    endDate: new Date(),
    title: '',
    metrics: ['totalSessions', 'completedSessions', 'attendanceRate'],
    groupBy: 'none',
    includeDetails: false,
    filters: {
      status: [],
      location: []
    }
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reportsRes, studentsRes, optionsRes] = await Promise.all([
        reportsAPI.getAll(),
        usersAPI.getMyStudents(),
        reportsAPI.getOptions()
      ]);
      setReports(reportsRes.data.reports || []);
      setStudents(studentsRes.data.students || []);
      setReportOptions(optionsRes.data.options || null);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const selectedIds = formData.allStudents ? students.map(s => s._id) : formData.studentIds;
      
      if (advancedMode) {
        await reportsAPI.generateCustom({
          title: formData.title || undefined,
          studentIds: selectedIds,
          startDate: formData.startDate.toISOString(),
          endDate: formData.endDate.toISOString(),
          metrics: formData.metrics,
          groupBy: formData.groupBy,
          includeDetails: formData.includeDetails,
          filters: formData.filters
        });
      } else if (selectedIds.length === 1) {
        await reportsAPI.generateIndividual({
          studentId: selectedIds[0],
          startDate: formData.startDate.toISOString(),
          endDate: formData.endDate.toISOString()
        });
      } else {
        await reportsAPI.generateGroup({
          studentIds: selectedIds,
          startDate: formData.startDate.toISOString(),
          endDate: formData.endDate.toISOString()
        });
      }
      showSuccess('Report generated');
      handleCloseDialog();
      fetchData();
    } catch (err) {
      showError('Failed to generate report');
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setFormData({
      studentIds: [],
      allStudents: false,
      startDate: subMonths(new Date(), 1),
      endDate: new Date(),
      title: '',
      metrics: ['totalSessions', 'completedSessions', 'attendanceRate'],
      groupBy: 'none',
      includeDetails: false,
      filters: { status: [], location: [] }
    });
    setAdvancedMode(false);
  };

  const handleViewReport = async (reportId) => {
    try {
      const response = await reportsAPI.getById(reportId);
      setViewingReport(response.data.report);
    } catch (err) {
      showError('Failed to load report');
    }
  };

  const handleExport = async (reportId, reportTitle, formatType) => {
    try {
      const response = await reportsAPI.export(reportId, formatType);
      const mimeTypes = {
        pdf: 'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        json: 'application/json'
      };
      const content = formatType === 'json' ? JSON.stringify(response.data, null, 2) : response.data;
      const blob = new Blob([content], { type: mimeTypes[formatType] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = reportTitle.replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `${safeTitle}_${timestamp}.${formatType}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showSuccess(`Report exported as ${formatType.toUpperCase()}`);
      setExportMenuAnchor(null);
    } catch (err) {
      showError('Failed to export report');
    }
  };

  const handleExportFromViewer = (formatType) => {
    if (viewingReport) {
      handleExport(viewingReport._id, viewingReport.title, formatType);
    }
  };

  const handleOpenExportMenu = (event, reportId, reportTitle) => {
    setExportMenuAnchor(event.currentTarget);
    setExportReportId(reportId);
    setExportReportTitle(reportTitle);
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

  const handleMetricToggle = (metricId) => {
    const newMetrics = formData.metrics.includes(metricId)
      ? formData.metrics.filter(m => m !== metricId)
      : [...formData.metrics, metricId];
    setFormData({ ...formData, metrics: newMetrics });
  };

  const handleFilterChange = (filterType, values) => {
    setFormData({
      ...formData,
      filters: { ...formData.filters, [filterType]: values }
    });
  };

  const canGenerate = (formData.allStudents ? students.length > 0 : formData.studentIds.length > 0) 
    && (!advancedMode || formData.metrics.length > 0);

  const metricsByCategory = reportOptions?.metrics?.reduce((acc, metric) => {
    const cat = metric.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(metric);
    return acc;
  }, {}) || {};

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
                <ListItem 
                  key={report._id} 
                  sx={{ 
                    bgcolor: 'background.default', 
                    mb: 1, 
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <ListItemText
                    primary={report.title}
                    secondary={`${report.type.replace(/_/g, ' ')} • ${format(new Date(report.createdAt), 'MMM d, yyyy')}`}
                  />
                  <Tooltip title="View report">
                    <Button 
                      size="small" 
                      startIcon={<ViewIcon />}
                      onClick={() => handleViewReport(report._id)}
                      sx={{ mr: 1 }}
                    >
                      View
                    </Button>
                  </Tooltip>
                  <Tooltip title="Export report">
                    <Button 
                      size="small" 
                      startIcon={<DownloadIcon />}
                      onClick={(e) => handleOpenExportMenu(e, report._id, report.title)}
                    >
                      Export
                    </Button>
                  </Tooltip>
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

      {/* Export Menu */}
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={() => setExportMenuAnchor(null)}
      >
        <MenuItem onClick={() => handleExport(exportReportId, exportReportTitle, 'pdf')}>
          <ListItemIcon><PdfIcon fontSize="small" /></ListItemIcon>
          Export as PDF
        </MenuItem>
        <MenuItem onClick={() => handleExport(exportReportId, exportReportTitle, 'xlsx')}>
          <ListItemIcon><ExcelIcon fontSize="small" /></ListItemIcon>
          Export as Excel
        </MenuItem>
      </Menu>

      {/* Report Viewer Dialog */}
      <ReportDashboard
        key={viewingReport?._id}
        report={viewingReport}
        onClose={() => setViewingReport(null)}
        onExport={handleExportFromViewer}
      />

      {/* Report Builder Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Generate Report</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={advancedMode}
                  onChange={(e) => setAdvancedMode(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center" gap={0.5}>
                  <TuneIcon fontSize="small" />
                  <Typography variant="body2">Advanced</Typography>
                </Box>
              }
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Date Range & Students
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <DatePicker
                label="Start Date"
                value={formData.startDate}
                onChange={(date) => setFormData({ ...formData, startDate: date })}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
            <Grid item xs={6}>
              <DatePicker
                label="End Date"
                value={formData.endDate}
                onChange={(date) => setFormData({ ...formData, endDate: date })}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.allStudents}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      allStudents: e.target.checked,
                      studentIds: e.target.checked ? [] : formData.studentIds 
                    })}
                  />
                }
                label="All Students"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth size="small" disabled={formData.allStudents}>
                <InputLabel>Select Students</InputLabel>
                <Select
                  multiple
                  value={formData.studentIds}
                  onChange={handleStudentChange}
                  input={<OutlinedInput label="Select Students" />}
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

            {/* Advanced Options */}
            {advancedMode && reportOptions && (
              <>
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 1 }}>
                    Custom Report Title (optional)
                  </Typography>
                  <OutlinedInput
                    fullWidth
                    size="small"
                    placeholder="Auto-generated if left blank"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 1 }}>
                    Select Data to Include
                  </Typography>
                  {formData.metrics.length === 0 && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      Select at least one metric to include in the report
                    </Alert>
                  )}
                  
                  {Object.entries(metricsByCategory).map(([category, metrics]) => (
                    <Accordion key={category} defaultExpanded={category === 'sessions'} disableGutters>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {categoryIcons[category]}
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {category} ({metrics.filter(m => formData.metrics.includes(m.id)).length}/{metrics.length})
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <FormGroup>
                          {metrics.map(metric => (
                            <FormControlLabel
                              key={metric.id}
                              control={
                                <Checkbox
                                  checked={formData.metrics.includes(metric.id)}
                                  onChange={() => handleMetricToggle(metric.id)}
                                  size="small"
                                />
                              }
                              label={
                                <Box>
                                  <Typography variant="body2">{metric.label}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {metric.description}
                                  </Typography>
                                </Box>
                              }
                            />
                          ))}
                        </FormGroup>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Group Data By
                  </Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={formData.groupBy}
                      onChange={(e) => setFormData({ ...formData, groupBy: e.target.value })}
                    >
                      {reportOptions.groupBy.map(opt => (
                        <MenuItem key={opt.id} value={opt.id}>
                          <Box>
                            <Typography variant="body2">{opt.label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {opt.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Filter by Status
                  </Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      multiple
                      value={formData.filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      renderValue={(selected) => selected.length === 0 ? 'All statuses' : selected.join(', ')}
                      displayEmpty
                    >
                      {['scheduled', 'completed', 'cancelled', 'no_show'].map(status => (
                        <MenuItem key={status} value={status}>
                          <Checkbox checked={formData.filters.status.includes(status)} />
                          {status.replace('_', ' ')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.includeDetails}
                          onChange={(e) => setFormData({ ...formData, includeDetails: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2">Include Session Details</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Add a detailed list of individual sessions to the report
                          </Typography>
                        </Box>
                      }
                    />
                  </Paper>
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleGenerate} variant="contained" disabled={!canGenerate}>
            Generate Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reports;
