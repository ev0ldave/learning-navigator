import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  FormControlLabel,
  Checkbox,
  Box,
  Alert
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import { useAuth } from '../contexts/AuthContext';

const PhonePromptModal = () => {
  const { showPhonePrompt, dismissPhonePrompt, savePhoneNumber } = useAuth();
  const [phone, setPhone] = useState('');
  const [enableSms, setEnableSms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!phone.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setLoading(true);
    setError('');

    const result = await savePhoneNumber(phone, enableSms);
    
    setLoading(false);
    
    if (!result.success) {
      setError(result.message);
    }
  };

  const handleSkip = () => {
    dismissPhonePrompt();
  };

  // Format phone number as user types
  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX for US numbers
    if (value.length <= 10) {
      if (value.length > 6) {
        value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length > 3) {
        value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        value = `(${value}`;
      }
    }
    
    setPhone(value);
  };

  if (!showPhonePrompt) {
    return null;
  }

  return (
    <Dialog 
      open={showPhonePrompt} 
      maxWidth="sm" 
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PhoneIcon color="primary" />
        Set Up SMS Notifications
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Would you like to receive SMS reminders 15 minutes before your meetings?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your phone number to enable SMS meeting reminders. You can change this 
          anytime in your profile settings.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Phone Number"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="(555) 123-4567"
          sx={{ mb: 2 }}
          inputProps={{ maxLength: 14 }}
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={enableSms}
              onChange={(e) => setEnableSms(e.target.checked)}
              color="primary"
            />
          }
          label="Enable SMS meeting reminders"
        />

        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            SMS reminders are sent 15 minutes before each scheduled meeting.
            Standard message rates may apply.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleSkip} color="inherit">
          Skip for now
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PhonePromptModal;
