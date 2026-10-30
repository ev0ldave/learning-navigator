import React from 'react';
import { Chip } from '@mui/material';
import { Repeat as RepeatIcon } from '@mui/icons-material';

const RecurringChip = ({ meeting, ...props }) => {
  if (!meeting?.isRecurring) return null;
  return (
    <Chip
      icon={<RepeatIcon />}
      label="Recurring"
      size="small"
      color="secondary"
      variant="outlined"
      {...props}
    />
  );
};

export default RecurringChip;
