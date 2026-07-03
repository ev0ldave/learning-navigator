import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Grid,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { addMinutes, addDays, format, startOfDay, isAfter } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { usersAPI, meetingsAPI, calendarAPI, adminAPI } from '../../services/api';

// Format time in Pacific timezone
const formatPacificTime = (date) => {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const BookMeetingDialog = ({ open, onClose, onSuccess, initialDate }) => {
  const { user, isStudent, isNavigator } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(false);
  const [navigators, setNavigators] = useState([]);
  const [students, setStudents] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState(null);
  const [activeQuarter, setActiveQuarter] = useState(null);

  const [formData, setFormData] = useState({
    navigatorId: '',
    studentId: '',
    date: initialDate || new Date(),
    startTime: null, // Start with no time selected
    duration: 30,
    title: 'Learning Navigator Session',
    description: '',
    location: 'virtual',
    isRecurring: false,
    recurrenceFrequency: 'weekly',
    recurrenceEndDate: null
  });

  // Calculate minimum date - students must book 24 hours in advance
  // Also respect quarter start date if set
  const getMinDate = () => {
    let minDate;
    if (isStudent()) {
      // For students, minimum date is tomorrow (start of day)
      minDate = startOfDay(addDays(new Date(), 1));
    } else {
      // For navigators/admins, can book same day
      minDate = startOfDay(new Date());
    }
    
    // If active quarter has a start date, use the later of the two
    if (activeQuarter?.startDate) {
      const quarterStart = startOfDay(new Date(activeQuarter.startDate));
      if (isAfter(quarterStart, minDate)) {
        return quarterStart;
      }
    }
    return minDate;
  };

  // Calculate maximum date based on active quarter end date
  const getMaxDate = () => {
    if (activeQuarter?.endDate) {
      return startOfDay(new Date(activeQuarter.endDate));
    }
    return null; // No max date if no quarter set
  };

  // Check if a date is valid for booking (for students: must be at least tomorrow)
  const isValidBookingDate = (date) => {
    if (!date) return false;
    const minDate = getMinDate();
    return isAfter(startOfDay(date), minDate) || startOfDay(date).getTime() === minDate.getTime();
  };

  useEffect(() => {
    if (open) {
      fetchData();
      // Set initial date respecting minimum date constraint
      const minDate = getMinDate();
      let dateToUse;
      if (initialDate && isValidBookingDate(initialDate)) {
        dateToUse = initialDate;
      } else {
        dateToUse = minDate;
      }
      // For navigators/admins, set themselves as the navigator
      const navigatorId = isNavigator() ? user._id : '';
      setFormData(prev => ({ ...prev, date: dateToUse, startTime: null, navigatorId }));
      setAvailableSlots([]); // Clear slots when reopening
    }
  }, [open, initialDate]);

  useEffect(() => {
    // Fetch available slots when we have a navigator and date
    // For students: navigatorId is selected from dropdown
    // For navigators: navigatorId is their own ID (set automatically)
    if (formData.navigatorId && formData.date) {
      fetchAvailableSlots();
    }
  }, [formData.navigatorId, formData.date]);

  const fetchData = async () => {
    try {
      // Fetch active quarter to constrain date selection
      try {
        const quarterResponse = await adminAPI.getActiveQuarter();
        setActiveQuarter(quarterResponse.data.quarter || null);
      } catch (err) {
        console.error('Failed to fetch active quarter:', err);
        setActiveQuarter(null);
      }

      // Fetch navigators for students
      if (isStudent()) {
        const response = await usersAPI.getNavigators();
        setNavigators(response.data.navigators || []);
      }
      
      // Fetch students for navigators
      if (isNavigator()) {
        const response = await usersAPI.getMyStudents();
        setStudents(response.data.students || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!formData.navigatorId || !formData.date) return;
    
    try {
      setLoadingSlots(true);
      // Send date as YYYY-MM-DD to avoid timezone conversion issues
      const dateStr = format(formData.date, 'yyyy-MM-dd');
      const response = await calendarAPI.getAvailability(
        formData.navigatorId,
        dateStr
      );
      setAvailableSlots(response.data.availableSlots || []);
    } catch (err) {
      console.error('Failed to fetch slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      
      // Validate that a time slot has been selected
      if (!formData.startTime) {
        setError('Please select a time slot from the available options');
        showError('Please select a time slot');
        return;
      }
      
      // Validate that a navigator is selected (for students) or student is selected (for navigators)
      if (isStudent() && !formData.navigatorId) {
        setError('Please select a navigator');
        showError('Please select a navigator');
        return;
      }
      
      // ALL users must select from available slots to ensure booking is within navigator availability
      if (availableSlots.length === 0) {
        setError('No available time slots for the selected date. The navigator may not have set their availability for this day.');
        showError('No available time slots for the selected date');
        return;
      }
      
      // Validate selected time matches an available slot (compare timestamps for accuracy)
      const selectedTimestamp = formData.startTime.getTime();
      const isValidSlot = availableSlots.some(slot => 
        new Date(slot.start).getTime() === selectedTimestamp
      );
      if (!isValidSlot) {
        setError("Please select a time from the available slots shown. The selected time is outside the navigator's availability.");
        showError('Please select a time from the available slots');
        return;
      }
      
      // For students: additional 24-hour check as a safeguard
      if (isStudent()) {
        const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (formData.startTime < twentyFourHoursFromNow) {
          setError('Students must book meetings at least 24 hours in advance');
          showError('Students must book meetings at least 24 hours in advance');
          return;
        }
      }
      
      setLoading(true);

      // Use the slot time directly - it's already in the correct UTC format from the server
      const startDateTime = new Date(formData.startTime);
      const endDateTime = addMinutes(startDateTime, formData.duration);

      // For students, recurring meetings are always weekly until quarter end
      // For navigators/admins, they can choose frequency and end date
      let recurrenceData = undefined;
      if (formData.isRecurring) {
        if (isStudent()) {
          recurrenceData = {
            frequency: 'weekly',
            endDate: activeQuarter?.endDate ? new Date(activeQuarter.endDate).toISOString() : undefined
          };
        } else {
          recurrenceData = {
            frequency: formData.recurrenceFrequency,
            endDate: formData.recurrenceEndDate?.toISOString()
          };
        }
      }

      const meetingData = {
        navigatorId: isStudent() ? formData.navigatorId : user._id,
        studentId: isNavigator() ? formData.studentId : undefined,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        title: formData.title,
        description: formData.description,
        location: formData.location,
        isRecurring: formData.isRecurring,
        recurrence: recurrenceData
      };

      await meetingsAPI.create(meetingData);
      showSuccess('Meeting scheduled successfully!');
      onSuccess();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to schedule meeting';
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSlotSelect = (slot) => {
    setFormData(prev => ({
      ...prev,
      startTime: new Date(slot.start)
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isStudent() ? 'Book a Session' : 'Schedule a Meeting'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 1 }}>
          {/* Navigator/Student Selection */}
          {isStudent() && (
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Navigator</InputLabel>
                <Select
                  value={formData.navigatorId}
                  onChange={(e) => setFormData({ ...formData, navigatorId: e.target.value })}
                  label="Select Navigator"
                >
                  {navigators.map((nav) => (
                    <MenuItem key={nav._id} value={nav._id}>
                      {nav.firstName} {nav.lastName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {isNavigator() && (
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Student</InputLabel>
                <Select
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                  label="Select Student"
                >
                  {students.map((student) => (
                    <MenuItem key={student._id} value={student._id}>
                      {student.firstName} {student.lastName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* Date Selection */}
          <Grid item xs={12} md={6}>
            <DatePicker
              label="Date"
              value={formData.date}
              onChange={(date) => setFormData({ ...formData, date, startTime: null })}
              minDate={getMinDate()}
              maxDate={getMaxDate()}
              slotProps={{ 
                textField: { 
                  fullWidth: true,
                  helperText: activeQuarter ? `${activeQuarter.name}: ${format(new Date(activeQuarter.startDate), 'MMM d')} - ${format(new Date(activeQuarter.endDate), 'MMM d, yyyy')}` : undefined
                } 
              }}
            />
          </Grid>

          {/* Selected Time Display - read-only for all users, must select from slots */}
          <Grid item xs={12} md={6}>
            <TextField
              label="Start Time (Pacific)"
              value={formData.startTime ? formatPacificTime(formData.startTime) : 'Select from slots below'}
              fullWidth
              disabled
              helperText="All times are in Pacific timezone"
              InputProps={{ readOnly: true }}
            />
          </Grid>

          {/* Available Slots - required for ALL users */}
          {formData.navigatorId && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Available Time Slots *
                {isStudent() && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (Showing slots 24+ hours from now)
                  </Typography>
                )}
              </Typography>
              {loadingSlots ? (
                <CircularProgress size={24} />
              ) : availableSlots.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableSlots.map((slot, index) => {
                    const slotTime = new Date(slot.start).getTime();
                    const isSelected = formData.startTime && formData.startTime.getTime() === slotTime;
                    return (
                      <Chip
                        key={index}
                        label={formatPacificTime(slot.start)}
                        onClick={() => handleSlotSelect(slot)}
                        color={isSelected ? 'primary' : 'default'}
                        variant={isSelected ? 'filled' : 'outlined'}
                      />
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {isStudent() 
                    ? 'No available slots for this date. The navigator may not have availability, or all slots within this time frame are booked. Try selecting a different date.'
                    : 'No available slots for selected date'
                  }
                </Typography>
              )}
            </Grid>
          )}

          {/* Recurring - positioned after time slots */}
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                  disabled={isStudent() && !activeQuarter}
                />
              }
              label="Make this a recurring meeting"
            />
            {formData.isRecurring && isStudent() && activeQuarter && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: 0.5 }}>
                Recurring meetings repeat weekly until the end of {activeQuarter.name} ({format(new Date(activeQuarter.endDate), 'MMM d, yyyy')})
              </Typography>
            )}
            {isStudent() && !activeQuarter && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: 0.5 }}>
                Recurring meetings require an active school quarter to be set
              </Typography>
            )}
          </Grid>

          {/* For non-students, show frequency and end date options */}
          {formData.isRecurring && !isStudent() && (
            <>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Frequency</InputLabel>
                  <Select
                    value={formData.recurrenceFrequency}
                    onChange={(e) => setFormData({ ...formData, recurrenceFrequency: e.target.value })}
                    label="Frequency"
                  >
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="biweekly">Every 2 weeks</MenuItem>
                    <MenuItem value="triweekly">Every 3 weeks</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <DatePicker
                  label="End Date"
                  value={formData.recurrenceEndDate}
                  onChange={(date) => setFormData({ ...formData, recurrenceEndDate: date })}
                  minDate={formData.date}
                  maxDate={getMaxDate()}
                  slotProps={{ 
                    textField: { 
                      fullWidth: true,
                      helperText: activeQuarter ? 'Limited to quarter end date' : undefined
                    } 
                  }}
                />
              </Grid>
            </>
          )}

          {/* Duration */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Duration</InputLabel>
              <Select
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                label="Duration"
              >
                <MenuItem value={15}>15 minutes</MenuItem>
                <MenuItem value={30}>30 minutes</MenuItem>
                <MenuItem value={45}>45 minutes</MenuItem>
                <MenuItem value={60}>1 hour</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Location */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                label="Location"
              >
                <MenuItem value="virtual">Virtual</MenuItem>
                <MenuItem value="in_person">In Person</MenuItem>
                <MenuItem value="phone">Phone</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Title */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </Grid>

          {/* Description */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={3}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || (!formData.navigatorId && isStudent()) || (!formData.studentId && isNavigator())}
        >
          {loading ? <CircularProgress size={24} /> : 'Schedule Meeting'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookMeetingDialog;
