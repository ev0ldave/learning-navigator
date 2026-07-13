import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Grid, Avatar,
  CircularProgress, Alert, Tabs, Tab, List, ListItem, ListItemText, Chip
} from '@mui/material';
import { ArrowBack as BackIcon, Note as NoteIcon, EventNote as MeetingIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { usersAPI, notesAPI, meetingsAPI } from '../services/api';
import { formatPhoneNumber } from '../utils/phoneFormat';

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [notes, setNotes] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    fetchData();
  }, [id]);

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
                          <Chip label={note.type} size="small" color={note.type === 'shared' ? 'success' : 'default'} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {note.content?.substring(0, 100)}{note.content?.length > 100 ? '...' : ''}
                        </Typography>
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
                        <Chip label={meeting.status} size="small" />
                      </ListItem>
                    ))
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default StudentDetail;
