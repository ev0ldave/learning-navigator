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
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem
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
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

const Meetings = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isStudent } = useAuth();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    setPage(1);
    fetchMeetings(1, false);
  }, [tab, sortOrder]);

  const fetchMeetings = async (pageToLoad = 1, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const params = { page: pageToLoad, limit: 50, sort: sortOrder };
      
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
      const fetched = response.data.meetings || [];
      setMeetings(prev => (append ? [...prev, ...fetched] : fetched));
      setTotalPages(response.data.pagination?.pages || 1);
      setPage(pageToLoad);
    } catch (err) {
      setError('Failed to load meetings');
      console.error('Meetings error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2
        }}
      >
        <Typography variant={isMobile ? 'h5' : 'h4'}>Meetings</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setBookDialogOpen(true)}
          fullWidth={isMobile}
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
            <Tabs
              value={tab}
              onChange={(e, v) => setTab(v)}
              variant={isMobile ? 'scrollable' : 'standard'}
              allowScrollButtonsMobile
            >
              <Tab label="Upcoming" />
              <Tab label="Past" />
              <Tab label="Cancelled" />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 170 } }}>
              <InputLabel id="meetings-sort-label">Sort by</InputLabel>
              <Select
                labelId="meetings-sort-label"
                label="Sort by"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <MenuItem value="desc">Latest first</MenuItem>
                <MenuItem value="asc">Oldest first</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth={isMobile}
              sx={{ minWidth: { sm: 260 } }}
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
                  sx={{
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: 'background.default',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                    rowGap: { xs: 1, sm: 0 }
                  }}
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
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'center',
                      ml: { xs: 7, sm: 0 },
                      width: { xs: '100%', sm: 'auto' }
                    }}
                  >
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
          {!loading && !search && page < totalPages && (
            <Box display="flex" justifyContent="center" pt={2}>
              <Button
                variant="outlined"
                onClick={() => fetchMeetings(page + 1, true)}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={16} /> : null}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <BookMeetingDialog
        open={bookDialogOpen}
        onClose={() => setBookDialogOpen(false)}
        onSuccess={() => {
          setBookDialogOpen(false);
          fetchMeetings(1, false);
        }}
      />
    </Box>
  );
};

export default Meetings;
