import { Alert } from 'react-native';
import api from '../services/api';
import { showDestructiveConfirm } from './confirmDialog';

const COUNT_LABELS = {
  teacher_assignments: 'Class/section assignments',
  teacher_attendance: 'Teacher attendance records',
  student_attendance_marked: 'Student attendance entries marked',
  lectures_uploaded: 'Lectures uploaded',
  lectures: 'Lectures',
  lectures_by_name: 'Lectures referencing this subject',
  chat_conversations: 'Chat conversations',
  sections: 'Sections',
  students: 'Enrolled students',
  notifications: 'Notifications',
  leave_applications: 'Leave applications',
  ai_documents: 'AI tutor documents',
  ai_chat_sessions: 'AI tutor chat sessions',
  ai_usage_logs: 'AI usage logs',
  admins: 'Campus admins',
  teachers: 'Teachers',
  classes: 'Classes',
  subjects: 'Subjects',
  parent_access: 'Parent access grants',
};

function formatImpactMessage(impact, entityLabel) {
  const lines = [];
  const name = impact?.name ? `"${impact.name}"` : `this ${entityLabel}`;

  if (impact?.blocking_reasons?.length) {
    lines.push('Cannot delete yet:');
    impact.blocking_reasons.forEach((reason) => lines.push(`• ${reason}`));
    lines.push('');
  }

  const counts = impact?.counts || {};
  const nonZero = Object.entries(counts).filter(([, value]) => Number(value) > 0);
  if (nonZero.length) {
    lines.push(`Archiving ${name} will keep the following linked data intact:`);
    nonZero.forEach(([key, value]) => {
      const label = COUNT_LABELS[key] || key.replace(/_/g, ' ');
      lines.push(`• ${label}: ${value}`);
    });
    lines.push('');
    lines.push(`The ${entityLabel} will be hidden everywhere but history is preserved.`);
  } else {
    lines.push(`Archive ${name}? It will be hidden from active lists but history is preserved.`);
  }

  return lines.join('\n');
}

/**
 * Fetches a /delete-impact endpoint and shows a richer confirmation before calling DELETE.
 *
 * @param {object} opts
 * @param {string} opts.impactPath  API path returning DeleteImpact (e.g. '/admin/teachers/12/delete-impact').
 * @param {string} opts.deletePath  API path to DELETE on confirmation.
 * @param {string} opts.entityLabel Short label ('teacher', 'class', 'subject', 'campus').
 * @param {string} [opts.title]
 * @param {() => (void|Promise<void>)} opts.onSuccess
 * @param {(err: unknown) => void} [opts.onError]
 * @param {object} [opts.deleteConfig] Extra config passed to api.delete (e.g. { data: { replacement_teacher_id } }).
 */
export async function confirmDeleteWithImpact({
  impactPath,
  deletePath,
  entityLabel,
  title,
  onSuccess,
  onError,
  deleteConfig,
}) {
  let impact = null;
  try {
    const res = await api.get(impactPath);
    impact = res?.data || null;
  } catch (err) {
    // If the impact endpoint is unreachable, fall back to a plain confirm
    impact = null;
  }

  const message = impact
    ? formatImpactMessage(impact, entityLabel)
    : `Delete this ${entityLabel}? Linked records will be preserved by archiving.`;

  const isBlocked = !!impact?.blocking_reasons?.length;
  const confirmText = isBlocked ? 'Force archive' : 'Archive';

  if (isBlocked && impact.mode_allowed !== 'archive') {
    // Hard-block: explain and stop.
    Alert.alert(title || `Cannot delete ${entityLabel}`, message);
    return;
  }

  showDestructiveConfirm({
    title: title || `Delete ${entityLabel}`,
    message,
    confirmText,
    onConfirm: async () => {
      try {
        await api.delete(deletePath, deleteConfig);
        if (onSuccess) await onSuccess();
      } catch (err) {
        const detail = err?.response?.data?.error || err?.message || `Failed to delete ${entityLabel}`;
        if (onError) onError(err);
        else Alert.alert('Error', String(detail));
      }
    },
  });
}
