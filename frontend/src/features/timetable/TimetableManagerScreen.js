import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from '../../components/AppHeader';
import PickerField from '../../components/PickerField';
import api from '../../services/api';
import { C } from '../../config/theme';

// --- Constants ----------------------------------------------------------------
const DAY_OPTIONS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const SLOT_TYPE_ITEMS = [
  { label: 'Instruction', value: 'instruction' },
  { label: 'Break', value: 'break' },
  { label: 'Assembly', value: 'assembly' },
  { label: 'Free Period', value: 'free_period' },
  { label: 'Other', value: 'other' },
];

const SLOT_TYPE_COLORS = {
  instruction: { bg: '#EEF2FF', text: '#4338CA' },
  break: { bg: '#FEF3C7', text: '#92400E' },
  assembly: { bg: '#ECFDF5', text: '#065F46' },
  free_period: { bg: '#F0F9FF', text: '#0369A1' },
  other: { bg: '#F1F5F9', text: '#475569' },
};

const SUBJECT_PALETTE = [
  { bg: '#DBEAFE', text: '#1D4ED8' },
  { bg: '#D1FAE5', text: '#065F46' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#EDE9FE', text: '#5B21B6' },
  { bg: '#FFEDD5', text: '#C2410C' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#CFFAFE', text: '#155E75' },
  { bg: '#F0FDF4', text: '#15803D' },
];

const CELL_W = 64;
const LABEL_W = 68;

// --- Helpers ------------------------------------------------------------------
function entryKey(dayKey, slotId) {
  return `${dayKey}:${slotId}`;
}

function compactTime(v) {
  return String(v || '').slice(0, 5);
}

function subjectColor(subjectId) {
  if (!subjectId) return null;
  return SUBJECT_PALETTE[Number(subjectId) % SUBJECT_PALETTE.length];
}

function parseTimeStr(str) {
  const [h, m] = (str || '08:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 8, m || 0, 0, 0);
  return d;
}

function formatDateToTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildEntryMap(entries) {
  const next = {};
  (entries || []).forEach((entry) => {
    next[entryKey(entry.day_key, entry.slot_id)] = {
      subject_id: entry.subject_id ? String(entry.subject_id) : '',
      teacher_id: entry.teacher_id ? String(entry.teacher_id) : '',
      note: entry.note || '',
      subject_name: entry.subject_name || '',
      teacher_name: entry.teacher_name || '',
    };
  });
  return next;
}

function buildClassesFromAssignments(assignments) {
  const byClass = new Map();
  (assignments || []).forEach((a) => {
    const cid = String(a.class_id);
    if (!byClass.has(cid)) byClass.set(cid, { id: a.class_id, class_name: a.class_name, sections: [] });
    byClass.get(cid).sections.push({ id: a.section_id, section_name: a.section_name });
  });
  return Array.from(byClass.values());
}

// --- TimePickerField ----------------------------------------------------------
function TimePickerField({ value, onChange }) {
  const [show, setShow] = useState(false);

  const handleChange = useCallback((event, selected) => {
    if (Platform.OS === 'android') setShow(false);
    if (selected && event.type !== 'dismissed') onChange(formatDateToTime(selected));
  }, [onChange]);

  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={() => setShow(true)} style={styles.timeTrigger}>
        <Text style={styles.timeTriggerText}>{value || '--:--'}</Text>
        <Text style={styles.timeTriggerIcon}>{'\u23F1'}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={parseTimeStr(value)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

// --- CellEditorModal ----------------------------------------------------------
function CellEditorModal({ visible, cell, draft, setDraft, teacherItems, subjectItems, teacherSubjects, teacherBusy, mode, onSave, onClear, onClose }) {
  const busyTeacherIds = useMemo(() => {
    if (!cell) return new Set();
    const ids = new Set();
    Object.entries(teacherBusy || {}).forEach(([tid, slots]) => {
      if ((slots || []).some((s) => s.day_key === cell.dayKey && Number(s.slot_id) === Number(cell.slotId))) {
        ids.add(String(tid));
      }
    });
    return ids;
  }, [cell, teacherBusy]);

  const filteredTeachers = useMemo(() => {
    const base = teacherItems.filter((t) => t.value === '' || !busyTeacherIds.has(String(t.value)));
    if (!draft.subject_id) return base;
    const sid = Number(draft.subject_id);
    return [
      { label: 'Not assigned', value: '' },
      ...base.filter((t) => t.value !== '' && (teacherSubjects[t.value] || []).includes(sid)),
    ];
  }, [draft.subject_id, teacherItems, teacherSubjects, busyTeacherIds]);

  const conflictNames = useMemo(() => {
    if (!cell) return [];
    const names = [];
    Object.entries(teacherBusy || {}).forEach(([tid, slots]) => {
      const hit = (slots || []).find((s) => s.day_key === cell.dayKey && Number(s.slot_id) === Number(cell.slotId));
      if (!hit) return;
      const t = teacherItems.find((x) => String(x.value) === String(tid));
      if (t) names.push({ teacher: t.label, where: `${hit.class_name || ''}${hit.section_name ? ' - ' + hit.section_name : ''}` });
    });
    return names;
  }, [cell, teacherBusy, teacherItems]);

  const handleSubjectChange = useCallback((value) => {
    setDraft((prev) => ({ ...prev, subject_id: value, teacher_id: '' }));
  }, [setDraft]);

  if (!cell) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <SafeAreaView style={styles.bottomSheet} pointerEvents="box-none">
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{cell.dayLabel}</Text>
        <Text style={styles.sheetSubtitle}>{cell.slotName} - {cell.slotTime}</Text>

        <PickerField
          label="Subject"
          value={draft.subject_id}
          onChange={handleSubjectChange}
          items={subjectItems}
          placeholder="Select subject"
        />

        {mode !== 'teacher' ? (
          <PickerField
            label="Teacher"
            value={draft.teacher_id}
            onChange={(v) => setDraft((prev) => ({ ...prev, teacher_id: v }))}
            items={filteredTeachers}
            placeholder="Select teacher"
          />
        ) : null}

        {mode !== 'teacher' && draft.subject_id && filteredTeachers.length <= 1 ? (
          <Text style={styles.hintText}>
            No available teacher in this section is mapped to the selected subject for this slot.
          </Text>
        ) : null}

        {mode !== 'teacher' && conflictNames.length ? (
          <Text style={styles.hintText}>
            Hidden (already booked this slot): {conflictNames.map((c) => `${c.teacher} -> ${c.where}`).join(', ')}
          </Text>
        ) : null}

        <TextInput
          value={draft.note}
          onChangeText={(v) => setDraft((prev) => ({ ...prev, note: v }))}
          placeholder="Note (optional)"
          style={styles.noteInput}
          placeholderTextColor={C.textLight}
          multiline
          numberOfLines={2}
        />

        <View style={styles.sheetActions}>
          <Pressable style={styles.clearBtn} onPress={onClear}>
            <Text style={styles.clearBtnText}>Clear cell</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={onSave}>
            <LinearGradient colors={C.brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
              <Text style={styles.saveBtnText}>Save</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// --- ScheduleGrid -------------------------------------------------------------
function ScheduleGrid({ activeDays, activeSlots, entriesMap, canEditEntries, onCellPress }) {
  if (!activeDays.length || !activeSlots.length) {
    return <Text style={styles.emptyText}>No structure configured yet. Set up working days and slots in the Structure tab.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
      <View>
        {/* Header row */}
        <View style={styles.gridRow}>
          <View style={[styles.gridLabelCell, styles.gridHeaderLabel]}>
            <Text style={styles.gridHeaderLabelText}>Slot</Text>
          </View>
          {activeDays.map((day) => (
            <View key={day.day_key} style={[styles.gridDayCell, styles.gridHeaderDay]}>
              <Text style={styles.gridHeaderDayText}>{day.day_label.slice(0, 3)}</Text>
            </View>
          ))}
        </View>

        {/* Slot rows */}
        {activeSlots.map((slot) => {
          const isBreak = slot.slot_type !== 'instruction';
          const breakColors = SLOT_TYPE_COLORS[slot.slot_type] || SLOT_TYPE_COLORS.other;

          return (
            <View key={slot.id || slot._localId} style={styles.gridRow}>
              {/* Left label */}
              <View style={styles.gridLabelCell}>
                <Text style={styles.gridSlotName} numberOfLines={1}>{slot.slot_name}</Text>
                <Text style={styles.gridSlotTime}>{compactTime(slot.start_time)}</Text>
                {typeof slot.id !== 'number' ? (
                  <Text style={styles.gridUnsavedBadge}>UNSAVED</Text>
                ) : null}
              </View>

              {/* Day cells */}
              {activeDays.map((day) => {
                const slotDayKeys = Array.isArray(slot.day_keys) && slot.day_keys.length ? slot.day_keys : null;
                const slotInDay = !slotDayKeys || slotDayKeys.includes(day.day_key);
                if (!slotInDay) {
                  return (
                    <View key={day.day_key} style={[styles.gridDayCell, styles.gridEntryCell, styles.gridOffCell]}>
                      <Text style={styles.gridOffText}>--</Text>
                    </View>
                  );
                }
                const entry = entriesMap[entryKey(day.day_key, slot.id ?? slot._localId)] || {};
                const color = entry.subject_id ? subjectColor(entry.subject_id) : null;

                return (
                  <Pressable
                    key={day.day_key}
                    style={[
                      styles.gridDayCell,
                      styles.gridEntryCell,
                      isBreak ? { backgroundColor: breakColors.bg } : null,
                      !isBreak && color ? { backgroundColor: color.bg } : null,
                      canEditEntries && !isBreak ? styles.gridCellTappable : null,
                    ]}
                    onPress={() => !isBreak && canEditEntries && onCellPress(day, slot, entry)}
                    disabled={isBreak || !canEditEntries}
                  >
                    {isBreak ? (
                      <Text style={[styles.gridBreakText, { color: breakColors.text }]} numberOfLines={2}>
                        {String(slot.slot_type).replace(/_/g, '\n')}
                      </Text>
                    ) : (
                      <Text
                        style={[styles.gridSubjectText, color ? { color: color.text } : styles.gridEmptyText]}
                        numberOfLines={2}
                      >
                        {entry.subject_name
                          ? entry.subject_name.length > 7 ? entry.subject_name.slice(0, 6) + '...' : entry.subject_name
                          : '-'}
                      </Text>
                    )}
                    {!isBreak && entry.teacher_name && color ? (
                      <Text style={[styles.gridTeacherText, { color: color.text }]} numberOfLines={1}>
                        {entry.teacher_name.split(' ').map((w) => w[0]).join('').slice(0, 3)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// --- Main Component -----------------------------------------------------------
export default function TimetableManagerScreen({ navigation, mode = 'teacher' }) {
  const [metaLoading, setMetaLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('neutral');

  const [meta, setMeta] = useState(null);
  const [entriesMap, setEntriesMap] = useState({});
  const [structureDays, setStructureDays] = useState([]);
  const [structureSlots, setStructureSlots] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState({});
  const [teacherBusy, setTeacherBusy] = useState({});

  const [selectedCampus, setSelectedCampus] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  const [activeTab, setActiveTab] = useState('schedule');
  const [editingCell, setEditingCell] = useState(null);
  const [cellDraft, setCellDraft] = useState({ subject_id: '', teacher_id: '', note: '' });

  const [savingDraft, setSavingDraft] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingTeacherSubject, setSavingTeacherSubject] = useState(null);

  const [quickGen, setQuickGen] = useState({ startTime: '08:00', periods: 8, periodMin: '45', breakMin: '30', breakAfter: '4', includeAssembly: true, days: [], mode: 'append' });
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', label: '' });
  const [savingHoliday, setSavingHoliday] = useState(false);

  const canManageStructure = mode === 'admin' || mode === 'orgadmin';
  const canEditEntries = mode === 'admin' || mode === 'orgadmin' || meta?.teacher_role === 'floor_incharge';
  const showTeachersTab = mode === 'admin' || mode === 'orgadmin';

  const tabs = useMemo(() => {
    const t = [{ key: 'schedule', label: 'Schedule' }];
    if (canManageStructure) t.push({ key: 'structure', label: 'Structure' });
    if (showTeachersTab) t.push({ key: 'teachers', label: 'Teachers' });
    return t;
  }, [canManageStructure, showTeachersTab]);

  // -- Load meta --------------------------------------------------------------
  const reloadMeta = useCallback(async (campusId) => {
    setMetaLoading(true);
    setMessage('');
    try {
      const params = mode === 'orgadmin' && campusId ? { school_id: campusId } : undefined;
      const { data } = await api.get('/timetable/meta', { params });
      setMeta(data);
      setStructureDays((data.days || []).map((d) => ({ day_key: d.day_key, day_label: d.day_label, is_active: d.is_active !== false })));
      setStructureSlots((data.slots || []).map((s, i) => ({
        id: s.id, _localId: s.id,
        slot_name: s.slot_name,
        start_time: compactTime(s.start_time),
        end_time: compactTime(s.end_time),
        slot_type: s.slot_type || 'instruction',
        display_order: i + 1,
        is_active: s.is_active !== false,
        day_keys: Array.isArray(s.day_keys) && s.day_keys.length ? s.day_keys : null,
      })));

      if (mode === 'orgadmin') setSelectedCampus(String(data.school_id || campusId || ''));

      const tSubjects = {};
      (data.teachers || []).forEach((t) => { tSubjects[String(t.id)] = (t.subject_ids || []).map(Number); });
      setTeacherSubjects(tSubjects);

      const classes = mode === 'teacher' ? buildClassesFromAssignments(data.assignments) : (data.classes || []);
      const firstClass = classes[0];
      if (firstClass) {
        setSelectedClass((sc) => sc || String(firstClass.id));
        const firstSection = firstClass.sections?.[0];
        if (firstSection) setSelectedSection((ss) => ss || String(firstSection.id));
      }
    } catch (err) {
      setMessageTone('danger');
      setMessage(err?.response?.data?.message || 'Could not load timetable setup.');
    } finally {
      setMetaLoading(false);
    }
  }, [mode]);

  useFocusEffect(useCallback(() => { reloadMeta(''); }, [reloadMeta]));

  // -- Derived data -----------------------------------------------------------
  const classes = useMemo(
    () => mode === 'teacher' ? buildClassesFromAssignments(meta?.assignments) : (meta?.classes || []),
    [meta, mode],
  );

  const sections = useMemo(() => {
    const cls = classes.find((c) => String(c.id) === String(selectedClass));
    return cls?.sections || [];
  }, [classes, selectedClass]);

  const activeDays = useMemo(() => structureDays.filter((d) => d.is_active !== false), [structureDays]);
  const activeSlots = useMemo(() => structureSlots.filter((s) => s.is_active !== false), [structureSlots]);

  const teacherItems = useMemo(() => {
    if (mode === 'teacher') return [{ label: 'Not assigned', value: '' }];
    const all = meta?.teachers || [];
    const sid = Number(selectedSection);
    const cid = Number(selectedClass);
    const scoped = sid
      ? all.filter((t) => (t.assignments || []).some((a) =>
          Number(a.section_id) === sid && (!cid || Number(a.class_id) === cid),
        ))
      : all;
    return [
      { label: 'Not assigned', value: '' },
      ...scoped.map((t) => ({
        label: t.full_name || `${t.first_name || ''} ${t.last_name || ''}`.trim(),
        value: String(t.id),
      })),
    ];
  }, [meta?.teachers, mode, selectedClass, selectedSection]);

  const subjectItems = useMemo(
    () => [{ label: 'Select subject', value: '' }, ...(meta?.subjects || []).map((s) => ({ label: s.name, value: String(s.id) }))],
    [meta?.subjects],
  );

  // -- Load section entries ---------------------------------------------------
  const loadSection = useCallback(async () => {
    if (!selectedClass || !selectedSection) { setEntriesMap({}); return; }
    setSectionLoading(true);
    try {
      const params = {
        class_id: selectedClass,
        section_id: selectedSection,
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
        status: canEditEntries ? 'draft' : 'published',
      };
      const { data } = await api.get('/timetable/section', { params });
      setEntriesMap(buildEntryMap(data.entries || []));
    } catch {
      setEntriesMap({});
    } finally {
      setSectionLoading(false);
    }
  }, [canEditEntries, mode, selectedCampus, selectedClass, selectedSection]);

  useEffect(() => { loadSection(); }, [loadSection]);

  // -- Load teacher-busy map (other sections in this school) -----------------
  const loadBusy = useCallback(async () => {
    if (!selectedClass || !selectedSection || mode === 'teacher') { setTeacherBusy({}); return; }
    try {
      const params = {
        exclude_class_id: selectedClass,
        exclude_section_id: selectedSection,
        status: 'draft',
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
      };
      const { data } = await api.get('/timetable/teacher-busy', { params });
      setTeacherBusy(data?.busy || {});
    } catch {
      setTeacherBusy({});
    }
  }, [mode, selectedCampus, selectedClass, selectedSection]);

  useEffect(() => { loadBusy(); }, [loadBusy]);

  // -- Holidays --------------------------------------------------------------
  const loadHolidays = useCallback(async () => {
    if (mode === 'teacher') { setHolidays([]); return; }
    try {
      const params = mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {};
      const { data } = await api.get('/timetable/holidays', { params });
      setHolidays(data?.holidays || []);
    } catch {
      setHolidays([]);
    }
  }, [mode, selectedCampus]);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const addHoliday = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday.date)) {
      setMessageTone('danger'); setMessage('Holiday date must be YYYY-MM-DD.'); return;
    }
    setSavingHoliday(true);
    try {
      await api.post('/timetable/holidays', {
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
        holiday_date: newHoliday.date,
        label: newHoliday.label || null,
      });
      setNewHoliday({ date: '', label: '' });
      await loadHolidays();
      setMessageTone('neutral'); setMessage('Holiday added.');
    } catch (err) {
      setMessageTone('danger'); setMessage(err?.response?.data?.message || 'Could not add holiday.');
    } finally {
      setSavingHoliday(false);
    }
  }, [loadHolidays, mode, newHoliday, selectedCampus]);

  const removeHoliday = useCallback(async (id) => {
    try {
      const params = mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {};
      await api.delete(`/timetable/holidays/${id}`, { params });
      await loadHolidays();
    } catch (err) {
      setMessageTone('danger'); setMessage(err?.response?.data?.message || 'Could not delete holiday.');
    }
  }, [loadHolidays, mode, selectedCampus]);

  // -- Cell editor ------------------------------------------------------------
  const openCellEditor = useCallback((day, slot, currentEntry) => {
    if (typeof slot.id !== 'number') {
      setMessageTone('danger');
      setMessage(`Save Structure first to enable "${slot.slot_name}" for editing.`);
      return;
    }
    setEditingCell({
      dayKey: day.day_key,
      dayLabel: day.day_label,
      slotId: slot.id ?? slot._localId,
      slotName: slot.slot_name,
      slotTime: `${compactTime(slot.start_time)} - ${compactTime(slot.end_time)}`,
    });
    setCellDraft({
      subject_id: currentEntry?.subject_id || '',
      teacher_id: currentEntry?.teacher_id || '',
      note: currentEntry?.note || '',
    });
  }, []);

  const closeCellEditor = useCallback(() => setEditingCell(null), []);

  const saveCellEdit = useCallback(() => {
    if (!editingCell) return;
    const key = entryKey(editingCell.dayKey, editingCell.slotId);
    const subjectMatch = (meta?.subjects || []).find((s) => String(s.id) === String(cellDraft.subject_id));
    const teacherMatch = (meta?.teachers || []).find((t) => String(t.id) === String(cellDraft.teacher_id));
    setEntriesMap((prev) => ({
      ...prev,
      [key]: {
        subject_id: cellDraft.subject_id,
        teacher_id: cellDraft.teacher_id,
        note: cellDraft.note,
        subject_name: subjectMatch?.name || '',
        teacher_name: teacherMatch ? (teacherMatch.full_name || `${teacherMatch.first_name || ''} ${teacherMatch.last_name || ''}`.trim()) : '',
      },
    }));
    closeCellEditor();
  }, [cellDraft, editingCell, meta?.subjects, meta?.teachers, closeCellEditor]);

  const clearCell = useCallback(() => {
    if (!editingCell) return;
    const key = entryKey(editingCell.dayKey, editingCell.slotId);
    setEntriesMap((prev) => { const next = { ...prev }; delete next[key]; return next; });
    closeCellEditor();
  }, [editingCell, closeCellEditor]);

  // -- Structure actions ------------------------------------------------------
  const toggleDay = useCallback((dayKey) => {
    setStructureDays((prev) => prev.map((d) => d.day_key === dayKey ? { ...d, is_active: !d.is_active } : d));
  }, []);

  const updateSlot = useCallback((index, field, value) => {
    setStructureSlots((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }, []);

  const removeSlot = useCallback((index) => {
    setStructureSlots((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, display_order: i + 1 })));
  }, []);

  const addSlot = useCallback(() => {
    setStructureSlots((prev) => {
      const localId = `local-${Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 7)}`;
      return [
        ...prev,
        { _localId: localId, slot_name: `Slot ${prev.length + 1}`, start_time: '08:00', end_time: '08:45', slot_type: 'instruction', display_order: prev.length + 1, is_active: true, day_keys: null },
      ];
    });
    setMessageTone('neutral');
    setMessage('New slot added. Save Structure to lock it in before assigning subjects.');
  }, []);

  const toggleSlotDay = useCallback((index, dayKey) => {
    setStructureSlots((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      const cur = Array.isArray(s.day_keys) && s.day_keys.length ? s.day_keys : [];
      const next = cur.includes(dayKey) ? cur.filter((k) => k !== dayKey) : [...cur, dayKey];
      return { ...s, day_keys: next.length ? next : null };
    }));
  }, []);

  const generateQuickSlots = useCallback(() => {
    const periods = Math.max(1, parseInt(quickGen.periods, 10) || 0);
    const periodMin = Math.max(1, parseInt(quickGen.periodMin, 10) || 0);
    const breakMin = Math.max(0, parseInt(quickGen.breakMin, 10) || 0);
    const breakAfter = Math.max(0, parseInt(quickGen.breakAfter, 10) || 0);
    const startTime = /^\d{2}:\d{2}$/.test(quickGen.startTime) ? quickGen.startTime : '08:00';
    const targetDays = Array.isArray(quickGen.days) && quickGen.days.length ? quickGen.days : null;

    const addMin = (hhmm, mins) => {
      const [h, m] = hhmm.split(':').map(Number);
      const total = h * 60 + m + mins;
      const nh = Math.floor((total % (24 * 60)) / 60);
      const nm = total % 60;
      return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
    };

    const generated = [];
    let cursor = startTime;
    let periodCount = 0;
    const tag = `${Date.now()}`;

    if (quickGen.includeAssembly) {
      const end = addMin(cursor, 15);
      generated.push({ _localId: `gen-${tag}-${generated.length}`, slot_name: 'Assembly', start_time: cursor, end_time: end, slot_type: 'assembly', is_active: true, day_keys: targetDays });
      cursor = end;
    }

    for (let i = 0; i < periods; i++) {
      const end = addMin(cursor, periodMin);
      periodCount += 1;
      generated.push({ _localId: `gen-${tag}-${generated.length}`, slot_name: `Period ${periodCount}`, start_time: cursor, end_time: end, slot_type: 'instruction', is_active: true, day_keys: targetDays });
      cursor = end;
      if (breakAfter > 0 && breakMin > 0 && periodCount % breakAfter === 0 && i < periods - 1) {
        const bEnd = addMin(cursor, breakMin);
        generated.push({ _localId: `gen-${tag}-${generated.length}`, slot_name: 'Break', start_time: cursor, end_time: bEnd, slot_type: 'break', is_active: true, day_keys: targetDays });
        cursor = bEnd;
      }
    }

    setStructureSlots((prev) => {
      const base = quickGen.mode === 'replace' ? [] : prev;
      const merged = [...base, ...generated];
      return merged.map((s, idx) => ({ ...s, display_order: idx + 1 }));
    });
    setMessageTone('neutral');
    setMessage(`Generated ${generated.length} slots${targetDays ? ` for ${targetDays.join(', ')}` : ' for all days'}. Click Save Structure before assigning subjects.`);
  }, [quickGen]);

  const saveStructure = useCallback(async () => {
    setSavingStructure(true);
    setMessage('');
    try {
      const payload = {
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
        days: structureDays,
        slots: structureSlots.map((s, i) => ({
          ...s,
          display_order: i + 1,
          day_keys: Array.isArray(s.day_keys) && s.day_keys.length ? s.day_keys : null,
        })),
      };
      const { data } = await api.put('/timetable/structure', payload);
      setStructureDays((data.days || []).map((d) => ({ day_key: d.day_key, day_label: d.day_label, is_active: d.is_active !== false })));
      setStructureSlots((data.slots || []).map((s, i) => ({
        id: s.id, _localId: s.id,
        slot_name: s.slot_name,
        start_time: compactTime(s.start_time),
        end_time: compactTime(s.end_time),
        slot_type: s.slot_type || 'instruction',
        display_order: i + 1,
        is_active: s.is_active !== false,
        day_keys: Array.isArray(s.day_keys) && s.day_keys.length ? s.day_keys : null,
      })));
      setMessageTone('neutral');
      setMessage('Structure saved.');
      await loadSection();
    } catch (err) {
      setMessageTone('danger');
      setMessage(err?.response?.data?.message || 'Could not save structure.');
    } finally {
      setSavingStructure(false);
    }
  }, [loadSection, mode, selectedCampus, structureDays, structureSlots]);

  // -- Save / publish ---------------------------------------------------------
  const saveDraft = useCallback(async () => {
    if (!selectedClass || !selectedSection) { Alert.alert('Select class and section first.'); return; }
    setSavingDraft(true);
    setMessage('');
    try {
      const entries = [];
      let skippedUnsaved = 0;
      activeDays.forEach((day) => {
        activeSlots.forEach((slot) => {
          if (slot.slot_type !== 'instruction') return;
          const slotDayKeys = Array.isArray(slot.day_keys) && slot.day_keys.length ? slot.day_keys : null;
          if (slotDayKeys && !slotDayKeys.includes(day.day_key)) return;
          const row = entriesMap[entryKey(day.day_key, slot.id ?? slot._localId)] || {};
          if (!row.subject_id && !row.teacher_id && !String(row.note || '').trim()) return;
          if (typeof slot.id !== 'number') { skippedUnsaved += 1; return; }
          entries.push({ day_key: day.day_key, slot_id: slot.id, subject_id: row.subject_id || null, teacher_id: row.teacher_id || null, note: String(row.note || '').trim() });
        });
      });
      if (skippedUnsaved > 0) {
        setSavingDraft(false);
        setMessageTone('danger');
        setMessage(`Save Structure first \u2014 ${skippedUnsaved} cell(s) belong to unsaved slots and would be lost.`);
        return;
      }
      await api.put('/timetable/section', {
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
        class_id: selectedClass, section_id: selectedSection, entries,
      });
      setMessageTone('neutral');
      setMessage('Draft saved.');
      await loadSection();
      await loadBusy();
    } catch (err) {
      setMessageTone('danger');
      setMessage(err?.response?.data?.message || 'Could not save draft.');
    } finally {
      setSavingDraft(false);
    }
  }, [activeDays, activeSlots, entriesMap, loadBusy, loadSection, mode, selectedCampus, selectedClass, selectedSection]);

  const publishDraft = useCallback(async () => {
    if (!selectedClass || !selectedSection) return;
    Alert.alert('Publish timetable', 'Students and parents will see this immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          setPublishing(true);
          try {
            await api.post('/timetable/section/publish', {
              ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
              class_id: selectedClass, section_id: selectedSection,
            });
            setMessageTone('neutral');
            setMessage('Published. Students and parents can see the timetable.');
          } catch (err) {
            setMessageTone('danger');
            setMessage(err?.response?.data?.message || 'Could not publish.');
          } finally {
            setPublishing(false);
          }
        },
      },
    ]);
  }, [mode, selectedCampus, selectedClass, selectedSection]);

  // -- Teacher-subject assignment ---------------------------------------------
  const toggleSubjectForTeacher = useCallback(async (teacherId, subjectId, currentlyAssigned) => {
    const tid = String(teacherId);
    const sid = Number(subjectId);
    setSavingTeacherSubject(`${tid}:${sid}`);
    try {
      const current = teacherSubjects[tid] || [];
      const next = currentlyAssigned ? current.filter((s) => s !== sid) : [...current, sid];
      await api.put('/timetable/teacher-subjects', {
        teacher_id: teacherId,
        subject_ids: next,
        ...(mode === 'orgadmin' && selectedCampus ? { school_id: selectedCampus } : {}),
      });
      setTeacherSubjects((prev) => ({ ...prev, [tid]: next }));
    } catch {
      Alert.alert('Error', 'Could not update subject assignment.');
    } finally {
      setSavingTeacherSubject(null);
    }
  }, [mode, selectedCampus, teacherSubjects]);

  // -- Title ------------------------------------------------------------------
  const title = mode === 'admin' ? 'Timetable' : mode === 'orgadmin' ? 'Campus Timetable' : 'My Timetable';

  if (metaLoading) {
    return <View style={styles.loaderScreen}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  // -- Scope panel ------------------------------------------------------------
  const renderScope = () => (
    <View style={styles.panel}>
      {mode === 'orgadmin' ? (
        <>
          <Text style={styles.label}>Campus</Text>
          <PickerField
            label="Campus"
            value={selectedCampus}
            onChange={(v) => {
              setSelectedCampus(v);
              setSelectedClass('');
              setSelectedSection('');
              reloadMeta(v);
            }}
            items={(meta?.campuses || []).map((c) => ({ label: c.name, value: String(c.id) }))}
            placeholder="Select campus"
          />
        </>
      ) : null}
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Class</Text>
          <PickerField
            label="Class"
            value={selectedClass}
            onChange={(v) => {
              setSelectedClass(v);
              const cls = classes.find((c) => String(c.id) === String(v));
              setSelectedSection(cls?.sections?.[0] ? String(cls.sections[0].id) : '');
            }}
            items={classes.map((c) => ({ label: c.class_name, value: String(c.id) }))}
            placeholder="Class"
            disabled={!classes.length}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Section</Text>
          <PickerField
            label="Section"
            value={selectedSection}
            onChange={setSelectedSection}
            items={sections.map((s) => ({ label: `Section ${s.section_name}`, value: String(s.id) }))}
            placeholder="Section"
            disabled={!selectedClass}
          />
        </View>
      </View>
    </View>
  );

  // -- Schedule tab -----------------------------------------------------------
  const renderSchedule = () => (
    <>
      <View style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{canEditEntries ? 'Draft Schedule' : 'Published Schedule'}</Text>
          {canEditEntries && selectedClass && selectedSection ? (
            <Text style={styles.tapHint}>Tap a cell to edit</Text>
          ) : null}
        </View>
        <Text style={styles.sectionHint}>
          {canEditEntries
            ? 'Cells show subject name. Tap any instruction slot cell to assign a subject and teacher.'
            : 'Published timetable for your assigned class-section.'}
        </Text>

        {sectionLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} /> : (
          !selectedClass || !selectedSection ? (
            <Text style={styles.emptyText}>Select a class and section above.</Text>
          ) : (
            <ScheduleGrid
              activeDays={activeDays}
              activeSlots={activeSlots}
              entriesMap={entriesMap}
              canEditEntries={canEditEntries}
              onCellPress={openCellEditor}
            />
          )
        )}
      </View>

      {canEditEntries && selectedClass && selectedSection ? (
        <View style={[styles.panel, styles.actionRow]}>
          <Pressable style={styles.primaryButtonHalf} onPress={saveDraft} disabled={savingDraft}>
            <LinearGradient colors={C.brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonFill}>
              <Text style={styles.primaryButtonText}>{savingDraft ? 'Saving...' : 'Save Draft'}</Text>
            </LinearGradient>
          </Pressable>
          {(mode === 'admin' || mode === 'orgadmin') ? (
            <Pressable style={styles.secondaryButtonWide} onPress={publishDraft} disabled={publishing}>
              <Text style={styles.secondaryButtonText}>{publishing ? 'Publishing...' : 'Publish'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  // -- Structure tab ----------------------------------------------------------
  const renderStructure = () => (
    <View style={styles.panel}>
      <View style={styles.sectionHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Schedule Structure</Text>
          <Text style={styles.sectionHint}>Set working days and time slots for this campus.</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={addSlot}>
          <Text style={styles.addBtnText}>+ Slot</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Working Days</Text>
      <View style={styles.dayChipRow}>
        {DAY_OPTIONS.map((day) => {
          const active = structureDays.some((d) => d.day_key === day.key && d.is_active !== false);
          return (
            <Pressable key={day.key} style={active ? styles.dayChipActive : styles.dayChip} onPress={() => toggleDay(day.key)}>
              <Text style={active ? styles.dayChipActiveText : styles.dayChipText}>{day.label.slice(0, 3)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Time Slots</Text>
      <View style={styles.qgCard}>
        <Text style={styles.qgTitle}>Quick Generator</Text>
        <Text style={styles.qgHint}>Builds sequential slots starting from the time below. Replaces the list.</Text>
        <View style={styles.qgRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.timeLbl}>Start</Text>
            <TimePickerField value={quickGen.startTime} onChange={(v) => setQuickGen((p) => ({ ...p, startTime: v }))} />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.timeLbl}># Periods</Text>
            <TextInput
              value={String(quickGen.periods)}
              onChangeText={(v) => setQuickGen((p) => ({ ...p, periods: v.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              style={styles.qgInput}
            />
          </View>
        </View>
        <View style={styles.qgRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.timeLbl}>Period (min)</Text>
            <TextInput
              value={String(quickGen.periodMin)}
              onChangeText={(v) => setQuickGen((p) => ({ ...p, periodMin: v.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              style={styles.qgInput}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.timeLbl}>Break (min)</Text>
            <TextInput
              value={String(quickGen.breakMin)}
              onChangeText={(v) => setQuickGen((p) => ({ ...p, breakMin: v.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              style={styles.qgInput}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.timeLbl}>Break after</Text>
            <TextInput
              value={String(quickGen.breakAfter)}
              onChangeText={(v) => setQuickGen((p) => ({ ...p, breakAfter: v.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              style={styles.qgInput}
            />
          </View>
        </View>
        <Pressable
          style={[styles.qgToggle, quickGen.includeAssembly ? styles.qgToggleActive : null]}
          onPress={() => setQuickGen((p) => ({ ...p, includeAssembly: !p.includeAssembly }))}
        >
          <Text style={quickGen.includeAssembly ? styles.qgToggleTextActive : styles.qgToggleText}>
            {quickGen.includeAssembly ? '[x]' : '[  ]'}  Include 15 min Assembly first
          </Text>
        </Pressable>

        <Text style={styles.timeLbl}>Apply to days (none = all working days)</Text>
        <View style={styles.dayChipRow}>
          {DAY_OPTIONS.map((d) => {
            const active = (quickGen.days || []).includes(d.key);
            return (
              <Pressable
                key={d.key}
                style={active ? styles.dayChipActive : styles.dayChip}
                onPress={() => setQuickGen((p) => {
                  const cur = p.days || [];
                  return { ...p, days: cur.includes(d.key) ? cur.filter((k) => k !== d.key) : [...cur, d.key] };
                })}
              >
                <Text style={active ? styles.dayChipActiveText : styles.dayChipText}>{d.label.slice(0, 3)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 10 }}>
          <Pressable
            style={[styles.qgToggle, { flex: 1, marginRight: 6 }, quickGen.mode === 'append' ? styles.qgToggleActive : null]}
            onPress={() => setQuickGen((p) => ({ ...p, mode: 'append' }))}
          >
            <Text style={quickGen.mode === 'append' ? styles.qgToggleTextActive : styles.qgToggleText}>Append</Text>
          </Pressable>
          <Pressable
            style={[styles.qgToggle, { flex: 1, marginLeft: 6 }, quickGen.mode === 'replace' ? styles.qgToggleActive : null]}
            onPress={() => setQuickGen((p) => ({ ...p, mode: 'replace' }))}
          >
            <Text style={quickGen.mode === 'replace' ? styles.qgToggleTextActive : styles.qgToggleText}>Replace all</Text>
          </Pressable>
        </View>

        <Pressable style={styles.qgBtn} onPress={generateQuickSlots}>
          <LinearGradient colors={C.brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.qgBtnFill}>
            <Text style={styles.qgBtnText}>Generate Slots</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {structureSlots.map((slot, index) => (
        <View key={slot.id || slot._localId || index} style={styles.slotCard}>
          <View style={styles.slotCardHeader}>
            <TextInput
              value={slot.slot_name}
              onChangeText={(v) => updateSlot(index, 'slot_name', v)}
              placeholder="Slot name"
              style={styles.slotNameInput}
            />
            <Pressable onPress={() => removeSlot(index)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>x</Text>
            </Pressable>
          </View>
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.timeLbl}>Start</Text>
              <TimePickerField value={slot.start_time} onChange={(v) => updateSlot(index, 'start_time', v)} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.timeLbl}>End</Text>
              <TimePickerField value={slot.end_time} onChange={(v) => updateSlot(index, 'end_time', v)} />
            </View>
          </View>
          <PickerField
            label="Slot type"
            value={slot.slot_type}
            onChange={(v) => updateSlot(index, 'slot_type', v)}
            items={SLOT_TYPE_ITEMS}
            placeholder="Select type"
          />
          <Text style={styles.timeLbl}>Days (none = every working day)</Text>
          <View style={styles.dayChipRow}>
            {DAY_OPTIONS.map((d) => {
              const active = Array.isArray(slot.day_keys) && slot.day_keys.includes(d.key);
              return (
                <Pressable key={d.key} style={active ? styles.dayChipActive : styles.dayChip} onPress={() => toggleSlotDay(index, d.key)}>
                  <Text style={active ? styles.dayChipActiveText : styles.dayChipText}>{d.label.slice(0, 3)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable style={styles.primaryButton} onPress={saveStructure} disabled={savingStructure}>
        <LinearGradient colors={C.brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonFill}>
          <Text style={styles.primaryButtonText}>{savingStructure ? 'Saving...' : 'Save Structure'}</Text>
        </LinearGradient>
      </Pressable>

      <Text style={[styles.label, { marginTop: 18 }]}>Holidays</Text>
      <Text style={styles.sectionHint}>Mark specific calendar dates as off (e.g. Eid, Independence Day).</Text>
      <View style={styles.qgRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.timeLbl}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={newHoliday.date}
            onChangeText={(v) => setNewHoliday((p) => ({ ...p, date: v }))}
            placeholder="2026-08-14"
            style={styles.qgInput}
            placeholderTextColor={C.textLight}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.timeLbl}>Label</Text>
          <TextInput
            value={newHoliday.label}
            onChangeText={(v) => setNewHoliday((p) => ({ ...p, label: v }))}
            placeholder="Independence Day"
            style={styles.qgInput}
            placeholderTextColor={C.textLight}
          />
        </View>
      </View>
      <Pressable style={styles.qgBtn} onPress={addHoliday} disabled={savingHoliday}>
        <LinearGradient colors={C.brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.qgBtnFill}>
          <Text style={styles.qgBtnText}>{savingHoliday ? 'Adding...' : 'Add Holiday'}</Text>
        </LinearGradient>
      </Pressable>

      {holidays.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 8 }]}>No holidays yet.</Text>
      ) : (
        holidays.map((h) => (
          <View key={h.id} style={styles.holidayRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.holidayDate}>{h.holiday_date}</Text>
              {h.label ? <Text style={styles.holidayLabel}>{h.label}</Text> : null}
            </View>
            <Pressable style={styles.removeBtn} onPress={() => removeHoliday(h.id)}>
              <Text style={styles.removeBtnText}>x</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );

  // -- Teachers tab -----------------------------------------------------------
  const renderTeachers = () => (
    <>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Teacher -> Subject Mapping</Text>
        <Text style={styles.sectionHint}>
          Tap subjects to toggle assignment. When filling the timetable, only assigned teachers appear per subject.
        </Text>
      </View>
      {!(meta?.teachers || []).length ? (
        <View style={styles.panel}><Text style={styles.emptyText}>No teachers found for this campus.</Text></View>
      ) : null}
      {(meta?.teachers || []).map((teacher) => {
        const tid = String(teacher.id);
        const assignedIds = teacherSubjects[tid] || [];
        const name = teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();
        return (
          <View key={tid} style={styles.teacherCard}>
            <Text style={styles.teacherName}>{name}</Text>
            <Text style={styles.teacherRole}>{String(teacher.teacher_role || 'teacher').replace(/_/g, ' ')}</Text>
            {!(meta?.subjects || []).length ? (
              <Text style={styles.emptyText}>No subjects defined.</Text>
            ) : (
              <View style={styles.subjectChipRow}>
                {(meta.subjects || []).map((subject) => {
                  const sid = Number(subject.id);
                  const active = assignedIds.includes(sid);
                  const saving = savingTeacherSubject === `${tid}:${sid}`;
                  return (
                    <Pressable
                      key={subject.id}
                      style={[styles.subjectChip, active ? styles.subjectChipActive : null]}
                      onPress={() => toggleSubjectForTeacher(teacher.id, subject.id, active)}
                      disabled={!!savingTeacherSubject}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={active ? '#FFFFFF' : C.primary} />
                      ) : (
                        <Text style={active ? styles.subjectChipTextActive : styles.subjectChipText}>{subject.name}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </>
  );

  return (
    <View style={styles.container}>
      <AppHeader title={title} navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {message ? (
          <View style={messageTone === 'danger' ? styles.bannerDanger : styles.bannerNeutral}>
            <Text style={messageTone === 'danger' ? styles.bannerDangerText : styles.bannerNeutralText}>{message}</Text>
          </View>
        ) : null}

        {renderScope()}

        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'schedule' ? renderSchedule() : null}
        {activeTab === 'structure' && canManageStructure ? renderStructure() : null}
        {activeTab === 'teachers' && showTeachersTab ? renderTeachers() : null}
      </ScrollView>

      <CellEditorModal
        visible={!!editingCell}
        cell={editingCell}
        draft={cellDraft}
        setDraft={setCellDraft}
        teacherItems={teacherItems}
        subjectItems={subjectItems}
        teacherSubjects={teacherSubjects}
        teacherBusy={teacherBusy}
        mode={mode}
        onSave={saveCellEdit}
        onClear={clearCell}
        onClose={closeCellEditor}
      />
    </View>
  );
}

// --- Styles -------------------------------------------------------------------
const styles = StyleSheet.create({
  loaderScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 14, paddingBottom: 50 },

  bannerNeutral: { backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', padding: 14, marginBottom: 12 },
  bannerDanger: { backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', padding: 14, marginBottom: 12 },
  bannerNeutralText: { color: C.textDark, fontSize: 13 },
  bannerDangerText: { color: '#B91C1C', fontSize: 13 },

  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: C.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.textDark },
  sectionHint: { fontSize: 12, color: C.textMed, lineHeight: 18, marginBottom: 12 },
  tapHint: { fontSize: 11, color: C.primary, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  emptyText: { color: C.textMed, fontSize: 13, marginTop: 8, lineHeight: 20 },

  row2: { flexDirection: 'row', gap: 10 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 14, padding: 3, marginBottom: 12, gap: 2 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#64748B', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMed },
  tabTextActive: { color: C.primary },

  // Schedule grid
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  gridLabelCell: { width: LABEL_W, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  gridHeaderLabel: { backgroundColor: '#F1F5F9' },
  gridHeaderLabelText: { fontSize: 10, fontWeight: '800', color: C.textMed, textTransform: 'uppercase', textAlign: 'center' },
  gridDayCell: { width: CELL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  gridHeaderDay: { paddingVertical: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  gridHeaderDayText: { fontSize: 12, fontWeight: '800', color: C.textDark },
  gridEntryCell: { paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  gridOffCell: { backgroundColor: '#F1F5F9' },
  gridOffText: { color: C.textLight, fontSize: 13, fontWeight: '700' },
  gridUnsavedBadge: { marginTop: 4, fontSize: 9, fontWeight: '900', color: '#B91C1C', backgroundColor: '#FEE2E2', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, alignSelf: 'flex-start' },

  holidayRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', marginTop: 8 },
  holidayDate: { fontSize: 13, fontWeight: '800', color: C.textDark },
  holidayLabel: { fontSize: 12, color: C.textMed, marginTop: 2 },
  gridCellTappable: { },
  gridSlotName: { fontSize: 11, fontWeight: '800', color: C.textDark, textAlign: 'center' },
  gridSlotTime: { fontSize: 10, color: C.textMed, marginTop: 2, textAlign: 'center' },
  gridBreakText: { fontSize: 9, fontWeight: '700', textAlign: 'center', textTransform: 'capitalize' },
  gridSubjectText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  gridTeacherText: { fontSize: 9, textAlign: 'center', marginTop: 2, opacity: 0.8 },
  gridEmptyText: { color: '#CBD5E1' },

  // Structure tab
  dayChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  dayChipActive: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.primary, backgroundColor: '#EEF2FF' },
  dayChipText: { color: C.textMed, fontSize: 12, fontWeight: '700' },
  dayChipActiveText: { color: C.primary, fontSize: 12, fontWeight: '800' },

  slotCard: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, backgroundColor: '#F8FAFC' },
  slotCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },

  qgCard: { marginTop: 8, marginBottom: 4, borderRadius: 14, borderWidth: 1, borderColor: '#DBEAFE', padding: 12, backgroundColor: '#EFF6FF' },
  qgTitle: { fontSize: 13, color: C.primary, fontWeight: '800' },
  qgHint: { fontSize: 11, color: C.textMed, marginTop: 2, marginBottom: 8 },
  qgRow: { flexDirection: 'row', marginBottom: 8 },
  qgInput: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#DDE5F0', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.textDark, fontWeight: '700' },
  qgToggle: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#DDE5F0', backgroundColor: '#FFFFFF', marginBottom: 10 },
  qgToggleActive: { borderColor: C.primary, backgroundColor: '#DBEAFE' },
  qgToggleText: { fontSize: 12, color: C.textMed, fontWeight: '700' },
  qgToggleTextActive: { fontSize: 12, color: C.primary, fontWeight: '800' },
  qgBtn: { borderRadius: 12, overflow: 'hidden' },
  qgBtnFill: { paddingVertical: 10, alignItems: 'center' },
  qgBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  slotNameInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#DDE5F0', paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: C.textDark, fontWeight: '700' },
  removeBtn: { padding: 6, backgroundColor: '#FEE2E2', borderRadius: 8 },
  removeBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '800' },
  addBtn: { borderRadius: 12, borderWidth: 1, borderColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EEF2FF' },
  addBtnText: { color: C.primary, fontSize: 12, fontWeight: '800' },

  timeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  timeLbl: { fontSize: 10, color: C.textMed, fontWeight: '700', marginBottom: 4 },
  timeTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DDE5F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  timeTriggerText: { fontSize: 15, fontWeight: '800', color: C.textDark },
  timeTriggerIcon: { fontSize: 14 },

  // Teachers tab
  teacherCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 10, shadowColor: C.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  teacherName: { fontSize: 15, fontWeight: '800', color: C.textDark },
  teacherRole: { fontSize: 11, color: C.textMed, marginTop: 2, marginBottom: 10, textTransform: 'capitalize' },
  subjectChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  subjectChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', minWidth: 40, alignItems: 'center' },
  subjectChipActive: { borderColor: C.primary, backgroundColor: C.primary },
  subjectChipText: { color: C.textMed, fontSize: 12, fontWeight: '700' },
  subjectChipTextActive: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Cell editor modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 6 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#CBD5E1', borderRadius: 999, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 2 },
  sheetSubtitle: { fontSize: 13, color: C.textMed, marginBottom: 18 },
  noteInput: { backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#DDE5F0', paddingHorizontal: 14, paddingVertical: 11, color: C.textDark, fontSize: 14, marginTop: 4, marginBottom: 4, minHeight: 56, textAlignVertical: 'top' },
  hintText: { fontSize: 11, color: '#B45309', backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginBottom: 2 },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  clearBtn: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 14, alignItems: 'center', backgroundColor: '#F8FAFC' },
  clearBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 2, borderRadius: 14, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  primaryButtonHalf: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  primaryButtonFill: { paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButtonWide: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: C.textDark, fontSize: 14, fontWeight: '800' },
});
