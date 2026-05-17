const CARD_LIBRARY = {
  organizations: {
    icon: 'layers-outline',
    label: 'Organizations',
    description: 'Manage organizations and assign organization admins.',
    tint: '#7C3AED',
    bg: '#F5F3FF',
  },
  campuses: {
    icon: 'business-outline',
    label: 'Campuses',
    description: 'Manage campuses, branding, and campus admins.',
    tint: '#2563EB',
    bg: '#EFF6FF',
  },
  admins: {
    icon: 'person-circle-outline',
    label: 'Admins',
    description: 'Manage admin accounts and their access scope.',
    tint: '#7C3AED',
    bg: '#F5F3FF',
  },
  teachers: {
    icon: 'people-outline',
    label: 'Teachers',
    description: 'Manage teacher profiles, assignments, and access.',
    tint: '#0EA5E9',
    bg: '#F0F9FF',
  },
  students: {
    icon: 'school-outline',
    label: 'Students',
    description: 'Manage student records, placement, and access.',
    tint: '#10B981',
    bg: '#ECFDF5',
  },
  classes: {
    icon: 'library-outline',
    label: 'Classes',
    description: 'Manage classes and sections.',
    tint: '#F59E0B',
    bg: '#FFFBEB',
  },
  subjects: {
    icon: 'book-outline',
    label: 'Subjects',
    description: 'Manage subject lists and teaching structure.',
    tint: '#8B5CF6',
    bg: '#F5F3FF',
  },
  parents: {
    icon: 'people-circle-outline',
    label: 'Parents',
    description: 'Manage parent accounts and access.',
    tint: '#EC4899',
    bg: '#FCE7F3',
  },
  attendance: {
    icon: 'clipboard-outline',
    label: 'Attendance',
    description: 'Mark attendance for a class and section.',
    tint: '#2563EB',
    bg: '#EFF6FF',
  },
  attendanceReports: {
    icon: 'bar-chart-outline',
    label: 'Attendance Report',
    description: 'Review and export attendance reports.',
    tint: '#F59E0B',
    bg: '#FFFBEB',
  },
  teacherAttendanceReport: {
    icon: 'calendar-outline',
    label: 'Teacher Report',
    description: 'Review monthly teacher attendance.',
    tint: '#10B981',
    bg: '#ECFDF5',
  },
  leaves: {
    icon: 'mail-open-outline',
    label: 'Leaves',
    description: 'Review leave requests and pending actions.',
    tint: '#EF4444',
    bg: '#FEF2F2',
  },
  leaveApplications: {
    icon: 'document-text-outline',
    label: 'Leave Applications',
    description: 'Apply for leave or review leave status.',
    tint: '#F59E0B',
    bg: '#FFFBEB',
  },
  notifications: {
    icon: 'notifications-outline',
    label: 'Notifications',
    description: 'Send or review notifications.',
    tint: '#8B5CF6',
    bg: '#F5F3FF',
  },
  upload: {
    icon: 'cloud-upload-outline',
    label: 'Upload',
    description: 'Upload class work, homework, or materials.',
    tint: '#0891B2',
    bg: '#F0F9FF',
  },
  lectures: {
    icon: 'videocam-outline',
    label: 'Lectures',
    description: 'Browse lecture posts and uploaded work.',
    tint: '#2563EB',
    bg: '#EFF6FF',
  },
  aiMaterials: {
    icon: 'cloud-upload-outline',
    label: 'AI Materials',
    description: 'Upload and manage AI study materials.',
    tint: '#0EA5E9',
    bg: '#F0F9FF',
  },
  aiPolicy: {
    icon: 'shield-checkmark-outline',
    label: 'AI Policy',
    description: 'Control AI tutor settings and policies.',
    tint: '#7C3AED',
    bg: '#F5F3FF',
  },
  aiAnalytics: {
    icon: 'analytics-outline',
    label: 'AI Analytics',
    description: 'Review AI tutor usage and trends.',
    tint: '#F97316',
    bg: '#FFF7ED',
  },
  attendanceHistory: {
    icon: 'calendar-outline',
    label: 'Attendance History',
    description: 'View attendance history and totals.',
    tint: '#2563EB',
    bg: '#EFF6FF',
  },
  classWork: {
    icon: 'book-outline',
    label: 'Class Work',
    description: 'Browse class work files.',
    tint: '#4F46E5',
    bg: '#EEF2FF',
  },
  homework: {
    icon: 'clipboard-outline',
    label: 'Homework',
    description: 'Browse homework files.',
    tint: '#D97706',
    bg: '#FFFBEB',
  },
  aiTutor: {
    icon: 'sparkles-outline',
    label: 'AI Tutor',
    description: 'Ask questions from uploaded material.',
    tint: '#7C3AED',
    bg: '#F5F3FF',
  },
};

export function buildDashboardCard(type, overrides = {}) {
  const base = CARD_LIBRARY[type];
  if (!base) {
    throw new Error(`Unknown dashboard card type: ${type}`);
  }

  return {
    ...base,
    ...overrides,
  };
}

export function buildDashboardCards(definitions = []) {
  return definitions.map(({ type, ...overrides }) => buildDashboardCard(type, overrides));
}

export { CARD_LIBRARY };