import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  EventNote as MeetingIcon,
  Person as PersonIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { meetingsAPI, usersAPI } from '../services/api';
import BookMeetingDialog from '../components/meetings/BookMeetingDialog';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isNavigator, isStudent } = useAuth();
  const [loading, setLoading] = useState(true);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState(null);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch upcoming meetings
      const meetingsRes = await meetingsAPI.getUpcoming();
      setUpcomingMeetings(meetingsRes.data.meetings || []);
      
      // For navigators, also fetch their students
      if (isNavigator()) {
        const studentsRes = await usersAPI.getMyStudents();
        setStudents(studentsRes.data.students || []);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'primary';
      case 'confirmed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Welcome, {user?.firstName}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {isNavigator() ? 'Manage your sessions and students' : 'View and manage your learning sessions'}
          </Typography>
        </Box>
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

      <Grid container spacing={3}>
        {/* Quick Stats */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <CalendarIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{upcomingMeetings.length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upcoming Sessions
                  </Typography>
                </Box>
              </Box>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/calendar')}
              >
                View Calendar
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {isNavigator() && (
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                    <PersonIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{students.length}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Assigned Students
                    </Typography>
                  </Box>
                </Box>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => navigate('/students')}
                >
                  View Students
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} md={isNavigator() ? 4 : 8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <MeetingIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">
                    {upcomingMeetings.filter(m => m.status === 'confirmed').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Confirmed Sessions
                  </Typography>
                </Box>
              </Box>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/meetings')}
              >
                View All Meetings
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Upcoming Meetings */}
        <Grid item xs={12} md={isNavigator() ? 8 : 12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Upcoming Sessions
              </Typography>
              {upcomingMeetings.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <MeetingIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography color="text.secondary">
                    No upcoming sessions scheduled
                  </Typography>
                  <Button
                    variant="contained"
                    sx={{ mt: 2 }}
                    onClick={() => setBookDialogOpen(true)}
                  >
                    {isStudent() ? 'Book Your First Session' : 'Schedule a Meeting'}
                  </Button>
                </Box>
              ) : (
                <List>
                  {upcomingMeetings.slice(0, 5).map((meeting) => (
                    <ListItem
                      key={meeting._id}
                      disablePadding
                      sx={{ mb: 1 }}
                    >
                      <ListItemButton
                        onClick={() => navigate(`/meetings/${meeting._id}`)}
                        sx={{ borderRadius: 1, bgcolor: 'background.default' }}
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
                        <Chip
                          label={meeting.status}
                          size="small"
                          color={getStatusColor(meeting.status)}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Students List (for navigators) */}
        {isNavigator() && students.length > 0 && (
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Your Students
                </Typography>
                <List>
                  {students.slice(0, 5).map((student) => (
                    <ListItem
                      key={student._id}
                      disablePadding
                    >
                      <ListItemButton
                        onClick={() => navigate(`/students/${student._id}`)}
                      >
                        <ListItemAvatar>
                          <Avatar src={student.profilePicture}>
                            {student.firstName?.[0]}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${student.firstName} ${student.lastName}`}
                          secondary={student.email}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                {students.length > 5 && (
                  <Button
                    fullWidth
                    onClick={() => navigate('/students')}
                  >
                    View All ({students.length})
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <BookMeetingDialog
        open={bookDialogOpen}
        onClose={() => setBookDialogOpen(false)}
        onSuccess={() => {
          setBookDialogOpen(false);
          fetchDashboardData();
        }}
      />
    </Box>
  );
};

export default Dashboard;
