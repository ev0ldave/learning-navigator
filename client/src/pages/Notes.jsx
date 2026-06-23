import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, List, ListItem, ListItemText,
  CircularProgress, Alert, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Add as AddIcon, Note as NoteIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { notesAPI, usersAPI } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';

const Notes = () => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '', title: '', content: ''
  });

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      fetchNotes();
    } else {
      setNotes([]);
    }
  }, [selectedStudent]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const studentsRes = await usersAPI.getMyStudents();
      setStudents(studentsRes.data.students || []);
    } catch (err) {
      console.error('Error fetching students:', err);
      showError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const notesRes = await notesAPI.getByStudent(selectedStudent);
      setNotes(notesRes.data.notes || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
      showError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await notesAPI.create({
        studentId: formData.studentId,
        title: formData.title,
        privateContent: formData.content // Store as private content only
      });
      showSuccess('Note created');
      setDialogOpen(false);
      setFormData({ studentId: '', title: '', content: '' });
      if (formData.studentId === selectedStudent) {
        fetchNotes();
      }
    } catch (err) {
      showError('Failed to create note');
    }
  };

  const filteredNotes = notes;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Notes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Add Note
        </Button>
      </Box>

      {/* Student Filter */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel>Select Student</InputLabel>
            <Select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              label="Select Student"
            >
              <MenuItem value="">
                <em>-- Select a student to view notes --</em>
              </MenuItem>
              {students.map(s => (
                <MenuItem key={s._id} value={s._id}>{s.firstName} {s.lastName}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : !selectedStudent ? (
            <Box textAlign="center" py={4}>
              <NoteIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography color="text.secondary">Select a student to view their notes</Typography>
            </Box>
          ) : filteredNotes.length === 0 ? (
            <Box textAlign="center" py={4}>
              <NoteIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography color="text.secondary">No notes for this student</Typography>
            </Box>
          ) : (
            <List>
              {filteredNotes.map(note => (
                <ListItem key={note._id} sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ListItemText
                      primary={note.title}
                      secondary={format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {(note.privateContent || note.content || '').substring(0, 200)}
                    {(note.privateContent || note.content || '').length > 200 ? '...' : ''}
                  </Typography>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Note</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Student</InputLabel>
            <Select
              value={formData.studentId}
              onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
              label="Student"
            >
              {students.map(s => (
                <MenuItem key={s._id} value={s._id}>{s.firstName} {s.lastName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Content"
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            multiline
            rows={6}
            placeholder="Enter your notes..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreate} 
            variant="contained" 
            disabled={!formData.studentId || !formData.title || !formData.content}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Notes;
