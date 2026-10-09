import React, { useMemo, useState } from 'react';
import {
  AppBar, Box, Button, Card, CardContent, Chip, Dialog, Grid, IconButton, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup, Toolbar, Typography, useTheme
} from '@mui/material';
import {
  Close as CloseIcon, PictureAsPdf as PdfIcon, GridOn as ExcelIcon,
  DataObject as JsonIcon, Assessment as ReportIcon
} from '@mui/icons-material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import { format, startOfWeek } from 'date-fns';

const formatMetricLabel = (key) => key
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, str => str.toUpperCase())
  .trim();

const formatMetricValue = (key, value) => {
  if (typeof value !== 'number') return String(value);
  if (key.includes('Rate')) return `${value}%`;
  if (key === 'totalDuration') return value >= 60 ? `${(value / 60).toFixed(1)} h` : `${value} min`;
  if (key.includes('Duration')) return `${value} min`;
  return value.toLocaleString();
};

const titleCase = (str) => (str || 'unknown')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

const getStudentName = (session) => {
  if (session.studentName) return session.studentName;
  if (session.student?.firstName) return `${session.student.firstName} ${session.student.lastName || ''}`.trim();
  return 'N/A';
};

const buildTrendFromSessions = (sessions, period) => {
  const buckets = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    const key = period === 'week'
      ? format(startOfWeek(d), 'yyyy-MM-dd')
      : format(d, 'yyyy-MM');
    if (!buckets[key]) buckets[key] = { date: key, total: 0, completed: 0, cancelled: 0, noShow: 0 };
    buckets[key].total++;
    if (s.status === 'completed') buckets[key].completed++;
    if (s.status === 'cancelled') buckets[key].cancelled++;
    if (s.status === 'no_show') buckets[key].noShow++;
  });
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
};

const KpiCard = ({ label, value }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="body2" color="text.secondary" gutterBottom>{label}</Typography>
      <Typography variant="h4" fontWeight={600} color="primary">{value}</Typography>
    </CardContent>
  </Card>
);

const ChartCard = ({ title, action, children }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        {action}
      </Box>
      {children}
    </CardContent>
  </Card>
);

