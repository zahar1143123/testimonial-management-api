const ALLOWED_STATUS_TRANSITIONS = {
  draft: 'recording',
  recording: 'processing',
  processing: 'completed',
  completed: 'shared'
};

const ALLOWED_SHARE_CHANNELS = ['email', 'sms', 'facebook', 'instagram'];

module.exports = {
  ALLOWED_STATUS_TRANSITIONS,
  ALLOWED_SHARE_CHANNELS
};