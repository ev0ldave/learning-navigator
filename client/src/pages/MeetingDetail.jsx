import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Avatar,
  List,
  ListItem,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
  CheckCircle as CompleteIcon,
  PersonOff as NoShowIcon,
  VideoCall as VideoIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Add as AddIcon,
  Note as NoteIcon,
  Delete as DeleteIcon,
  Repeat as RecurrenceIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { meetingsAPI, notesAPI } from '../services/api';
import { formatPhoneNumber } from '../utils/phoneFormat';

const MeetingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isNavigator, user } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Delete series state
  const [deleteSeriesDialogOpen, setDeleteSeriesDialogOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState('all');
  const [deleteReason, setDeleteReason] = useState('');
  
  // Edit recurrence state (navigators/admins only)
  const [editRecurrenceDialogOpen, setEditRecurrenceDialogOpen] = useState(false);
  const [newFrequency, setNewFrequency] = useState('weekly');
  
  // Notes state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: '',
    sharedContent: '',
    privateContent: ''
  });

  useEffect(() => {
    fetchMeeting();
  }, [id]);

  useEffect(() => {
    if (meeting) {
      fetchNotes();
    }
  }, [meeting]);

  const fetchMeeting = async () => {
    try {
      setLoading(true);
      const response = await meetingsAPI.getById(id);
      setMeeting(response.data.meeting);
    } catch (err) {
      setError('Failed to load meeting details');
      console.error('Meeting detail error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      const response = await notesAPI.getByMeeting(id);
      setNotes(response.data.notes || []);
    } catch (err) {
      console.error('Error fetching meeting notes:', err);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleCreateNote = async () => {
    try {
      setActionLoading(true);
      await notesAPI.create({
        studentId: meeting.student._id,
        meetingId: meeting._id,
        ...noteForm
      });
      showSuccess('Note added to meeting');
      setNoteDialogOpen(false);
      setNoteForm({ title: '', sharedContent: '', privateContent: '' });
      fetchNotes();
    } catch (err) {
      showError('Failed to create note');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setActionLoading(true);
      await meetingsAPI.cancel(id, cancelReason);
      showSuccess('Meeting cancelled successfully');
      setCancelDialogOpen(false);
      fetchMeeting();
    } catch (err) {
      showError('Failed to cancel meeting');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      setActionLoading(true);
      await meetingsAPI.complete(id);
      showSuccess('Meeting marked as completed');
      fetchMeeting();
    } catch (err) {
      showError('Failed to complete meeting');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShow = async () => {
    try {
      setActionLoading(true);
      await meetingsAPI.markNoShow(id);
      showSuccess('Meeting marked as no-show');
      fetchMeeting();
    } catch (err) {
      showError('Failed to mark as no-show');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSeries = async () => {
    try {
      setActionLoading(true);
      await meetingsAPI.deleteSeries(id, deleteScope, deleteReason);
      showSuccess(deleteScope === 'all' ? 'All meetings in series deleted' : 'This and future meetings deleted');
      setDeleteSeriesDialogOpen(false);
      navigate('/meetings');
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete meeting series');
    } finally {
      setActionLoading(false);
    }
  };

  // Edit recurrence handlers (navigators/admins only)
  const handleOpenEditRecurrence = () => {
    setNewFrequency(meeting.recurrence?.frequency || 'weekly');
    setEditRecurrenceDialogOpen(true);
  };

  const handleUpdateRecurrence = async () => {
    try {
      setActionLoading(true);
      const response = await meetingsAPI.updateRecurrence(id, newFrequency);
      showSuccess(response.data.message || 'Recurrence updated successfully');
      setEditRecurrenceDialogOpen(false);
      fetchMeeting();
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update recurrence');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'primary';
      case 'confirmed': return 'success';
      case 'completed': return 'default';
      case 'cancelled': return 'error';
      case 'no_show': return 'warning';
      default: return 'default';
    }
  };

  const getLocationIcon = (location) => {
    switch (location) {
      case 'virtual': return <VideoIcon />;
      case 'in_person': return <PersonIcon />;
      case 'phone': return <PhoneIcon />;
      default: return <VideoIcon />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !meeting) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
          Back
        </Button>
        <Alert severity="error">{error || 'Meeting not found'}</Alert>
      </Box>
    );
  }

  const isPast = new Date(meeting.endTime) < new Date();
  const tenMinutesAfterStart = new Date(meeting.startTime).getTime() + (10 * 60 * 1000) < Date.now();
  const canCancel = ['scheduled', 'confirmed'].includes(meeting.status) && !isPast;
  const canComplete = meeting.status === 'scheduled' && isPast && isNavigator();
  const canMarkNoShow = meeting.status === 'scheduled' && tenMinutesAfterStart && isNavigator();
  const isRecurring = meeting.isRecurring || meeting.recurrence?.parentMeetingId;
  const canDeleteSeries = isRecurring && isNavigator();

  return (
    <Box>
      <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Back to Meetings
      </Button>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                  <Typography variant="h5" gutterBottom>
                    {meeting.title}
                  </Typography>
                  <Chip
                    label={meeting.status}
                    color={getStatusColor(meeting.status)}
                    sx={{ mr: 1 }}
                  />
                  <Chip
                    icon={getLocationIcon(meeting.location)}
                    label={meeting.location}
                    variant="outlined"
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Date & Time
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(meeting.startTime), 'EEEE, MMMM d, yyyy')}
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(meeting.startTime), 'h:mm a')} - {format(new Date(meeting.endTime), 'h:mm a')}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Duration
                  </Typography>
                  <Typography variant="body1">
                    {meeting.duration} minutes
                  </Typography>
                </Grid>

                {meeting.isRecurring && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Recurrence
                    </Typography>
                    <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                      {meeting.recurrence?.frequency || 'Weekly'}
                      {meeting.recurrence?.endDate && (
                        <Typography component="span" color="text.secondary">
                          {' '}until {format(new Date(meeting.recurrence.endDate), 'MMM d, yyyy')}
                        </Typography>
                      )}
                    </Typography>
                  </Grid>
                )}

                {meeting.description && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Description
                    </Typography>
                    <Typography variant="body1">
                      {meeting.description}
                    </Typography>
                  </Grid>
                )}

                {meeting.meetingLink && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Meeting Link
                    </Typography>
                    <Button
                      variant="outlined"
                      href={meeting.meetingLink}
                      target="_blank"
                      startIcon={<VideoIcon />}
                    >
                      Join Meeting
                    </Button>
                  </Grid>
                )}

                {meeting.location === 'phone' && meeting.phoneNumber && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Phone Number
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon color="action" />
                      <Typography variant="body1">
                        {formatPhoneNumber(meeting.phoneNumber)}
                      </Typography>
                    </Box>
                  </Grid>
                )}

                {meeting.cancellationReason && (
                  <Grid item xs={12}>
                    <Alert severity="error">
                      <Typography variant="subtitle2">Cancellation Reason:</Typography>
                      {meeting.cancellationReason}
                    </Alert>
                  </Grid>
                )}
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {canCancel && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Meeting
                  </Button>
                )}
                {canComplete && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CompleteIcon />}
                    onClick={handleComplete}
                    disabled={actionLoading}
                  >
                    Mark as Completed
                  </Button>
                )}
                {canMarkNoShow && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<NoShowIcon />}
                    onClick={handleNoShow}
                    disabled={actionLoading}
                  >
                    Mark as No-Show
                  </Button>
                )}
                {/* Edit Recurrence - only for navigators/admins */}
                {canDeleteSeries && isNavigator() && (
                  <Button
                    variant="outlined"
                    startIcon={<RecurrenceIcon />}
                    onClick={handleOpenEditRecurrence}
                  >
                    Edit Recurrence
                  </Button>
                )}
                {canDeleteSeries && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteSeriesDialogOpen(true)}
                  >
                    Delete Series
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Participants
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Avatar
                  src={meeting.student?.profilePicture}
                  sx={{ width: 48, height: 48, mr: 2 }}
                >
                  {meeting.student?.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography variant="subtitle2">Student</Typography>
                  <Typography variant="body1">
                    {meeting.student?.firstName} {meeting.student?.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {meeting.student?.email}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Avatar
                  src={meeting.navigator?.profilePicture}
                  sx={{ width: 48, height: 48, mr: 2 }}
                >
                  {meeting.navigator?.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography variant="subtitle2">Learning Navigator</Typography>
                  <Typography variant="body1">
                    {meeting.navigator?.firstName} {meeting.navigator?.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {meeting.navigator?.email}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Session Notes</Typography>
                {isNavigator() && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setNoteDialogOpen(true)}
                  >
                    Add Note
                  </Button>
                )}
              </Box>
              
              {notesLoading ? (
                <Box display="flex" justifyContent="center" py={2}>
                  <CircularProgress size={24} />
                </Box>
              ) : notes.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <NoteIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                  <Typography color="text.secondary" variant="body2">
                    No notes for this session
                  </Typography>
                </Box>
              ) : (
                <List dense>
                  {notes.map(note => (
                    <ListItem
                      key={note._id}
                      sx={{ bgcolor: 'background.default', borderRadius: 1, mb: 1, flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                        <Typography variant="subtitle2">{note.title}</Typography>
                        <Box>
                          {note.sharedContent && (
                            <Chip label="Shared" size="small" color="success" sx={{ mr: 0.5 }} />
                          )}
                          {note.privateContent && (
                            <Chip label="Private" size="small" color="default" />
                          )}
                        </Box>
                      </Box>
                      {note.sharedContent && (
                        <Typography variant="body2" sx={{ mb: 1, pl: 1, borderLeft: '3px solid #4caf50', width: '100%' }}>
                          <strong>Shared:</strong> {note.sharedContent.length > 100 ? `${note.sharedContent.substring(0, 100)}...` : note.sharedContent}
                        </Typography>
                      )}
                      {note.privateContent && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, pl: 1, borderLeft: '3px solid #9e9e9e', width: '100%' }}>
                          <strong>Private:</strong> {note.privateContent.length > 100 ? `${note.privateContent.substring(0, 100)}...` : note.privateContent}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onClose={() => setNoteDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Session Note</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Title"
            value={noteForm.title}
            onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
            Shared Notes (visible to student)
          </Typography>
          <TextField
            fullWidth
            label="Shared Notes"
            value={noteForm.sharedContent}
            onChange={(e) => setNoteForm({ ...noteForm, sharedContent: e.target.value })}
            multiline
            rows={4}
            sx={{ mb: 3 }}
            placeholder="Notes that will be shared with the student..."
            helperText="The student will be able to see these notes"
          />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Private Notes (only visible to navigators)
          </Typography>
          <TextField
            fullWidth
            label="Private Notes"
            value={noteForm.privateContent}
            onChange={(e) => setNoteForm({ ...noteForm, privateContent: e.target.value })}
            multiline
            rows={4}
            sx={{ mb: 2 }}
            placeholder="Internal notes for navigators only..."
            helperText="Only you and other navigators/admins can see these notes"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateNote}
            variant="contained"
            disabled={!noteForm.title || (!noteForm.sharedContent && !noteForm.privateContent) || actionLoading}
          >
            {actionLoading ? <CircularProgress size={24} /> : 'Add Note'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
        <DialogTitle>Cancel Meeting</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to cancel this meeting? The other participant will be notified.
          </Typography>
          <TextField
            fullWidth
            label="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>
            Keep Meeting
          </Button>
          <Button
            onClick={handleCancel}
            color="error"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={24} /> : 'Cancel Meeting'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Series Dialog */}
      <Dialog open={deleteSeriesDialogOpen} onClose={() => setDeleteSeriesDialogOpen(false)}>
        <DialogTitle>Delete Recurring Meeting Series</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This is a recurring meeting. What would you like to delete?
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            <Button
              variant={deleteScope === 'all' ? 'contained' : 'outlined'}
              onClick={() => setDeleteScope('all')}
              fullWidth
            >
              Delete All Meetings in Series
            </Button>
            <Button
              variant={deleteScope === 'future' ? 'contained' : 'outlined'}
              onClick={() => setDeleteScope('future')}
              fullWidth
            >
              Delete This and Future Meetings
            </Button>
          </Box>
          <TextField
            fullWidth
            label="Reason for deletion (optional)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSeriesDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSeries}
            color="error"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={24} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Recurrence Dialog - for navigators/admins only */}
      <Dialog open={editRecurrenceDialogOpen} onClose={() => setEditRecurrenceDialogOpen(false)}>
        <DialogTitle>Edit Recurrence Frequency</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Change how often this recurring meeting repeats. Future meetings will be rescheduled according to the new frequency.
          </Typography>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Frequency</InputLabel>
            <Select
              value={newFrequency}
              onChange={(e) => setNewFrequency(e.target.value)}
              label="Frequency"
            >
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="biweekly">Every 2 weeks</MenuItem>
              <MenuItem value="triweekly">Every 3 weeks</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="info" sx={{ mt: 2 }}>
            This will delete all future scheduled meetings in this series and recreate them with the new frequency. Past and completed meetings will not be affected.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRecurrenceDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdateRecurrence}
            variant="contained"
            disabled={actionLoading || newFrequency === meeting?.recurrence?.frequency}
          >
            {actionLoading ? <CircularProgress size={24} /> : 'Update Recurrence'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MeetingDetail;
