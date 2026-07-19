// frontend/src/features/timetable/AdminTimetableEditor.js
// Admin / org-admin timetable editor: pick a class/section, edit one day
// at a time (Friday can optionally get its own override schedule), save
// immediately — no draft/publish step, no shared bell-schedule table.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Switch,
  Alert, ActivityIndicator, StyleSheet, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import PickerField from '../../components/PickerField';
import api from '../../services/api';
import {
  getClassTimetable, saveDayPeriods, clearDay, deleteClassTimetable, copyTimetable, getTeacherBusy,
} from './api';
import { subjectColor, to12h } from './PeriodCard';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function emptyPeriod() {
  return { key: Math.random().toString(36).slice(2), subject_id: null, teacher_id: null, start_time: '', end_time: '' };
}

function toEditable(period) {
  return {
    key: Math.random().toString(36).slice(2),
    subject_id: period.subject_id || null,
    teacher_id: period.teacher_id || null,
    start_time: period.start_time || '',
    end_time: period.end_time || '',
  };
}

function isValidTime(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

export default function AdminTimetableEditor({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';

  const [campuses, setCampuses] = useState([]);
  const [campusId, setCampusId] = useState('');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const [week, setWeek] = useState(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [dayKey, setDayKey] = useState('monday');
  const [fridayOverrideOn, setFridayOverrideOn] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyMap, setBusyMap] = useState({});
  const [copyModal, setCopyModal] = useState(false);
  const [copyTargetClass, setCopyTargetClass] = useState('');
  const [copyTargetSection, setCopyTargetSection] = useState('');
  const [copyIncludeFriday, setCopyIncludeFriday] = useState(true);
  const [copying, setCopying] = useState(false);

  const schoolId = isOrg ? (campusId || null) : null;

  // ── Load campuses (org admin only) ──────────────────────────────
  useEffect(() => {
    if (!isOrg) return;
    api.get('/org-admin/campuses').then(({ data }) => {
      setCampuses((data || []).map((c) => ({ value: c.id, label: c.name })));
    }).catch(() => setCampuses([]));
  }, [isOrg]);

  // ── Load classes/subjects/teachers for the selected scope ──────
  const loadMeta = useCallback(async () => {
    if (isOrg && !campusId) { setClasses([]); setSubjects([]); setTeachers([]); return; }
    setMetaLoading(true);
    try {
      const classesReq = isOrg
        ? api.get('/org-admin/classes', { params: { campus_id: campusId } })
        : api.get('/admin/classes');
      const subjectsReq = isOrg
        ? api.get('/org-admin/subjects', { params: { campus_id: campusId } })
        : api.get('/subjects');
      const teachersReq = isOrg
        ? api.get('/org-admin/teachers', { params: { campus_id: campusId } })
        : api.get('/admin/teachers');
      const [{ data: classesData }, { data: subjectsData }, { data: teachersData }] = await Promise.all([classesReq, subjectsReq, teachersReq]);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setSubjects((subjectsData || []).map((s) => ({ value: s.id, label: s.name })));
      setTeachers((teachersData || []).map((t) => ({ value: t.id, label: [t.first_name, t.last_name].filter(Boolean).join(' ') })));
    } catch {
      Alert.alert('Error', 'Could not load classes and staff.');
    } finally {
      setMetaLoading(false);
    }
  }, [isOrg, campusId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => { setClassId(''); setSectionId(''); setWeek(null); }, [campusId]);
  useEffect(() => { setSectionId(''); setWeek(null); }, [classId]);

  const sectionOptions = useMemo(() => {
    const cls = classes.find((c) => String(c.id) === String(classId));
    return (cls?.sections || []).map((s) => ({ value: s.id, label: s.section_name }));
  }, [classes, classId]);

  const classOptions = useMemo(() => classes.map((c) => ({ value: c.id, label: c.class_name })), [classes]);

  // ── Load the selected class's week ──────────────────────────────
  const loadWeek = useCallback(async () => {
    if (!classId || !sectionId) return;
    setWeekLoading(true);
    try {
      const { data } = await getClassTimetable({ classId, sectionId, schoolId });
      setWeek(data);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not load timetable.');
      setWeek(null);
    } finally {
      setWeekLoading(false);
    }
  }, [classId, sectionId, schoolId]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  // ── Sync the local period editor whenever the selected day changes ──
  useEffect(() => {
    if (!week) { setPeriods([]); return; }
    if (dayKey === 'friday' && fridayOverrideOn) {
      setPeriods((week.fridayOverride || []).map(toEditable));
    } else {
      setPeriods((week.days?.[dayKey] || []).map(toEditable));
    }
    setDirty(false);
  }, [week, dayKey, fridayOverrideOn]);

  useEffect(() => {
    if (dayKey !== 'friday') setFridayOverrideOn(false);
    else setFridayOverrideOn(!!week?.hasFridayOverride);
  }, [dayKey, week?.hasFridayOverride]);

  // ── Teacher busy lookup for the active day (informational only) ──
  useEffect(() => {
    if (!classId || !sectionId) { setBusyMap({}); return; }
    getTeacherBusy({ schoolId, dayKey, excludeClassId: classId, excludeSectionId: sectionId })
      .then(({ data }) => setBusyMap(data?.busy || {}))
      .catch(() => setBusyMap({}));
  }, [classId, sectionId, dayKey, schoolId]);

  const teacherOptions = useMemo(() => teachers.map((t) => {
    const busy = busyMap[String(t.value)];
    return busy && busy.length ? { ...t, label: `${t.label} (busy ${to12h(busy[0].start_time)}-${to12h(busy[0].end_time)})` } : t;
  }), [teachers, busyMap]);

  function updatePeriod(key, patch) {
    setPeriods((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    setDirty(true);
  }
  function removePeriod(key) {
    setPeriods((prev) => prev.filter((p) => p.key !== key));
    setDirty(true);
  }
  function addPeriod() {
    setPeriods((prev) => [...prev, emptyPeriod()]);
    setDirty(true);
  }
  function movePeriod(index, dir) {
    setPeriods((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  async function handleSaveDay() {
    for (const [idx, p] of periods.entries()) {
      if (!isValidTime(p.start_time) || !isValidTime(p.end_time)) {
        Alert.alert('Invalid time', `Period ${idx + 1} needs a valid start and end time (HH:MM).`);
        return;
      }
      if (p.start_time >= p.end_time) {
        Alert.alert('Invalid time', `Period ${idx + 1} must end after it starts.`);
        return;
      }
    }
    setSaving(true);
    try {
      const scheduleType = dayKey === 'friday' && fridayOverrideOn ? 'friday' : 'default';
      const { data } = await saveDayPeriods({
        schoolId, classId, sectionId, dayKey, scheduleType,
        periods: periods.map((p) => ({
          subject_id: p.subject_id, teacher_id: p.teacher_id, start_time: p.start_time, end_time: p.end_time,
        })),
      });
      setWeek((prev) => ({ ...prev, days: data.days, fridayOverride: data.fridayOverride, hasFridayOverride: data.hasFridayOverride }));
      setDirty(false);
      Alert.alert('Saved', `${DAY_LABEL[dayKey]}'s schedule has been updated.`);
    } catch (err) {
      Alert.alert('Could not save', err?.response?.data?.message || 'Please check for teacher conflicts and try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmSwitchDay(nextDay) {
    if (dirty) {
      Alert.alert('Unsaved changes', 'Discard unsaved changes to this day?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setDayKey(nextDay) },
      ]);
    } else {
      setDayKey(nextDay);
    }
  }

  async function handleTurnOffFridayOverride() {
    Alert.alert('Remove Friday override?', 'Friday will go back to using the normal weekly schedule.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await clearDay({ schoolId, classId, sectionId, dayKey: 'friday', scheduleType: 'friday' });
            await loadWeek();
            setFridayOverrideOn(false);
          } catch {
            Alert.alert('Error', 'Could not remove the Friday override.');
          }
        },
      },
    ]);
  }

  function handleDeleteTimetable() {
    Alert.alert('Delete timetable?', 'This removes every period for this class, including any Friday override. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteClassTimetable({ schoolId, classId, sectionId });
            await loadWeek();
          } catch {
            Alert.alert('Error', 'Could not delete the timetable.');
          }
        },
      },
    ]);
  }

  async function handleCopy() {
    if (!copyTargetClass || !copyTargetSection) {
      Alert.alert('Pick a target', 'Choose the class and section to copy into.');
      return;
    }
    setCopying(true);
    try {
      const { data } = await copyTimetable({
        schoolId, fromClassId: classId, fromSectionId: sectionId,
        toClassId: copyTargetClass, toSectionId: copyTargetSection, includeFriday: copyIncludeFriday,
      });
      setCopyModal(false);
      setCopyTargetClass(''); setCopyTargetSection('');
      if (data.conflicts?.length) {
        Alert.alert('Copied with conflicts', `${data.conflicts.length} period(s) had a teacher conflict and were copied without a teacher assigned — please reassign them.`);
      } else {
        Alert.alert('Copied', 'Timetable copied successfully.');
      }
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not copy the timetable.');
    } finally {
      setCopying(false);
    }
  }

  const copyTargetSectionOptions = useMemo(() => {
    const cls = classes.find((c) => String(c.id) === String(copyTargetClass));
    return (cls?.sections || []).map((s) => ({ value: s.id, label: s.section_name }));
  }, [classes, copyTargetClass]);

  const canEdit = !!(classId && sectionId) && !weekLoading;

  return (
    <View style={styles.container}>
      <AppHeader title="Timetable" navigation={navigation} showBack={false} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.pickerBlock}>
          {isOrg && (
            <PickerField label="Campus" value={campusId} onChange={setCampusId} items={campuses} placeholder="Select a campus" />
          )}
          <PickerField
            label="Class" value={classId} onChange={setClassId} items={classOptions}
            placeholder="Select a class" disabled={isOrg && !campusId}
          />
          <PickerField
            label="Section" value={sectionId} onChange={setSectionId} items={sectionOptions}
            placeholder="Select a section" disabled={!classId}
          />
        </View>

        {metaLoading ? <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} /> : null}

        {canEdit && (
          <>
            <View style={styles.actionsRow}>
              <Pressable style={styles.actionBtn} onPress={() => setCopyModal(true)}>
                <Ionicons name="copy-outline" size={16} color={C.primary} />
                <Text style={styles.actionBtnText}>Copy to another class</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleDeleteTimetable}>
                <Ionicons name="trash-outline" size={16} color={C.error} />
                <Text style={[styles.actionBtnText, { color: C.error }]}>Delete timetable</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabsScroll} contentContainerStyle={styles.dayTabsContent}>
              {DAY_ORDER.map((key) => {
                const active = key === dayKey;
                const hasOverride = key === 'friday' && week?.hasFridayOverride;
                return (
                  <Pressable key={key} onPress={() => confirmSwitchDay(key)} style={[styles.dayTab, active && styles.dayTabActive]}>
                    <Text style={[styles.dayTabText, active && styles.dayTabTextActive]}>{DAY_LABEL[key].slice(0, 3)}</Text>
                    {hasOverride ? <View style={styles.overrideDot} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {dayKey === 'friday' && (
              <View style={styles.fridayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fridayLabel}>Custom Friday schedule</Text>
                  <Text style={styles.fridayHint}>
                    {fridayOverrideOn ? 'Editing a Friday-only schedule.' : 'Off uses the normal weekly Friday schedule.'}
                  </Text>
                </View>
                <Switch
                  value={fridayOverrideOn}
                  onValueChange={(v) => {
                    if (!v && week?.hasFridayOverride) { handleTurnOffFridayOverride(); return; }
                    setFridayOverrideOn(v);
                  }}
                  trackColor={{ true: C.primary }}
                />
              </View>
            )}

            {weekLoading ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
            ) : (
              <View style={styles.periodsBlock}>
                {periods.map((p, idx) => {
                  const color = subjectColor(p.subject_id);
                  return (
                    <View key={p.key} style={[styles.periodCard, { borderColor: color.tint }]}>
                      <View style={styles.periodHeaderRow}>
                        <Text style={styles.periodIndex}>Period {idx + 1}</Text>
                        <View style={styles.periodHeaderActions}>
                          <Pressable onPress={() => movePeriod(idx, -1)} disabled={idx === 0} hitSlop={8}>
                            <Ionicons name="chevron-up" size={18} color={idx === 0 ? C.textLight : C.textMed} />
                          </Pressable>
                          <Pressable onPress={() => movePeriod(idx, 1)} disabled={idx === periods.length - 1} hitSlop={8}>
                            <Ionicons name="chevron-down" size={18} color={idx === periods.length - 1 ? C.textLight : C.textMed} />
                          </Pressable>
                          <Pressable onPress={() => removePeriod(p.key)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color={C.error} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.timeRow}>
                        <TextInput
                          style={styles.timeInput}
                          value={p.start_time}
                          onChangeText={(v) => updatePeriod(p.key, { start_time: v })}
                          placeholder="08:00"
                          placeholderTextColor={C.textLight}
                          maxLength={5}
                        />
                        <Ionicons name="arrow-forward" size={14} color={C.textLight} />
                        <TextInput
                          style={styles.timeInput}
                          value={p.end_time}
                          onChangeText={(v) => updatePeriod(p.key, { end_time: v })}
                          placeholder="08:45"
                          placeholderTextColor={C.textLight}
                          maxLength={5}
                        />
                      </View>
                      <PickerField
                        label="Subject" value={p.subject_id} onChange={(v) => updatePeriod(p.key, { subject_id: v })}
                        items={subjects} placeholder="Select subject"
                      />
                      <PickerField
                        label="Teacher" value={p.teacher_id} onChange={(v) => updatePeriod(p.key, { teacher_id: v })}
                        items={teacherOptions} placeholder="Select teacher"
                      />
                    </View>
                  );
                })}

                <Pressable style={styles.addBtn} onPress={addPeriod}>
                  <Ionicons name="add-circle-outline" size={18} color={C.primary} />
                  <Text style={styles.addBtnText}>Add Period</Text>
                </Pressable>

                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSaveDay} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save {DAY_LABEL[dayKey]}</Text>}
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={copyModal} transparent animationType="slide" onRequestClose={() => setCopyModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCopyModal(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Copy timetable to</Text>
          <PickerField label="Class" value={copyTargetClass} onChange={setCopyTargetClass} items={classOptions.filter((c) => String(c.value) !== String(classId) || true)} placeholder="Select a class" />
          <PickerField label="Section" value={copyTargetSection} onChange={setCopyTargetSection} items={copyTargetSectionOptions} placeholder="Select a section" disabled={!copyTargetClass} />
          <View style={styles.fridayRow}>
            <Text style={styles.fridayLabel}>Include Friday override</Text>
            <Switch value={copyIncludeFriday} onValueChange={setCopyIncludeFriday} trackColor={{ true: C.primary }} />
          </View>
          <Pressable style={[styles.saveBtn, copying && { opacity: 0.6 }]} onPress={handleCopy} disabled={copying}>
            {copying ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Copy</Text>}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  pickerBlock: { gap: 2 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE',
  },
  actionBtnDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionBtnText: { fontSize: 12.5, fontWeight: '700', color: C.primary },

  dayTabsScroll: { flexGrow: 0, marginTop: 16 },
  dayTabsContent: { gap: 8, paddingBottom: 4 },
  dayTab: {
    minWidth: 56, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9',
  },
  dayTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  dayTabText: { fontSize: 12, fontWeight: '800', color: C.textMed },
  dayTabTextActive: { color: '#FFFFFF' },
  overrideDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F59E0B', marginTop: 4 },

  fridayRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 12,
    backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A',
  },
  fridayLabel: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  fridayHint: { fontSize: 11, color: '#92400E', marginTop: 2 },

  periodsBlock: { marginTop: 16, gap: 12 },
  periodCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  periodHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  periodIndex: { fontSize: 12, fontWeight: '800', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.4 },
  periodHeaderActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  timeInput: {
    flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontWeight: '700', color: C.textDark, textAlign: 'center',
  },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  addBtnText: { color: C.primary, fontWeight: '800', fontSize: 14 },

  saveBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,12,41,0.55)' },
  modalSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 4,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: C.textDark, marginBottom: 8 },
});
