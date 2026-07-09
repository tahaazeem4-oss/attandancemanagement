import StaffNotificationsScreen from '../screens/StaffNotificationsScreen';
import SendNotificationScreen from '../screens/SendNotificationScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import StaffNewChatScreen from '../screens/chat/StaffNewChatScreen';
import UploadLectureScreen from '../screens/UploadLectureScreen';
import LectureListScreen from '../screens/LectureListScreen';

import HomeScreen from '../screens/HomeScreen';
import ClassSelectionScreen from '../screens/ClassSelectionScreen';
import StudentAttendanceScreen from '../screens/StudentAttendanceScreen';
import AddStudentScreen from '../screens/AddStudentScreen';
import ReportScreen from '../screens/ReportScreen';
import TeacherLeavesScreen from '../screens/TeacherLeavesScreen';
import StudentAttendanceDetailScreen from '../screens/StudentAttendanceDetailScreen';
import TeacherStudentsScreen from '../screens/TeacherStudentsScreen';
import TeacherSubjectsScreen from '../screens/TeacherSubjectsScreen';

import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import AdminTeachersScreen from '../screens/admin/AdminTeachersScreen';
import AdminStudentsScreen from '../screens/admin/AdminStudentsScreen';
import AdminClassesScreen from '../screens/admin/AdminClassesScreen';
import AdminAssignmentsScreen from '../screens/admin/AdminAssignmentsScreen';
import AdminLeavesScreen from '../screens/admin/AdminLeavesScreen';
import AdminSubjectsScreen from '../screens/admin/AdminSubjectsScreen';
import AdminParentsScreen from '../screens/admin/AdminParentsScreen';
import AdminTeacherAttendanceScreen from '../screens/admin/AdminTeacherAttendanceScreen';

import SuperAdminHomeScreen from '../screens/superadmin/SuperAdminHomeScreen';
import SuperAdminOrganizationsScreen from '../screens/superadmin/SuperAdminOrganizationsScreen';
import SuperAdminSchoolsScreen from '../screens/superadmin/SuperAdminSchoolsScreen';
import SuperAdminTeachersScreen from '../screens/superadmin/SuperAdminTeachersScreen';
import SuperAdminStudentsScreen from '../screens/superadmin/SuperAdminStudentsScreen';
import SuperAdminClassesScreen from '../screens/superadmin/SuperAdminClassesScreen';
import SuperAdminSubjectsScreen from '../screens/superadmin/SuperAdminSubjectsScreen';
import SuperAdminParentsScreen from '../screens/superadmin/SuperAdminParentsScreen';

import OrgAdminHomeScreen from '../screens/orgadmin/OrgAdminHomeScreen';
import OrgAdminCampusesScreen from '../screens/orgadmin/OrgAdminCampusesScreen';
import OrgAdminAdminsScreen from '../screens/orgadmin/OrgAdminAdminsScreen';
import OrgAdminTeachersScreen from '../screens/orgadmin/OrgAdminTeachersScreen';
import OrgAdminStudentsScreen from '../screens/orgadmin/OrgAdminStudentsScreen';
import OrgAdminClassesScreen from '../screens/orgadmin/OrgAdminClassesScreen';
import OrgAdminParentsScreen from '../screens/orgadmin/OrgAdminParentsScreen';
import OrgAdminLeavesScreen from '../screens/orgadmin/OrgAdminLeavesScreen';
import OrgAdminNotificationsScreen from '../screens/orgadmin/OrgAdminNotificationsScreen';
import OrgAdminSubjectsScreen from '../screens/orgadmin/OrgAdminSubjectsScreen';

import StudentHomeScreen from '../screens/student/StudentHomeScreen';
import StudentProfileScreen from '../screens/student/StudentProfileScreen';
import StudentHistoryScreen from '../screens/student/StudentHistoryScreen';
import StudentLeaveScreen from '../screens/student/StudentLeaveScreen';
import StudentLecturesScreen from '../screens/student/StudentLecturesScreen';
import StudentLectureDetailScreen from '../screens/student/StudentLectureDetailScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';
import StudentTimetableScreen from '../screens/student/StudentTimetableScreen';
import ProfileScreen from '../screens/ProfileScreen';

import {
  StudentAiTutorHomeScreen,
  StudentAiMaterialsScreen,
  StudentAiChatScreen,
  StudentAiAnalyticsScreen,
  TeacherAiMaterialsScreen,
  AdminAiPolicyScreen,
  AdminAiPolicyAdvancedScreen,
  AdminAiAnalyticsScreen,
} from '../features/aiTutor';
import {
  AdminTimetableScreen,
  OrgAdminTimetableScreen,
  TeacherTimetableScreen,
} from '../features/timetable';

const HIDDEN_HEADER = { headerShown: false };

