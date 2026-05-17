// frontend/src/features/aiTutor/index.js
// Public exports for the AI Tutor feature module.
export { default as StudentAiTutorHomeScreen } from './screens/StudentAiTutorHomeScreen';
export { default as StudentAiMaterialsScreen } from './screens/StudentAiMaterialsScreen';
export { default as StudentAiChatScreen } from './screens/StudentAiChatScreen';
export { default as TeacherAiMaterialsScreen } from './screens/TeacherAiMaterialsScreen';
export { default as AdminAiPolicyScreen } from './screens/AdminAiHierarchyScreen';
export { default as AdminAiPolicyAdvancedScreen } from './screens/AdminAiPolicyScreen';
export { default as AdminAiAnalyticsScreen } from './screens/AdminAiAnalyticsScreen';

export { default as useAiTutorConfig } from './hooks/useAiTutorConfig';
export { default as useAiTutorChat } from './hooks/useAiTutorChat';
export * as aiTutorApi from './api/aiTutorApi';
