import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  EventNote as MeetingIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { meetingsAPI } from '../services/api';
import BookMeetingDialog from '../components/meetings/BookMeetingDialog';

const Meetings = () => {
  const navigate = useNavigate();
  const { isStudent } = useAuth();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [bookDialogOpen, setBookDialogOpen] = useState(false);

  useEffect(() => {
    fetchMeetings();
  }, [tab]);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const params = {};
      
      if (tab === 0) {
        // Upcoming
        params.startDate = new Date().toISOString();
        params.status = 'scheduled,confirmed';
      } else if (tab === 1) {
        // Past
        params.endDate = new Date().toISOString();
      } else if (tab === 2) {
        // Cancelled
        params.status = 'cancelled';
      }
      
      const response = await meetingsAPI.getAll(params);
      setMeetings(response.data.meetings || []);
    } catch (err) {
      setError('Failed to load meetings');
      console.error('Meetings error:', err);
    } finally {
      setLoading(false);
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

  const filteredMeetings = meetings.filter(meeting => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      meeting.title.toLowerCase().includes(searchLower) ||
      meeting.student?.firstName?.toLowerCase().includes(searchLower) ||
      meeting.student?.lastName?.toLowerCase().includes(searchLower) ||
      meeting.navigator?.firstName?.toLowerCase().includes(searchLower) ||
      meeting.navigator?.lastName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Meetings</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setBookDialogOpen(true)}
        >
          {isStudent() ? 'Book Session' : 'Schedule Meeting'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tabs value={tab} onChange={(e, v) => setTab(v)}>
              <Tab label="Upcoming" />
              <Tab label="Past" />
              <Tab label="Cancelled" />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            <TextField
              size="small"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : filteredMeetings.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <MeetingIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">
                No meetings found
              </Typography>
            </Box>
          ) : (
            <List>
              {filteredMeetings.map((meeting) => (
                <ListItemButton
                  key={meeting._id}
                  onClick={() => navigate(`/meetings/${meeting._id}`)}
                  sx={{ borderRadius: 1, mb: 1, bgcolor: 'background.default' }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={isStudent() ? meeting.navigator?.profilePicture : meeting.student?.profilePicture}
                    >
                      {isStudent() 
                        ? meeting.navigator?.firstName?.[0] 
                        : meeting.student?.firstName?.[0]}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={meeting.title}
                    secondary={
                      <>
                        {isStudent() 
                          ? `with ${meeting.navigator?.firstName} ${meeting.navigator?.lastName}`
                          : `with ${meeting.student?.firstName} ${meeting.student?.lastName}`}
                        <br />
                        {format(new Date(meeting.startTime), 'EEEE, MMMM d, yyyy • h:mm a')}
                      </>
                    }
                  />
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip
                      label={meeting.location}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={meeting.status}
                      size="small"
                      color={getStatusColor(meeting.status)}
                    />
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <BookMeetingDialog
        open={bookDialogOpen}
        onClose={() => setBookDialogOpen(false)}
        onSuccess={() => {
          setBookDialogOpen(false);
          fetchMeetings();
        }}
      />
    </Box>
  );
};

export default Meetings;