export const teacherHomeScreens = [
  { name: 'Home', component: HomeScreen },
  { name: 'ClassSelection', component: ClassSelectionScreen },
  { name: 'StudentAttendance', component: StudentAttendanceScreen },
  { name: 'AddStudent', component: AddStudentScreen, options: { title: 'Add Student' } },
  { name: 'TeacherStudents', component: TeacherStudentsScreen },
  { name: 'TeacherLeaves', component: TeacherLeavesScreen, options: { ...HIDDEN_HEADER, title: 'Leave Requests' } },
  { name: 'Report', component: ReportScreen },
  { name: 'StudentAttendanceDetail', component: StudentAttendanceDetailScreen },
  { name: 'UploadLecture', component: UploadLectureScreen },
  { name: 'LectureList', component: LectureListScreen },
  { name: 'TeacherSubjects', component: TeacherSubjectsScreen, options: HIDDEN_HEADER },
  { name: 'SendNotification', component: SendNotificationScreen },
  { name: 'StaffNotifications', component: StaffNotificationsScreen },
  { name: 'ChatList', component: ChatListScreen },
  { name: 'Chat', component: ChatScreen, options: { headerShown: false } },
  { name: 'StaffNewChat', component: StaffNewChatScreen, options: { headerShown: false } },
  { name: 'TeacherAiMaterials', component: TeacherAiMaterialsScreen, options: { title: 'AI Study Materials' } },
  { name: 'TeacherTimetable', component: TeacherTimetableScreen },
];

export const adminHomeScreens = [
  { name: 'AdminHome', component: AdminHomeScreen },
  { name: 'AdminTeachers', component: AdminTeachersScreen },
  { name: 'AdminStudents', component: AdminStudentsScreen },
  { name: 'AdminClasses', component: AdminClassesScreen },
  { name: 'AdminAssignments', component: AdminAssignmentsScreen },
  { name: 'AdminLeaves', component: AdminLeavesScreen },
  { name: 'SendNotification', component: SendNotificationScreen },
  { name: 'UploadLecture', component: UploadLectureScreen },
  { name: 'LectureList', component: LectureListScreen },
  { name: 'AdminSubjects', component: AdminSubjectsScreen },
  { name: 'AdminParents', component: AdminParentsScreen },
  { name: 'StaffNotifications', component: StaffNotificationsScreen },
  { name: 'AdminTeacherAttendance', component: AdminTeacherAttendanceScreen },
  { name: 'Report', component: ReportScreen },
  { name: 'StudentAttendanceDetail', component: StudentAttendanceDetailScreen },
  { name: 'ChatList', component: ChatListScreen },
  { name: 'Chat', component: ChatScreen, options: { headerShown: false } },
  { name: 'StaffNewChat', component: StaffNewChatScreen, options: { headerShown: false } },
  { name: 'TeacherAiMaterials', component: TeacherAiMaterialsScreen, options: { title: 'AI Study Materials' } },
  { name: 'AdminAiPolicy', component: AdminAiPolicyScreen, options: { title: 'AI Tutor Policies' } },
  { name: 'AdminAiPolicyAdvanced', component: AdminAiPolicyAdvancedScreen, options: { title: 'AI Tutor Policies (Advanced)' } },
  { name: 'AdminAiAnalytics', component: AdminAiAnalyticsScreen, options: { title: 'AI Tutor Analytics' } },
  { name: 'AdminTimetable', component: AdminTimetableScreen },
];

export const orgAdminHomeScreens = [
  { name: 'OrgAdminHome', component: OrgAdminHomeScreen },
  { name: 'OrgAdminCampuses', component: OrgAdminCampusesScreen },
  { name: 'OrgAdminAdmins', component: OrgAdminAdminsScreen },
  { name: 'OrgAdminTeachers', component: OrgAdminTeachersScreen },
  { name: 'OrgAdminStudents', component: OrgAdminStudentsScreen },
  { name: 'OrgAdminClasses', component: OrgAdminClassesScreen },
  { name: 'OrgAdminParents', component: OrgAdminParentsScreen },
  { name: 'OrgAdminLeaves', component: OrgAdminLeavesScreen },
  { name: 'OrgAdminNotifications', component: OrgAdminNotificationsScreen },
  { name: 'OrgAdminSubjects', component: OrgAdminSubjectsScreen },
  { name: 'StaffNotifications', component: StaffNotificationsScreen },
  { name: 'AdminAiPolicy', component: AdminAiPolicyScreen, options: { title: 'AI Tutor Policies' } },
  { name: 'AdminAiPolicyAdvanced', component: AdminAiPolicyAdvancedScreen, options: { title: 'AI Tutor Policies (Advanced)' } },
  { name: 'AdminAiAnalytics', component: AdminAiAnalyticsScreen, options: { title: 'AI Tutor Analytics' } },
  { name: 'OrgAdminTimetable', component: OrgAdminTimetableScreen },
];

