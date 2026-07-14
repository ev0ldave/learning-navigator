/**
 * Tests for NotificationTemplates - Strategy Pattern implementation
 * Tests Open/Closed Principle compliance
 */
const {
  BaseNotificationTemplate,
  ScheduledNotificationTemplate,
  CancelledNotificationTemplate,
  RescheduledNotificationTemplate,
  ReminderNotificationTemplate,
  NoteSharedNotificationTemplate,
  getTemplate,
  registerTemplate,
  formatDate,
  formatTime
} = require('../services/notificationTemplates');

describe('NotificationTemplates - Strategy Pattern', () => {
  const mockMeeting = {
    _id: 'meeting-123',
    title: 'Test Meeting',
    startTime: new Date('2026-07-15T10:00:00-07:00'),
    endTime: new Date('2026-07-15T10:30:00-07:00'),
    location: 'virtual',
    meetingLink: 'https://zoom.us/j/123456',
    cancellationReason: 'Schedule conflict',
    rescheduledFrom: new Date('2026-07-14T10:00:00-07:00')
  };

  const mockStudent = {
    _id: 'student-123',
    firstName: 'John',
    lastName: 'Student'
  };

  const mockNavigator = {
    _id: 'navigator-123',
    firstName: 'Jane',
    lastName: 'Navigator'
  };

  const mockNote = {
    _id: 'note-123',
    title: 'Session Notes',
    content: 'Great progress today!'
  };

  describe('BaseNotificationTemplate', () => {
    it('should throw if methods are not implemented', () => {
      const base = new BaseNotificationTemplate();
      const context = {};

      expect(() => base.getEmailSubject(context)).toThrow('getEmailSubject must be implemented');
      expect(() => base.getNotificationTitle(context)).toThrow('getNotificationTitle must be implemented');
      expect(() => base.getNotificationMessage(context)).toThrow('getNotificationMessage must be implemented');
      expect(() => base.getEmailBody(context)).toThrow('getEmailBody must be implemented');
    });

    it('should default shouldNotifyNavigator to true', () => {
      const base = new BaseNotificationTemplate();
      expect(base.shouldNotifyNavigator({})).toBe(true);
    });
  });

  describe('ScheduledNotificationTemplate', () => {
    const template = new ScheduledNotificationTemplate();
    const context = { meeting: mockMeeting, student: mockStudent, navigator: mockNavigator };

    it('should return correct email subject', () => {
      expect(template.getEmailSubject(context)).toBe('New Meeting Scheduled - Learning Navigator');
    });

    it('should return correct notification title', () => {
      expect(template.getNotificationTitle(context)).toBe('Meeting Scheduled');
    });

    it('should return notification message with date/time', () => {
      const message = template.getNotificationMessage(context);
      expect(message).toContain('scheduled for');
    });

    it('should return email body with meeting details', () => {
      const body = template.getEmailBody(context);
      expect(body).toContain('Meeting Scheduled');
      expect(body).toContain(mockMeeting.title);
      expect(body).toContain(mockStudent.firstName);
      expect(body).toContain(mockNavigator.firstName);
      expect(body).toContain(mockMeeting.meetingLink);
    });

    it('should notify navigator', () => {
      expect(template.shouldNotifyNavigator(context)).toBe(true);
    });
  });

  describe('CancelledNotificationTemplate', () => {
    const template = new CancelledNotificationTemplate();
    const context = { meeting: mockMeeting, student: mockStudent, navigator: mockNavigator };

    it('should return correct email subject', () => {
      expect(template.getEmailSubject(context)).toBe('Meeting Cancelled - Learning Navigator');
    });

    it('should include cancellation reason in email body', () => {
      const body = template.getEmailBody(context);
      expect(body).toContain('Meeting Cancelled');
      expect(body).toContain(mockMeeting.cancellationReason);
    });
  });

  describe('RescheduledNotificationTemplate', () => {
    const template = new RescheduledNotificationTemplate();
    const context = { meeting: mockMeeting, student: mockStudent, navigator: mockNavigator };

    it('should return correct email subject', () => {
      expect(template.getEmailSubject(context)).toBe('Meeting Rescheduled - Learning Navigator');
    });

    it('should include previous date in email body', () => {
      const body = template.getEmailBody(context);
      expect(body).toContain('Meeting Rescheduled');
      expect(body).toContain('Previous Date');
    });
  });

  describe('ReminderNotificationTemplate', () => {
    const template = new ReminderNotificationTemplate();
    const context = { meeting: mockMeeting, student: mockStudent, navigator: mockNavigator };

    it('should return correct email subject', () => {
      expect(template.getEmailSubject(context)).toBe('Meeting Reminder - Learning Navigator');
    });

    it('should NOT notify navigator (reminders are for students only)', () => {
      expect(template.shouldNotifyNavigator(context)).toBe(false);
    });
  });

  describe('NoteSharedNotificationTemplate', () => {
    const template = new NoteSharedNotificationTemplate();
    const context = { note: mockNote, student: mockStudent, navigator: mockNavigator };

    it('should return correct email subject', () => {
      expect(template.getEmailSubject(context)).toBe('New Session Notes Shared - Learning Navigator');
    });

    it('should include note content in email body', () => {
      const body = template.getEmailBody(context);
      expect(body).toContain(mockNote.title);
      expect(body).toContain(mockNote.content);
    });

    it('should NOT notify navigator', () => {
      expect(template.shouldNotifyNavigator(context)).toBe(false);
    });
  });

  describe('Template Registry (Open/Closed Principle)', () => {
    it('should retrieve registered templates by type', () => {
      expect(getTemplate('scheduled')).toBeInstanceOf(ScheduledNotificationTemplate);
      expect(getTemplate('cancelled')).toBeInstanceOf(CancelledNotificationTemplate);
      expect(getTemplate('rescheduled')).toBeInstanceOf(RescheduledNotificationTemplate);
      expect(getTemplate('reminder')).toBeInstanceOf(ReminderNotificationTemplate);
      expect(getTemplate('note_shared')).toBeInstanceOf(NoteSharedNotificationTemplate);
    });

    it('should throw for unknown template type', () => {
      expect(() => getTemplate('unknown_type')).toThrow('Unknown notification type');
    });

    it('should allow registering new templates (extensibility)', () => {
      // Create a custom template
      class CustomNotificationTemplate extends BaseNotificationTemplate {
        getEmailSubject() { return 'Custom Subject'; }
        getNotificationTitle() { return 'Custom Title'; }
        getNotificationMessage() { return 'Custom message'; }
        getEmailBody() { return '<p>Custom body</p>'; }
      }

      // Register it
      registerTemplate('custom', new CustomNotificationTemplate());

      // Verify it can be retrieved
      const template = getTemplate('custom');
      expect(template).toBeInstanceOf(CustomNotificationTemplate);
      expect(template.getEmailSubject()).toBe('Custom Subject');
    });

    it('should reject non-template objects', () => {
      expect(() => registerTemplate('invalid', {})).toThrow('must extend BaseNotificationTemplate');
    });
  });

  describe('Utility Functions', () => {
    it('should format date in Pacific timezone', () => {
      const date = new Date('2026-07-15T17:00:00Z');
      const formatted = formatDate(date);
      
      expect(formatted).toContain('2026');
      expect(formatted).toContain('July');
      expect(formatted).toContain('15');
    });

    it('should format time in Pacific timezone', () => {
      const date = new Date('2026-07-15T17:00:00Z'); // 10:00 AM Pacific
      const formatted = formatTime(date);
      
      expect(formatted).toContain('AM');
    });
  });
});
