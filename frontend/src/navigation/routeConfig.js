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
import StudentHistoryScreen from '../screens/student/StudentHistoryScreen';
import StudentLeaveScreen from '../screens/student/StudentLeaveScreen';
import StudentLecturesScreen from '../screens/student/StudentLecturesScreen';
import StudentLectureDetailScreen from '../screens/student/StudentLectureDetailScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';

const HIDDEN_HEADER = { headerShown: false };

export const teacherHomeScreens = [
  { name: 'Home', component: HomeScreen },
  { name: 'ClassSelection', component: ClassSelectionScreen },
  { name: 'StudentAttendance', component: StudentAttendanceScreen },
  { name: 'AddStudent', component: AddStudentScreen, options: { title: 'Add Student' } },
  { name: 'TeacherLeaves', component: TeacherLeavesScreen, options: { ...HIDDEN_HEADER, title: 'Leave Requests' } },
  { name: 'Report', component: ReportScreen },
  { name: 'StudentAttendanceDetail', component: StudentAttendanceDetailScreen },
  { name: 'UploadLecture', component: UploadLectureScreen },
  { name: 'LectureList', component: LectureListScreen },
  { name: 'SendNotification', component: SendNotificationScreen },
  { name: 'StaffNotifications', component: StaffNotificationsScreen },
  { name: 'ChatList', component: ChatListScreen },
  { name: 'Chat', component: ChatScreen, options: { headerShown: false } },
  { name: 'StaffNewChat', component: StaffNewChatScreen, options: { headerShown: false } },
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
];

export const studentHomeScreens = [
  { name: 'StudentHome', component: StudentHomeScreen },
  { name: 'StudentHistory', component: StudentHistoryScreen },
  { name: 'StudentLeaves', component: StudentLeaveScreen },
  { name: 'StudentClasswork', component: StudentLecturesScreen, initialParams: { fixedType: 'classwork', title: 'Class Work' } },
  { name: 'StudentHomework', component: StudentLecturesScreen, initialParams: { fixedType: 'homework', title: 'Homework' } },
  { name: 'StudentLectureDetail', component: StudentLectureDetailScreen },
  { name: 'StudentNotifications', component: StudentNotificationsScreen },
];

export function buildParentChildScreens(activeChild) {
  return [
    { name: 'StudentHome', component: StudentHomeScreen, initialParams: { child: activeChild } },
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
    { name: 'StudentLectureDetail', component: StudentLectureDetailScreen },
    { name: 'StudentNotifications', component: StudentNotificationsScreen, initialParams: { child: activeChild } },
  ];
}

export function getParentStackScreens(parentStudentPortalTabsComponent, parentDashboardScreenComponent) {
  return [
    { name: 'ParentDashboard', component: parentDashboardScreenComponent },
    { name: 'ChildStudentPortal', component: parentStudentPortalTabsComponent },
    { name: 'ChatList', component: ChatListScreen },
    { name: 'Chat', component: ChatScreen, options: { headerShown: false } },
    { name: 'NewChat', component: NewChatScreen, options: { headerShown: false } },
  ];
}
