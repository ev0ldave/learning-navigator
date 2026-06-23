import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Card, CardContent, Typography, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Switch, FormControlLabel, IconButton, Divider
} from '@mui/material';
import { Settings as SettingsIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNavigate } from 'react-router-dom';
import { calendarAPI, availabilityAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BookMeetingDialog from '../components/meetings/BookMeetingDialog';

const DAYS = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' }
];

const DEFAULT_WEEKLY_HOURS = {
  sunday: { enabled: false, slots: [] },
  monday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
  tuesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
  wednesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
  thursday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
  friday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
  saturday: { enabled: false, slots: [] }
};

const Calendar = () => {
  const navigate = useNavigate();
  const { isNavigator, isAdmin } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Weekly hours dialog state
  const [weeklyHoursDialogOpen, setWeeklyHoursDialogOpen] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState(DEFAULT_WEEKLY_HOURS);
  const [savingHours, setSavingHours] = useState(false);

  const fetchEvents = useCallback(async (start, end) => {
    try {
      setLoading(true);
      const response = await calendarAPI.getEvents(start.toISOString(), end.toISOString());
      if (response.data.success) {
        const formattedEvents = response.data.events.map(event => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay || false,
          backgroundColor: event.color,
          borderColor: event.color,
          display: event.display || 'auto',
          extendedProps: {
            type: event.type || 'meeting',
            status: event.status,
            location: event.location,
            student: event.student,
            navigator: event.navigator,
            description: event.description
          }
        }));
        setEvents(formattedEvents);
      }
    } catch (err) {
      setError('Failed to load calendar events');
      console.error('Calendar error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeeklyHours = useCallback(async () => {
    try {
      const response = await availabilityAPI.getWeeklyHours();
      if (response.data.success && response.data.weeklyHours) {
        const hours = response.data.weeklyHours;
        setWeeklyHours({
          sunday: hours.sunday || DEFAULT_WEEKLY_HOURS.sunday,
          monday: hours.monday || DEFAULT_WEEKLY_HOURS.monday,
          tuesday: hours.tuesday || DEFAULT_WEEKLY_HOURS.tuesday,
          wednesday: hours.wednesday || DEFAULT_WEEKLY_HOURS.wednesday,
          thursday: hours.thursday || DEFAULT_WEEKLY_HOURS.thursday,
          friday: hours.friday || DEFAULT_WEEKLY_HOURS.friday,
          saturday: hours.saturday || DEFAULT_WEEKLY_HOURS.saturday
        });
      }
    } catch (err) {
      console.error('Error fetching weekly hours:', err);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fetchEvents(start, end);
    
    if (isNavigator() || isAdmin()) {
      fetchWeeklyHours();
    }
  }, [fetchEvents, fetchWeeklyHours, isNavigator, isAdmin]);

  const handleDateClick = (info) => {
    setSelectedDate(info.date);
    setBookDialogOpen(true);
  };

  const handleEventClick = (info) => {
    const eventType = info.event.extendedProps.type;
    
    if (eventType === 'availability') {
      // Open weekly hours settings
      setWeeklyHoursDialogOpen(true);
    } else {
      // Navigate to meeting detail
      navigate(`/meetings/${info.event.id}`);
    }
  };

  const handleDatesSet = (dateInfo) => {
    fetchEvents(dateInfo.start, dateInfo.end);
  };

  const handleDayEnabledChange = (dayKey, enabled) => {
    setWeeklyHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled,
        slots: enabled && prev[dayKey].slots.length === 0 
          ? [{ startTime: '09:00', endTime: '17:00' }]
          : prev[dayKey].slots
      }
    }));
  };

  const handleSlotChange = (dayKey, slotIndex, field, value) => {
    setWeeklyHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        slots: prev[dayKey].slots.map((slot, idx) => 
          idx === slotIndex ? { ...slot, [field]: value } : slot
        )
      }
    }));
  };

  const handleAddSlot = (dayKey) => {
    setWeeklyHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        slots: [...prev[dayKey].slots, { startTime: '09:00', endTime: '17:00' }]
      }
    }));
  };

  const handleRemoveSlot = (dayKey, slotIndex) => {
    setWeeklyHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        slots: prev[dayKey].slots.filter((_, idx) => idx !== slotIndex)
      }
    }));
  };

  const handleSaveWeeklyHours = async () => {
    try {
      setSavingHours(true);
      await availabilityAPI.updateWeeklyHours(weeklyHours);
      showSuccess('Working hours saved successfully');
      setWeeklyHoursDialogOpen(false);
      // Refresh calendar to show updated availability
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      fetchEvents(start, end);
    } catch (err) {
      showError('Failed to save working hours');
      console.error('Save weekly hours error:', err);
    } finally {
      setSavingHours(false);
    }
  };

  if (loading && events.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Calendar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click on a date to schedule a meeting, or click on an event to view details.
          </Typography>
        </Box>
        
        {(isNavigator() || isAdmin()) && (
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setWeeklyHoursDialogOpen(true)}
          >
            Set Working Hours
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="auto"
            eventDisplay="block"
            eventTimeFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short'
            }}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            nowIndicator={true}
            selectable={true}
          />
        </CardContent>
      </Card>

      <BookMeetingDialog
        open={bookDialogOpen}
        onClose={() => {
          setBookDialogOpen(false);
          setSelectedDate(null);
        }}
        onSuccess={() => {
          setBookDialogOpen(false);
          setSelectedDate(null);
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          fetchEvents(start, end);
        }}
        initialDate={selectedDate}
      />

      {/* Weekly Working Hours Dialog */}
      <Dialog 
        open={weeklyHoursDialogOpen} 
        onClose={() => setWeeklyHoursDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          Set Working Hours
          <Typography variant="body2" color="text.secondary">
            Configure your weekly availability for student bookings
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            {DAYS.map((day) => (
              <Box key={day.key} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={weeklyHours[day.key]?.enabled || false}
                        onChange={(e) => handleDayEnabledChange(day.key, e.target.checked)}
                      />
                    }
                    label={
                      <Typography fontWeight={500} sx={{ minWidth: 100 }}>
                        {day.label}
                      </Typography>
                    }
                  />
                  {weeklyHours[day.key]?.enabled && (
                    <IconButton 
                      size="small" 
                      onClick={() => handleAddSlot(day.key)}
                      title="Add time slot"
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                
                {weeklyHours[day.key]?.enabled && weeklyHours[day.key]?.slots?.map((slot, slotIndex) => (
                  <Box 
                    key={slotIndex} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 2, 
                      ml: 4, 
                      mb: 1 
                    }}
                  >
                    <TextField
                      type="time"
                      size="small"
                      label="Start"
                      value={slot.startTime}
                      onChange={(e) => handleSlotChange(day.key, slotIndex, 'startTime', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 140 }}
                    />
                    <Typography>to</Typography>
                    <TextField
                      type="time"
                      size="small"
                      label="End"
                      value={slot.endTime}
                      onChange={(e) => handleSlotChange(day.key, slotIndex, 'endTime', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 140 }}
                    />
                    {weeklyHours[day.key].slots.length > 1 && (
                      <IconButton 
                        size="small" 
                        onClick={() => handleRemoveSlot(day.key, slotIndex)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                
                {!weeklyHours[day.key]?.enabled && (
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                    Not available
                  </Typography>
                )}
                
                <Divider sx={{ mt: 2 }} />
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeeklyHoursDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSaveWeeklyHours} 
            variant="contained"
            disabled={savingHours}
          >
            {savingHours ? 'Saving...' : 'Save Working Hours'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Calendar;
