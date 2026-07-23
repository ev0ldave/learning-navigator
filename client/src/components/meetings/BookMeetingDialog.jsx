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
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { addMinutes, addDays, format, startOfDay, isAfter, setHours, setMinutes } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { usersAPI, meetingsAPI, calendarAPI, adminAPI } from '../../services/api';
import { formatPhoneNumber } from '../../utils/phoneFormat';

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
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    navigatorId: '',
    studentId: '',
    date: initialDate || new Date(),
    startTime: null, // Start with no time selected
    duration: 30,
    title: 'Learning Navigator Session',
    description: '',
    location: 'virtual',
    phoneNumber: '', // Will be populated with student's phone when selected
    isRecurring: false,
    recurrenceFrequency: 'weekly',
    recurrenceEndDate: null,
    isPastMeeting: false,
    pastMeetingStatus: 'completed',
    manualTime: null // For past meetings, allow manual time entry
  });

  // Calculate minimum date - students must book 24 hours in advance
  // Also respect quarter start date if set
  // For past meetings (admin/navigator only), no minimum date
  const getMinDate = () => {
    // Past meetings have no minimum date
    if (formData.isPastMeeting) {
      return null;
    }
    
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
  // For past meetings, max date is today
  const getMaxDate = () => {
    if (formData.isPastMeeting) {
      return new Date(); // Can't add "past" meetings in the future
    }
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
      // For students, pre-populate their own phone number
      const phoneNumber = isStudent() ? formatPhoneNumber(user?.phone || '') : '';
      setFormData(prev => ({ 
        ...prev, 
        date: dateToUse, 
        startTime: null, 
        navigatorId, 
        phoneNumber,
        isPastMeeting: false,
        pastMeetingStatus: 'completed',
        manualTime: null
      }));
      setAvailableSlots([]); // Clear slots when reopening
      setFieldErrors({}); // Clear field errors when reopening
      setError(null); // Clear general error when reopening
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

  // Auto-switch to phone if selected navigator has no zoom link
  useEffect(() => {
    if (!formData.navigatorId) return;
    
    const selectedNavigator = isStudent() 
      ? navigators.find(n => n._id === formData.navigatorId)
      : (isNavigator() ? user : null);
    
    // If navigator has no zoom link and current location is virtual, switch to phone
    if (selectedNavigator && !selectedNavigator.zoomLink && formData.location === 'virtual') {
      setFormData(prev => ({ ...prev, location: 'phone' }));
    }
  }, [formData.navigatorId, navigators, user]);

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
      // Send date as YYYY-MM-DD in Pacific timezone to avoid timezone conversion issues
      // Use toLocaleDateString with Pacific timezone to get the correct calendar date
      const dateStr = formData.date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
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
      const errors = {};
      
      // Validate required fields and collect all errors
      if (isStudent() && !formData.navigatorId) {
        errors.navigatorId = 'Please select a navigator';
      }
      
      if (isNavigator() && !formData.studentId) {
        errors.studentId = 'Please select a student';
      }
      
      // For past meetings, use manual time; for regular meetings, use slot selection
      if (formData.isPastMeeting) {
        if (!formData.manualTime) {
          errors.manualTime = 'Please select a time for the meeting';
        }
      } else {
        if (!formData.startTime) {
          errors.startTime = 'Please select a time slot from the available options';
        }
      }
      
      // Validate phone number for phone meetings
      if (formData.location === 'phone' && !formData.phoneNumber?.trim()) {
        errors.phoneNumber = 'Phone number is required for phone meetings';
      }
      
      // If there are validation errors, set them and stop
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const firstError = Object.values(errors)[0];
        setError(firstError);
        showError(firstError);
        return;
      }
      
      // Clear field errors if validation passes
      setFieldErrors({});
      
      // For non-past meetings, validate slot selection
      if (!formData.isPastMeeting) {
        // Validate that a time slot has been selected
        if (!formData.startTime) {
          setError('Please select a time slot from the available options');
          showError('Please select a time slot');
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
      }
      
      setLoading(true);

      // Calculate start and end times
      let startDateTime;
      if (formData.isPastMeeting) {
        // For past meetings, combine date and manual time
        const timeDate = formData.manualTime;
        startDateTime = new Date(formData.date);
        startDateTime.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
      } else {
        // Use the slot time directly - it's already in the correct UTC format from the server
        startDateTime = new Date(formData.startTime);
      }
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
        phoneNumber: formData.location === 'phone' ? formData.phoneNumber : undefined,
        isRecurring: formData.isPastMeeting ? false : formData.isRecurring, // Past meetings can't be recurring
        recurrence: formData.isPastMeeting ? undefined : recurrenceData,
        isPastMeeting: formData.isPastMeeting,
        status: formData.isPastMeeting ? formData.pastMeetingStatus : undefined
      };

      await meetingsAPI.create(meetingData);
      showSuccess(formData.isPastMeeting ? 'Past meeting recorded successfully!' : 'Meeting scheduled successfully!');
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
        {formData.isPastMeeting 
          ? 'Add Past Meeting' 
          : (isStudent() ? 'Book a Session' : 'Schedule a Meeting')}
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
              <FormControl fullWidth error={!!fieldErrors.navigatorId}>
                <InputLabel>Select Navigator *</InputLabel>
                <Select
                  value={formData.navigatorId}
                  onChange={(e) => {
                    setFormData({ ...formData, navigatorId: e.target.value });
                    setFieldErrors(prev => ({ ...prev, navigatorId: undefined }));
                  }}
                  label="Select Navigator *"
                >
                  {navigators.map((nav) => (
                    <MenuItem key={nav._id} value={nav._id}>
                      {nav.firstName} {nav.lastName}
                    </MenuItem>
                  ))}
                </Select>
                {fieldErrors.navigatorId && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {fieldErrors.navigatorId}
                  </Typography>
                )}
              </FormControl>
            </Grid>
          )}

          {isNavigator() && (
            <Grid item xs={12}>
              <FormControl fullWidth error={!!fieldErrors.studentId}>
                <InputLabel>Select Student *</InputLabel>
                <Select
                  value={formData.studentId}
                  onChange={(e) => {
                    const selectedStudent = students.find(s => s._id === e.target.value);
                    setFormData({ 
                      ...formData, 
                      studentId: e.target.value,
                      phoneNumber: formatPhoneNumber(selectedStudent?.phone || '')
                    });
                    setFieldErrors(prev => ({ ...prev, studentId: undefined }));
                  }}
                  label="Select Student *"
                >
                  {students.map((student) => (
                    <MenuItem key={student._id} value={student._id}>
                      {student.firstName} {student.lastName}
                    </MenuItem>
                  ))}
                </Select>
                {fieldErrors.studentId && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {fieldErrors.studentId}
                  </Typography>
                )}
              </FormControl>
            </Grid>
          )}

          {/* Past Meeting Toggle - only for navigators/admins */}
          {isNavigator() && (
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.isPastMeeting}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      isPastMeeting: e.target.checked,
                      startTime: null,
                      manualTime: null,
                      isRecurring: false // Past meetings can't be recurring
                    })}
                  />
                }
                label="Add past meeting (record a meeting that already happened)"
              />
              {formData.isPastMeeting && (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: 0.5 }}>
                  Use this to record meetings that occurred outside the app. No calendar events or notifications will be sent.
                </Typography>
              )}
            </Grid>
          )}

          {/* Date Selection */}
          <Grid item xs={12} md={6}>
            <DatePicker
              label="Date"
              value={formData.date}
              onChange={(date) => setFormData({ ...formData, date, startTime: null, manualTime: null })}
              minDate={getMinDate()}
              maxDate={getMaxDate()}
              slotProps={{ 
                textField: { 
                  fullWidth: true,
                  helperText: formData.isPastMeeting 
                    ? 'Select the date the meeting occurred'
                    : (activeQuarter ? `${activeQuarter.name}: ${format(new Date(activeQuarter.startDate), 'MMM d')} - ${format(new Date(activeQuarter.endDate), 'MMM d, yyyy')}` : undefined)
                } 
              }}
            />
          </Grid>

          {/* Time Selection - different for past vs future meetings */}
          {formData.isPastMeeting ? (
            <>
              <Grid item xs={12} md={6}>
                <TimePicker
                  label="Meeting Time"
                  value={formData.manualTime}
                  onChange={(time) => {
                    setFormData({ ...formData, manualTime: time });
                    setFieldErrors(prev => ({ ...prev, manualTime: undefined }));
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!fieldErrors.manualTime,
                      helperText: fieldErrors.manualTime || 'Select the time the meeting started'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Meeting Status</InputLabel>
                  <Select
                    value={formData.pastMeetingStatus}
                    onChange={(e) => setFormData({ ...formData, pastMeetingStatus: e.target.value })}
                    label="Meeting Status"
                  >
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="no_show">No Show</MenuItem>
                    <MenuItem value="cancelled">Cancelled</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </>
          ) : (
            <>
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
            </>
          )}

          {/* Available Slots - required for ALL users (but not for past meetings) */}
          {formData.navigatorId && !formData.isPastMeeting && (
            <Grid item xs={12}>
              <Box sx={{ 
                border: fieldErrors.startTime ? '1px solid' : 'none',
                borderColor: 'error.main',
                borderRadius: 1,
                p: fieldErrors.startTime ? 1.5 : 0
              }}>
                <Typography variant="subtitle2" gutterBottom color={fieldErrors.startTime ? 'error' : 'inherit'}>
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
                          onClick={() => {
                            handleSlotSelect(slot);
                            setFieldErrors(prev => ({ ...prev, startTime: undefined }));
                          }}
                          color={isSelected ? 'primary' : 'default'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          sx={fieldErrors.startTime && !isSelected ? { borderColor: 'error.main' } : {}}
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
                {fieldErrors.startTime && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                    {fieldErrors.startTime}
                  </Typography>
                )}
              </Box>
            </Grid>
          )}

          {/* Recurring - positioned after time slots (not available for past meetings) */}
          {!formData.isPastMeeting && (
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
          )}

          {/* For non-students, show frequency and end date options (not for past meetings) */}
          {formData.isRecurring && !isStudent() && !formData.isPastMeeting && (
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
                {/* Only show Virtual if navigator has zoom link configured */}
                {(() => {
                  const selectedNavigator = isStudent() 
                    ? navigators.find(n => n._id === formData.navigatorId)
                    : (isNavigator() ? user : null);
                  return selectedNavigator?.zoomLink ? (
                    <MenuItem value="virtual">Virtual</MenuItem>
                  ) : null;
                })()}
                <MenuItem value="phone">Phone</MenuItem>
              </Select>
              {(() => {
                const selectedNavigator = isStudent() 
                  ? navigators.find(n => n._id === formData.navigatorId)
                  : (isNavigator() ? user : null);
                return !selectedNavigator?.zoomLink && formData.navigatorId ? (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                    Virtual meetings unavailable - navigator has not configured a Zoom link
                  </Typography>
                ) : null;
              })()}
            </FormControl>
          </Grid>

          {/* Phone Number - only shown for phone meetings */}
          {formData.location === 'phone' && (
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Student Phone Number *"
                value={formData.phoneNumber}
                onChange={(e) => {
                  setFormData({ ...formData, phoneNumber: formatPhoneNumber(e.target.value) });
                  setFieldErrors(prev => ({ ...prev, phoneNumber: undefined }));
                }}
                placeholder="(555) 123-4567"
                error={!!fieldErrors.phoneNumber}
                helperText={fieldErrors.phoneNumber || "Student's phone number for the meeting"}
              />
            </Grid>
          )}

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
          {loading ? <CircularProgress size={24} /> : (formData.isPastMeeting ? 'Add Past Meeting' : 'Schedule Meeting')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookMeetingDialog;
