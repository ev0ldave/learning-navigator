import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Avatar, Grid, CircularProgress
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { usersAPI } from '../services/api';
import { formatPhoneNumber } from '../utils/phoneFormat';

const Profile = () => {
  const { user, updateUser, isNavigator } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: formatPhoneNumber(user?.phone || ''),
    bio: user?.bio || '',
    zoomLink: user?.zoomLink || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await usersAPI.update(user._id, formData);
      updateUser(response.data.user);
      showSuccess('Profile updated');
    } catch (err) {
      showError('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Profile</Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar src={user?.profilePicture} sx={{ width: 100, height: 100, mx: 'auto', mb: 2 }}>
                {user?.firstName?.[0]}
              </Avatar>
              <Typography variant="h6">{user?.firstName} {user?.lastName}</Typography>
              <Typography color="text.secondary">{user?.email}</Typography>
              <Typography variant="body2" sx={{ mt: 1, textTransform: 'capitalize' }}>
                {user?.role?.replace('_', ' ')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Edit Profile</Typography>
              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="First Name"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Last Name"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                      placeholder="(555) 123-4567"
                    />
                  </Grid>
                  {isNavigator() && (
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Zoom Meeting Link"
                        value={formData.zoomLink}
                        onChange={(e) => setFormData({ ...formData, zoomLink: e.target.value })}
                        placeholder="https://zoom.us/j/your-meeting-id"
                        helperText="Your personal Zoom link for virtual meetings with students"
                      />
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Bio"
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      multiline
                      rows={3}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button type="submit" variant="contained" disabled={loading}>
                      {loading ? <CircularProgress size={24} /> : 'Save Changes'}
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;
