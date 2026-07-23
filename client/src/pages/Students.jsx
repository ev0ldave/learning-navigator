import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Search as SearchIcon, Person as PersonIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { usersAPI } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';

const Students = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [navigators, setNavigators] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    assignedNavigator: ''
  });
  const [registerLoading, setRegisterLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
    fetchNavigators();
  }, []);

  const fetchNavigators = async () => {
    try {
      const response = await usersAPI.getNavigators();
      setNavigators(response.data.navigators || []);
    } catch (err) {
      console.error('Error fetching navigators:', err);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getMyStudents();
      setStudents(response.data.students || []);
    } catch (err) {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterStudent = async () => {
    try {
      setRegisterLoading(true);
      const dataToSend = {
        email: registerForm.email,
        firstName: registerForm.firstName,
        lastName: registerForm.lastName,
        role: 'student',
        phone: registerForm.phone || undefined,
        assignedNavigator: registerForm.assignedNavigator || undefined
      };
      await usersAPI.registerUser(dataToSend);
      showSuccess('Student registered successfully. They can now log in with Google.');
      setRegisterDialogOpen(false);
      setRegisterForm({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        assignedNavigator: ''
      });
      fetchStudents();
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to register student');
    } finally {
      setRegisterLoading(false);
    }
  };

  const filteredStudents = students.filter(student => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      student.firstName?.toLowerCase().includes(searchLower) ||
      student.lastName?.toLowerCase().includes(searchLower) ||
      student.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Students</Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setRegisterDialogOpen(true)}
        >
          Register Student
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : filteredStudents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <PersonIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">No students found</Typography>
            </Box>
          ) : (
            <List>
              {filteredStudents.map((student) => (
                <ListItem
                  key={student._id}
                  disablePadding
                  sx={{ mb: 1 }}
                >
                  <ListItemButton
                    onClick={() => navigate(`/students/${student._id}`)}
                    sx={{ borderRadius: 1, bgcolor: 'background.default' }}
                  >
                    <ListItemAvatar>
                      <Avatar src={student.profilePicture}>{student.firstName?.[0]}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${student.firstName} ${student.lastName}`}
                      secondary={student.email}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Register Student Dialog */}
      <Dialog open={registerDialogOpen} onClose={() => setRegisterDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register New Student</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Email"
              type="email"
              value={registerForm.email}
              onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
              required
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="First Name"
                value={registerForm.firstName}
                onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                required
                fullWidth
              />
              <TextField
                label="Last Name"
                value={registerForm.lastName}
                onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                required
                fullWidth
              />
            </Box>
            <TextField
              label="Phone (optional)"
              value={registerForm.phone}
              onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Assign Navigator (optional)</InputLabel>
              <Select
                value={registerForm.assignedNavigator}
                onChange={(e) => setRegisterForm({ ...registerForm, assignedNavigator: e.target.value })}
                label="Assign Navigator (optional)"
              >
                <MenuItem value="">None</MenuItem>
                {navigators.map((nav) => (
                  <MenuItem key={nav._id} value={nav._id}>
                    {nav.firstName} {nav.lastName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              The student will be able to log in with Google using this email address.
              Their Google account will be automatically linked to this profile.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRegisterStudent}
            variant="contained"
            disabled={registerLoading || !registerForm.email || !registerForm.firstName || !registerForm.lastName}
          >
            {registerLoading ? 'Registering...' : 'Register Student'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Students;