export const superAdminHomeScreens = [
  { name: 'SuperAdminHome', component: SuperAdminHomeScreen },
  { name: 'SuperAdminOrganizations', component: SuperAdminOrganizationsScreen },
  { name: 'SuperAdminSchools', component: SuperAdminSchoolsScreen },
  { name: 'SuperAdminTeachers', component: SuperAdminTeachersScreen },
  { name: 'SuperAdminStudents', component: SuperAdminStudentsScreen },
  { name: 'SuperAdminClasses', component: SuperAdminClassesScreen },
  { name: 'SuperAdminSubjects', component: SuperAdminSubjectsScreen },
  { name: 'SuperAdminParents', component: SuperAdminParentsScreen },
  { name: 'StaffNotifications', component: StaffNotificationsScreen },
  { name: 'AdminAiPolicy', component: AdminAiPolicyScreen, options: { title: 'AI Tutor Policies' } },
  { name: 'AdminAiPolicyAdvanced', component: AdminAiPolicyAdvancedScreen, options: { title: 'AI Tutor Policies (Advanced)' } },
  { name: 'AdminAiAnalytics', component: AdminAiAnalyticsScreen, options: { title: 'AI Tutor Analytics' } },
];

export const studentHomeScreens = [
  { name: 'StudentHome', component: StudentHomeScreen },
  { name: 'StudentProfile', component: StudentProfileScreen, options: { title: 'Student Profile' } },
  { name: 'StudentHistory', component: StudentHistoryScreen },
  { name: 'StudentLeaves', component: StudentLeaveScreen },
  { name: 'StudentClasswork', component: StudentLecturesScreen, initialParams: { fixedType: 'classwork', title: 'Class Work' } },
  { name: 'StudentHomework', component: StudentLecturesScreen, initialParams: { fixedType: 'homework', title: 'Homework' } },
  { name: 'StudentTimetable', component: StudentTimetableScreen, options: { title: 'Timetable' } },
  { name: 'StudentLectureDetail', component: StudentLectureDetailScreen },
  { name: 'StudentNotifications', component: StudentNotificationsScreen },
  { name: 'StudentAiTutorHome', component: StudentAiTutorHomeScreen, options: HIDDEN_HEADER },
  { name: 'StudentAiMaterials', component: StudentAiMaterialsScreen, options: HIDDEN_HEADER },
  { name: 'StudentAiChat', component: StudentAiChatScreen, options: HIDDEN_HEADER },
  { name: 'StudentAiAnalytics', component: StudentAiAnalyticsScreen, options: HIDDEN_HEADER },
];

export function buildParentChildScreens(activeChild) {
  return [
    { name: 'StudentHome', component: StudentHomeScreen, initialParams: { child: activeChild } },
    { name: 'StudentProfile', component: StudentProfileScreen, initialParams: { child: activeChild }, options: { title: 'Student Profile' } },
    { name: 'StudentHistory', component: StudentHistoryScreen, initialParams: { child: activeChild } },
    { name: 'StudentLeaves', component: StudentLeaveScreen, initialParams: { child: activeChild } },
    {
      name: 'StudentClasswork',
      component: StudentLecturesScreen,
      initialParams: { fixedType: 'classwork', title: 'Class Work', child: activeChild },
    },
    {
      name: 'StudentHomework',
      component: StudentLecturesScreen,
      initialParams: { fixedType: 'homework', title: 'Homework', child: activeChild },
    },
    { name: 'StudentTimetable', component: StudentTimetableScreen, initialParams: { child: activeChild }, options: { title: 'Timetable' } },
    { name: 'StudentAiTutorHome', component: StudentAiTutorHomeScreen, options: HIDDEN_HEADER, initialParams: { child: activeChild } },
    { name: 'StudentAiMaterials', component: StudentAiMaterialsScreen, options: HIDDEN_HEADER, initialParams: { child: activeChild } },
    { name: 'StudentAiChat', component: StudentAiChatScreen, options: HIDDEN_HEADER, initialParams: { child: activeChild } },
    { name: 'StudentAiAnalytics', component: StudentAiAnalyticsScreen, options: HIDDEN_HEADER, initialParams: { child: activeChild } },
    { name: 'StudentLectureDetail', component: StudentLectureDetailScreen },
    { name: 'StudentNotifications', component: StudentNotificationsScreen, initialParams: { child: activeChild } },
  ];
}

export function getParentStackScreens(parentStudentPortalTabsComponent, parentDashboardScreenComponent) {
  return [
    { name: 'ParentDashboard', component: parentDashboardScreenComponent },
    { name: 'ParentProfile', component: ProfileScreen, options: { headerShown: false } },
    { name: 'ChildStudentPortal', component: parentStudentPortalTabsComponent },
    { name: 'ChatList', component: ChatListScreen },
    { name: 'Chat', component: ChatScreen, options: { headerShown: false } },
    { name: 'NewChat', component: NewChatScreen, options: { headerShown: false } },
  ];
}
