import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Switch, FormControlLabel, Divider, Button
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { usersAPI } from '../services/api';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState(user?.notificationPreferences || {
    email: true, inApp: true, meetingReminders: true, meetingChanges: true
  });

  const handleSave = async () => {
    if (!user?._id) {
      showError('User not logged in');
      return;
    }
    
    try {
      setLoading(true);
      const updateData = { notificationPreferences: prefs };
      const response = await usersAPI.update(user._id, updateData);
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      showSuccess('Settings saved');
    } catch (err) {
      console.error('Settings save error:', err.response?.data || err.message || err);
      showError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key) => (e) => {
    setPrefs(prev => ({ ...prev, [key]: e.target.checked }));
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Settings</Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Notification Preferences</Typography>
          
          <Box>
            <FormControlLabel
              control={<Switch checked={prefs.email} onChange={handleChange('email')} />}
              label="Email Notifications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6, mb: 2 }}>
              Receive notifications via email
            </Typography>
          </Box>

          <Box>
            <FormControlLabel
              control={<Switch checked={prefs.inApp} onChange={handleChange('inApp')} />}
              label="In-App Notifications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6, mb: 2 }}>
              Show notifications within the application
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box>
            <FormControlLabel
              control={<Switch checked={prefs.meetingReminders} onChange={handleChange('meetingReminders')} />}
              label="Meeting Reminders"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6, mb: 2 }}>
              Get reminded about upcoming meetings
            </Typography>
          </Box>

          <Box>
            <FormControlLabel
              control={<Switch checked={prefs.meetingChanges} onChange={handleChange('meetingChanges')} />}
              label="Meeting Changes"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6, mb: 2 }}>
              Get notified when meetings are scheduled, rescheduled, or cancelled
            </Typography>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Button variant="contained" onClick={handleSave} disabled={loading}>
              Save Settings
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Settings;
