import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Grid, Avatar,
  CircularProgress, Alert, Tabs, Tab, List, ListItem, ListItemText, Chip
} from '@mui/material';
import { ArrowBack as BackIcon, Note as NoteIcon, EventNote as MeetingIcon, History as HistoryIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { usersAPI, notesAPI, meetingsAPI } from '../services/api';
import { formatPhoneNumber } from '../utils/phoneFormat';
import RecurringChip from '../components/meetings/RecurringChip';
import { useAuth } from '../contexts/AuthContext';

const HISTORY_PAGE_SIZE = 50;

const ACTION_LABELS = {
  created: { label: 'Created', color: 'success' },
  updated: { label: 'Updated', color: 'info' },
  rescheduled: { label: 'Rescheduled', color: 'warning' },
  cancelled: { label: 'Cancelled', color: 'error' },
  completed: { label: 'Completed', color: 'success' },
  no_show: { label: 'No-show', color: 'error' },
  recurrence_updated: { label: 'Recurrence changed', color: 'secondary' }
};

const FIELD_LABELS = {
  startTime: 'Start time',
  endTime: 'End time',
  title: 'Title',
  description: 'Description',
  location: 'Location',
  meetingLink: 'Meeting link',
  phoneNumber: 'Phone number',
  status: 'Status',
  frequency: 'Frequency',
  recurrenceEndDate: 'Recurrence end date'
};

const ROLE_LABELS = {
  student: 'Student',
  learning_navigator: 'Learning Navigator',
  administrator: 'Administrator',
  system: 'System'
};

const DATE_FIELDS = ['startTime', 'endTime', 'recurrenceEndDate'];

const formatPacific = (value) => `${new Date(value).toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  dateStyle: 'medium',
  timeStyle: 'short'
})} PT`;

const formatChangeValue = (field, value) => {
  if (value === null || value === undefined || value === '') return '(none)';
  if (DATE_FIELDS.includes(field)) return formatPacific(value);
  return String(value);
};

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isNavigator } = useAuth();
  const canViewHistory = isNavigator();
  const [student, setStudent] = useState(null);
  const [notes, setNotes] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    fetchData();
    setHistory([]);
    setHistoryTotal(0);
    setHistoryPage(0);
    setHistoryError('');
  }, [id]);

  useEffect(() => {
    if (tab === 2 && canViewHistory && historyPage === 0) {
      fetchHistory(1);
    }
  }, [tab, id, historyPage]);

  const fetchHistory = async (page) => {
    try {
      setHistoryLoading(true);
      setHistoryError('');
      const res = await usersAPI.getMeetingHistory(id, { page, limit: HISTORY_PAGE_SIZE });
      setHistory(prev => (page === 1 ? res.data.logs : [...prev, ...res.data.logs]));
      setHistoryTotal(res.data.pagination.total);
      setHistoryPage(page);
    } catch (err) {
      console.error('Error fetching meeting history:', err);
      setHistoryError('Failed to load meeting history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [studentRes, notesRes, meetingsRes] = await Promise.all([
        usersAPI.getById(id),
        notesAPI.getByStudent(id),
        meetingsAPI.getAll({ studentId: id })
      ]);
      setStudent(studentRes.data.user);
      setNotes(notesRes.data.notes || []);
      setMeetings(meetingsRes.data.meetings || []);
    } catch (err) {
      console.error('Error fetching student:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>;
  }

  if (!student) {
    return <Alert severity="error">Student not found</Alert>;
  }

  return (
    <Box>
      <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar src={student.profilePicture} sx={{ width: 80, height: 80, mx: 'auto', mb: 2 }}>
                {student.firstName?.[0]}
              </Avatar>
              <Typography variant="h5">{student.firstName} {student.lastName}</Typography>
              <Typography color="text.secondary">{student.email}</Typography>
              {student.phone && <Typography variant="body2">{formatPhoneNumber(student.phone)}</Typography>}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab label={`Notes (${notes.length})`} />
                <Tab label={`Meetings (${meetings.length})`} />
                {canViewHistory && <Tab label="History" />}
              </Tabs>

              {tab === 0 && (
                <List>
                  {notes.length === 0 ? (
                    <Box textAlign="center" py={4}>
                      <NoteIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                      <Typography color="text.secondary">No notes yet</Typography>
                    </Box>
                  ) : (
                    notes.map(note => (
                      <ListItem key={note._id} sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                          <Typography variant="subtitle1" fontWeight="medium">{note.title}</Typography>
                          <Box>
                            {note.sharedContent && (
                              <Chip label="Shared" size="small" color="success" sx={{ mr: 0.5 }} />
                            )}
                            {note.privateContent && (
                              <Chip label="Private" size="small" color="default" />
                            )}
                            {!note.sharedContent && !note.privateContent && (
                              <Chip label={note.type} size="small" color={note.type === 'shared' ? 'success' : 'default'} />
                            )}
                          </Box>
                        </Box>
                        {note.sharedContent && (
                          <Typography variant="body2" sx={{ mb: 0.5, pl: 1, borderLeft: '3px solid #4caf50', width: '100%', whiteSpace: 'pre-wrap' }}>
                            <strong>Shared:</strong> {note.sharedContent}
                          </Typography>
                        )}
                        {note.privateContent && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, pl: 1, borderLeft: '3px solid #9e9e9e', width: '100%', whiteSpace: 'pre-wrap' }}>
                            <strong>Private:</strong> {note.privateContent}
                          </Typography>
                        )}
                        {!note.sharedContent && !note.privateContent && note.content && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, whiteSpace: 'pre-wrap' }}>
                            {note.content}
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </Typography>
                          {note.navigator && (
                            <Typography variant="caption" color="text.secondary">
                              • by {note.navigator.firstName} {note.navigator.lastName}
                            </Typography>
                          )}
                          {note.meeting && (
                            <Chip 
                              label={`Session: ${note.meeting.title || format(new Date(note.meeting.startTime), 'MMM d')}`} 
                              size="small" 
                              variant="outlined"
                              onClick={() => navigate(`/meetings/${note.meeting._id}`)}
                              sx={{ cursor: 'pointer' }}
                            />
                          )}
                        </Box>
                      </ListItem>
                    ))
                  )}
                </List>
              )}

              {tab === 1 && (
                <List>
                  {meetings.length === 0 ? (
                    <Box textAlign="center" py={4}>
                      <MeetingIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                      <Typography color="text.secondary">No meetings yet</Typography>
                    </Box>
                  ) : (
                    meetings.map(meeting => (
                      <ListItem
                        key={meeting._id}
                        button
                        onClick={() => navigate(`/meetings/${meeting._id}`)}
                        sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1 }}
                      >
                        <ListItemText
                          primary={meeting.title}
                          secondary={format(new Date(meeting.startTime), 'MMM d, yyyy h:mm a')}
                        />
                        <RecurringChip meeting={meeting} sx={{ mr: 1 }} />
                        <Chip label={meeting.status} size="small" />
                      </ListItem>
                    ))
                  )}
                </List>
              )}

              {tab === 2 && canViewHistory && (
                <Box>
                  {historyError && <Alert severity="error" sx={{ mb: 2 }}>{historyError}</Alert>}
                  {history.length === 0 && historyLoading && (
                    <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
                  )}
                  {history.length === 0 && !historyLoading && !historyError && (
                    <Box textAlign="center" py={4}>
                      <HistoryIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                      <Typography color="text.secondary">No meeting changes recorded yet</Typography>
                    </Box>
                  )}
                  <List>
                    {history.map(log => {
                      const action = ACTION_LABELS[log.action] || { label: log.action, color: 'default' };
                      return (
                        <ListItem
                          key={log._id}
                          button
                          onClick={() => navigate(`/meetings/${log.meeting}`)}
                          sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1, flexDirection: 'column', alignItems: 'flex-start' }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
                            <Chip label={action.label} color={action.color} size="small" />
                            <Typography variant="subtitle2">
                              {log.performedByName}
                              <Typography component="span" variant="caption" color="text.secondary">
                                {' '}({ROLE_LABELS[log.performedByRole] || log.performedByRole})
                              </Typography>
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                              {formatPacific(log.createdAt)}
                            </Typography>
                          </Box>
                          {log.snapshot && (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {log.snapshot.title || 'Meeting'}
                              {log.snapshot.startTime && ` — ${formatPacific(log.snapshot.startTime)}`}
                            </Typography>
                          )}
                          {log.changes?.length > 0 && (
                            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                              {log.changes.map((change, idx) => (
                                <Typography component="li" variant="body2" color="text.secondary" key={idx}>
                                  <strong>{FIELD_LABELS[change.field] || change.field}:</strong>{' '}
                                  {formatChangeValue(change.field, change.from)} → {formatChangeValue(change.field, change.to)}
                                </Typography>
                              ))}
                            </Box>
                          )}
                          {log.details && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                              {log.details}
                            </Typography>
                          )}
                        </ListItem>
                      );
                    })}
                  </List>
                  {history.length > 0 && history.length < historyTotal && (
                    <Box textAlign="center">
                      <Button onClick={() => fetchHistory(historyPage + 1)} disabled={historyLoading}>
                        {historyLoading ? 'Loading...' : 'Load more'}
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default StudentDetail;
