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
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon, Person as PersonIcon } from '@mui/icons-material';
import { usersAPI } from '../services/api';

const Students = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

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
      <Typography variant="h4" gutterBottom>Students</Typography>

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
    </Box>
  );
};

export default Students;