const ReportDashboard = ({ report, onClose, onExport }) => {
  const theme = useTheme();
  const [trendPeriod, setTrendPeriod] = useState('week');
  const [statusFilter, setStatusFilter] = useState('all');

  const statusColors = {
    completed: theme.palette.success.main,
    cancelled: theme.palette.error.main,
    no_show: theme.palette.warning.main,
    scheduled: theme.palette.info.main
  };

  const data = report?.data || {};
  const summary = data.summary || {};
  const sessions = data.sessions || [];

  const kpis = Object.entries(summary).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  const attendanceRate = summary.attendanceRate ?? data.progress?.attendanceRate;

  const statusData = useMemo(() => {
    if (Array.isArray(summary.statusBreakdown) && summary.statusBreakdown.length) {
      return summary.statusBreakdown.map(s => ({ key: s.key, label: s.label, value: s.count }));
    }
    if (summary.totalSessions !== undefined && summary.completedSessions !== undefined) {
      const completed = summary.completedSessions || 0;
      const cancelled = summary.cancelledSessions || 0;
      const noShow = summary.noShowSessions || 0;
      const other = Math.max((summary.totalSessions || 0) - completed - cancelled - noShow, 0);
      return [
        { key: 'completed', label: 'Completed', value: completed },
        { key: 'cancelled', label: 'Cancelled', value: cancelled },
        { key: 'no_show', label: 'No Show', value: noShow },
        { key: 'scheduled', label: 'Scheduled', value: other }
      ].filter(s => s.value > 0);
    }
    return [];
  }, [summary]);

  const locationData = useMemo(() => {
    if (Array.isArray(summary.meetingTypes) && summary.meetingTypes.length) {
      return summary.meetingTypes.map(m => ({ label: m.label, value: m.count }));
    }
    const counts = {};
    sessions.forEach(s => {
      if (s.location) counts[s.location] = (counts[s.location] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({ label: titleCase(key), value }));
  }, [summary, sessions]);

  const hasServerTrend = Array.isArray(summary.weeklyTrend) || Array.isArray(summary.monthlyTrend);
  const trendData = useMemo(() => {
    const serverTrend = trendPeriod === 'week' ? summary.weeklyTrend : summary.monthlyTrend;
    if (Array.isArray(serverTrend)) return serverTrend;
    if (hasServerTrend) return summary.weeklyTrend || summary.monthlyTrend;
    return buildTrendFromSessions(sessions, trendPeriod);
  }, [summary, sessions, trendPeriod, hasServerTrend]);
  const canToggleTrend = !hasServerTrend || (summary.weeklyTrend && summary.monthlyTrend);

  // Normalise custom-report groups and group-report student breakdown into one shape
  const groupRows = useMemo(() => {
    if (Array.isArray(data.grouped) && data.grouped.length) {
      return data.grouped.map(g => ({
        label: g.label,
        total: g.count,
        completed: g.metrics?.completedSessions,
        cancelled: g.metrics?.cancelledSessions,
        noShow: g.metrics?.noShowSessions,
        metrics: g.metrics || {}
      }));
    }
    const breakdown = data.customFields?.studentBreakdown;
    if (Array.isArray(breakdown) && breakdown.length) {
      return breakdown.map(b => ({
        label: b.student ? `${b.student.firstName || ''} ${b.student.lastName || ''}`.trim() : 'Unknown',
        total: b.totalSessions,
        completed: b.completed,
        cancelled: b.cancelled,
        noShow: b.noShow,
        metrics: {
          completedSessions: b.completed,
          cancelledSessions: b.cancelled,
          noShowSessions: b.noShow,
          attendanceRate: b.totalSessions ? Math.round((b.completed / b.totalSessions) * 100) : 0
        }
      }));
    }
    return [];
  }, [data]);
  const groupHasStatus = groupRows.some(r => r.completed !== undefined);
  const groupMetricKeys = groupRows.length
    ? Object.keys(groupRows[0].metrics).filter(k => typeof groupRows[0].metrics[k] !== 'object' || groupRows[0].metrics[k] === null)
    : [];

  const filteredSessions = statusFilter === 'all' ? sessions : sessions.filter(s => s.status === statusFilter);
  const sessionStatuses = [...new Set(sessions.map(s => s.status).filter(Boolean))];

  if (!report) return null;

  const isEmpty = kpis.length === 0 && groupRows.length === 0 && sessions.length === 0;

  const statusSeries = [
    { dataKey: 'completed', label: 'Completed', stack: 'status', color: statusColors.completed },
    { dataKey: 'cancelled', label: 'Cancelled', stack: 'status', color: statusColors.cancelled },
    { dataKey: 'noShow', label: 'No Show', stack: 'status', color: statusColors.no_show }
  ];

  return (
    <Dialog open={!!report} onClose={onClose} fullScreen>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
          <IconButton edge="start" onClick={onClose} aria-label="Close report">
            <CloseIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            <Typography variant="h6" noWrap>{report.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {titleCase(report.type)}
              {report.scope?.startDate && report.scope?.endDate && (
                <> • {format(new Date(report.scope.startDate), 'MMM d, yyyy')} — {format(new Date(report.scope.endDate), 'MMM d, yyyy')}</>
              )}
              {' '}• Generated {format(new Date(report.createdAt), 'MMM d, yyyy')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" startIcon={<JsonIcon />} onClick={() => onExport('json')}>
              JSON
            </Button>
            <Button variant="outlined" size="small" startIcon={<ExcelIcon />} onClick={() => onExport('xlsx')}>
              Excel
            </Button>
            <Button variant="contained" size="small" startIcon={<PdfIcon />} onClick={() => onExport('pdf')}>
              PDF
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.default', flexGrow: 1 }}>
        {isEmpty ? (
          <Box textAlign="center" py={8}>
            <ReportIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
            <Typography color="text.secondary">No data available for this report</Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {kpis.map(([key, value]) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={key}>
                <KpiCard label={formatMetricLabel(key)} value={formatMetricValue(key, value)} />
              </Grid>
            ))}

            {typeof attendanceRate === 'number' && (
              <Grid item xs={12} md={4}>
                <ChartCard title="Attendance Rate">
                  <Gauge
                    value={attendanceRate}
                    height={220}
                    startAngle={-110}
                    endAngle={110}
                    innerRadius="75%"
                    text={({ value }) => `${value}%`}
                    sx={{
                      [`& .${gaugeClasses.valueText}`]: { fontSize: 32, fontWeight: 600 },
                      [`& .${gaugeClasses.valueArc}`]: {
                        fill: attendanceRate >= 80 ? statusColors.completed
                          : attendanceRate >= 50 ? statusColors.no_show : statusColors.cancelled
                      }
                    }}
                  />
                </ChartCard>
              </Grid>
            )}

            {statusData.length > 0 && (
              <Grid item xs={12} md={4}>
                <ChartCard title="Session Status">
                  <PieChart
                    height={220}
                    series={[{
                      data: statusData.map((s, i) => ({
                        id: i, value: s.value, label: s.label, color: statusColors[s.key]
                      })),
                      innerRadius: 50,
                      paddingAngle: 2,
                      cornerRadius: 4,
                      highlightScope: { fade: 'global', highlight: 'item' }
                    }]}
                  />
                </ChartCard>
              </Grid>
            )}

            {locationData.length > 0 && (
              <Grid item xs={12} md={4}>
                <ChartCard title="Meeting Types">
                  <PieChart
                    height={220}
                    series={[{
                      data: locationData.map((l, i) => ({ id: i, value: l.value, label: l.label })),
                      innerRadius: 50,
                      paddingAngle: 2,
                      cornerRadius: 4,
                      highlightScope: { fade: 'global', highlight: 'item' }
                    }]}
                  />
                </ChartCard>
              </Grid>
            )}

            {trendData?.length > 0 && (
              <Grid item xs={12}>
                <ChartCard
                  title="Sessions Over Time"
                  action={canToggleTrend && (
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={trendPeriod}
                      onChange={(e, v) => v && setTrendPeriod(v)}
                    >
                      <ToggleButton value="week">Weekly</ToggleButton>
                      <ToggleButton value="month">Monthly</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                >
                  <BarChart
                    height={300}
                    dataset={trendData}
                    xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
                    series={statusSeries}
                  />
                </ChartCard>
              </Grid>
            )}

            {groupRows.length > 0 && (
              <>
                <Grid item xs={12} lg={6}>
                  <ChartCard title="Breakdown">
                    <BarChart
                      height={Math.max(250, groupRows.length * 36)}
                      layout="horizontal"
                      dataset={groupRows.map(r => ({
                        ...r,
                        completed: r.completed ?? 0,
                        cancelled: r.cancelled ?? 0,
                        noShow: r.noShow ?? 0
                      }))}
                      yAxis={[{ scaleType: 'band', dataKey: 'label' }]}
                      margin={{ left: 120 }}
                      series={groupHasStatus
                        ? statusSeries
                        : [{ dataKey: 'total', label: 'Sessions', color: theme.palette.primary.main }]}
                    />
                  </ChartCard>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <ChartCard title="Breakdown Details">
                    <TableContainer sx={{ maxHeight: Math.max(250, groupRows.length * 36) }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Group</strong></TableCell>
                            <TableCell align="right"><strong>Sessions</strong></TableCell>
                            {groupMetricKeys.map(key => (
                              <TableCell key={key} align="right"><strong>{formatMetricLabel(key)}</strong></TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {groupRows.map((row, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>{row.label}</TableCell>
                              <TableCell align="right">{row.total}</TableCell>
                              {groupMetricKeys.map(key => (
                                <TableCell key={key} align="right">
                                  {formatMetricValue(key, row.metrics[key])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </ChartCard>
                </Grid>
              </>
            )}

            {sessions.length > 0 && (
              <Grid item xs={12}>
                <ChartCard
                  title={`Sessions (${filteredSessions.length})`}
                  action={
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {['all', ...sessionStatuses].map(status => (
                        <Chip
                          key={status}
                          label={status === 'all' ? 'All' : titleCase(status)}
                          size="small"
                          color={statusFilter === status ? 'primary' : 'default'}
                          variant={statusFilter === status ? 'filled' : 'outlined'}
                          onClick={() => setStatusFilter(status)}
                        />
                      ))}
                    </Stack>
                  }
                >
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Date</strong></TableCell>
                          <TableCell><strong>Student</strong></TableCell>
                          <TableCell><strong>Status</strong></TableCell>
                          <TableCell align="right"><strong>Duration</strong></TableCell>
                          <TableCell><strong>Location</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredSessions.map((session, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{format(new Date(session.date), 'MMM d, yyyy h:mm a')}</TableCell>
                            <TableCell>{getStudentName(session)}</TableCell>
                            <TableCell>
                              <Chip
                                label={session.status ? titleCase(session.status) : 'N/A'}
                                size="small"
                                color={
                                  session.status === 'completed' ? 'success' :
                                  session.status === 'cancelled' ? 'error' :
                                  session.status === 'no_show' ? 'warning' : 'default'
                                }
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="right">{session.duration || 0} min</TableCell>
                            <TableCell>{session.location ? titleCase(session.location) : 'N/A'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </ChartCard>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    </Dialog>
  );
};

export default ReportDashboard;
