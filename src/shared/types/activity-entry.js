/**
 * Factory functions for activity entry types
 * @module activity-entry
 */

/**
 * Create a generic activity entry
 * @param {Object} data - Activity entry data
 * @param {string} data.id - Unique identifier
 * @param {string} data.type - Type of activity ('commit' | 'email')
 * @param {string} data.author - Author name or email
 * @param {Date} data.date - Primary date (when work was done)
 * @param {Date} [data.alternateDate] - Secondary date (e.g., commit date for rebased commits)
 * @param {string} data.time - Time in HH:MM format
 * @param {string} data.subject - Subject/message
 * @param {Object} [data.metadata] - Additional metadata
 * @returns {Object} Activity entry object
 */
export const createActivityEntry = (data) => {
  if (!data.id) throw new Error('Activity entry requires an id');
  if (!data.type) throw new Error('Activity entry requires a type');
  if (!data.author) throw new Error('Activity entry requires an author');
  if (!data.date) throw new Error('Activity entry requires a date');
  if (!data.time) throw new Error('Activity entry requires a time');
  if (!data.subject) throw new Error('Activity entry requires a subject');

  return {
    id: data.id,
    type: data.type,
    author: data.author,
    date: data.date,
    alternateDate: data.alternateDate || null,
    time: data.time,
    subject: data.subject,
    metadata: data.metadata || {}
  };
};

/**
 * Create a commit entry (specialized activity entry)
 * @param {Object} commitData - Commit data
 * @param {string} commitData.hash - Commit hash
 * @param {string} commitData.author - Commit author
 * @param {Date} commitData.authorDate - Author date (when work was done)
 * @param {Date} commitData.commitDate - Commit date (when committed/rebased)
 * @param {string} commitData.time - Time in HH:MM format
 * @param {string} commitData.message - Commit message
 * @param {boolean} [commitData.isRebased] - Whether commit was rebased
 * @returns {Object} Commit entry object
 */
export const createCommitEntry = (commitData) => {
  return createActivityEntry({
    id: commitData.hash,
    type: 'commit',
    author: commitData.author,
    date: commitData.authorDate,
    alternateDate: commitData.commitDate,
    time: commitData.time,
    subject: commitData.message,
    metadata: {
      hash: commitData.hash,
      isRebased: commitData.isRebased || false,
      authorDate: commitData.authorDate,
      commitDate: commitData.commitDate
    }
  });
};

/**
 * Create a rebase summary entry
 * @param {Object} data - Rebase summary data
 * @param {number} data.count - Number of rebased commits
 * @param {Date} data.commitDate - Date when rebase occurred
 * @param {string} data.commitTime - Time of rebase in HH:MM format
 * @param {string} data.firstAuthorDate - First commit's author date (YYYY-MM-DD)
 * @param {string} data.lastAuthorDate - Last commit's author date (YYYY-MM-DD)
 * @param {Array<Object>} [data.commits] - Array of rebased commits
 * @returns {Object} Rebase summary object
 */
export const createRebaseSummary = (data) => {
  if (!data.count || data.count < 1) {
    throw new Error('Rebase summary requires a positive count');
  }
  if (!data.commitDate) throw new Error('Rebase summary requires a commitDate');
  if (!data.commitTime) throw new Error('Rebase summary requires a commitTime');
  if (!data.firstAuthorDate) throw new Error('Rebase summary requires firstAuthorDate');
  if (!data.lastAuthorDate) throw new Error('Rebase summary requires lastAuthorDate');

  return {
    type: 'rebase-summary',
    count: data.count,
    commitDate: data.commitDate,
    commitTime: data.commitTime,
    firstAuthorDate: data.firstAuthorDate,
    lastAuthorDate: data.lastAuthorDate,
    commits: data.commits || []
  };
};

/**
 * Create an email entry (specialized activity entry)
 * For future email analysis tool
 * @param {Object} emailData - Email data
 * @param {string} emailData.messageId - Email message ID
 * @param {string} emailData.from - Email sender
 * @param {Date} emailData.date - Email date
 * @param {string} emailData.time - Time in HH:MM format
 * @param {string} emailData.subject - Email subject
 * @param {string} [emailData.folder] - Email folder/mailbox
 * @returns {Object} Email entry object
 */
export const createEmailEntry = (emailData) => {
  return createActivityEntry({
    id: emailData.messageId,
    type: 'email',
    author: emailData.from,
    date: emailData.date,
    time: emailData.time,
    subject: emailData.subject,
    metadata: {
      messageId: emailData.messageId,
      folder: emailData.folder || 'INBOX'
    }
  });
};
