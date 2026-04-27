import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, StatusBar, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { C, S } from '../../config/theme';

const STATUS_COLOR = { pending: '#D97706', approved: '#059669', rejected: '#DC2626', cancelled: '#64748B' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2', cancelled: '#F1F5F9' };
const WEEK_DAYS    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Inline Calendar for multi-date selection ──────────────────
function CalendarPicker({ selectedDates, onChange }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();

  const toStr = (d) =>
    `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const toggle = (d) => {
    const ds = toStr(d);
    if (ds < todayStr) return; // can't select past days
    if (selectedDates.includes(ds)) onChange(selectedDates.filter(x => x !== ds));
    else onChange([...selectedDates, ds].sort());
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); }
    else setViewMonth(m => m+1);
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={cal.container}>
      {/* Month nav */}
      <View style={cal.nav}>
        <Pressable onPress={prevMonth} style={cal.navBtn}><Text style={cal.navArrow}>‹</Text></Pressable>
        <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <Pressable onPress={nextMonth} style={cal.navBtn}><Text style={cal.navArrow}>›</Text></Pressable>
      </View>
      {/* Day headers */}
      <View style={cal.row}>
        {WEEK_DAYS.map(d => <Text key={d} style={cal.dayHeader}>{d}</Text>)}
      </View>
      {/* Date grid */}
      <View style={cal.row}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={cal.cell} />;
          const ds  = toStr(d);
          const sel = selectedDates.includes(ds);
          const past= ds < todayStr;
          return (
            <Pressable key={i} onPress={() => toggle(d)} style={[cal.cell, sel && cal.selCell, past && cal.pastCell]}>
              <Text style={[cal.dayNum, sel && cal.selNum, past && cal.pastNum]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function StudentLeaveScreen() {
  const [groups,    setGroups]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [selDates,  setSelDates]  = useState([]);
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [withdrawing, setWithdrawing] = useState(null); // group_id being withdrawn
  const [confirmWithdraw, setConfirmWithdraw] = useState(null); // group_id awaiting tap-confirm

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/student-portal/leaves');
      // Hide fully cancelled groups
      setGroups(data.filter(g => g.status !== 'cancelled'));
    }
    catch { Alert.alert('Error', 'Could not load leaves'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const openModal = () => { setSelDates([]); setReason(''); setModal(true); };

  const handleApply = async () => {
    if (selDates.length === 0) return Alert.alert('Validation', 'Please select at least one date.');
    if (!reason.trim())        return Alert.alert('Validation', 'Please provide a reason for leave.');
    setSaving(true);
    try {
      await api.post('/student-portal/leaves', { dates: selDates, reason: reason.trim() });
      setModal(false);
      load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed to apply'); }
    finally { setSaving(false); }
  };

  // First tap: show confirm state on button
  // Second tap: actually send the request
  const handleWithdrawTap = (group_id) => {
    if (confirmWithdraw === group_id) {
      setConfirmWithdraw(null);
      doWithdraw(group_id);
    } else {
      setConfirmWithdraw(group_id);
      // Auto-reset confirm state after 4 seconds if user doesn't tap again
      setTimeout(() => setConfirmWithdraw(c => c === group_id ? null : c), 4000);
    }
  };

  const doWithdraw = async (group_id) => {
    setWithdrawing(group_id);
    try {
      await api.put(`/student-portal/leaves/group/${group_id}/withdraw`);
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send withdrawal request');
    } finally {
      setWithdrawing(null);
    }
  };

  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    if (dates.length === 1) return dates[0];
    if (dates.length <= 3) return dates.join(', ');
    return `${dates[0]}  +${dates.length - 1} more`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#064E3B" />

      <LinearGradient colors={['#064E3B','#065F46','#047857']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.header}>
        <Text style={styles.headerTitle}>Leave Applications 📩</Text>
        <Text style={styles.headerSub}>Apply for leave or check your application status</Text>
      </LinearGradient>

      {loading
        ? <ActivityIndicator color="#059669" style={{ flex: 1 }} />
        : (
          <FlatList
            data={groups}
            keyExtractor={g => String(g.group_id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No leave applications yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateText}>📅 {formatDates(item.dates)}</Text>
                    {item.dates.length > 1 && (
                      <Text style={styles.dateCount}>{item.dates.length} days selected</Text>
                    )}
                    <Text style={styles.appliedText}>Applied: {new Date(item.applied_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] || '#F1F5F9' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || '#64748B' }]}>
                      {item.status?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reason}>"{item.reason}"</Text>

                {/* Withdrawal status chip */}
                {item.withdrawal_status === 'pending' && (
                  <View style={styles.withdrawalChip}>
                    <Text style={styles.withdrawalChipTxt}>⏳ Withdrawal Pending — awaiting teacher approval</Text>
                  </View>
                )}
                {item.withdrawal_status === 'rejected' && (
                  <View style={[styles.withdrawalChip, styles.withdrawalChipRejected]}>
                    <Text style={[styles.withdrawalChipTxt, styles.withdrawalChipRejectedTxt]}>❌ Withdrawal Rejected — you may re-request below</Text>
                  </View>
                )}

                {/* Withdraw button: hide only while a withdrawal is pending */}
                {(item.status === 'pending' || item.status === 'approved') && item.withdrawal_status !== 'pending' && (
                  <Pressable
                    style={[
                      styles.withdrawBtn,
                      confirmWithdraw === item.group_id && { backgroundColor: '#FEF2F2', borderColor: '#DC2626' },
                      withdrawing === item.group_id && { opacity: 0.5 },
                    ]}
                    disabled={withdrawing === item.group_id}
                    onPress={() => handleWithdrawTap(item.group_id)}
                  >
                    {withdrawing === item.group_id
                      ? <ActivityIndicator size="small" color="#DC2626" />
                      : confirmWithdraw === item.group_id
                        ? <Text style={[styles.withdrawText, { color: '#DC2626' }]}>Tap again to confirm ✓</Text>
                        : <Text style={styles.withdrawText}>↩ Request Withdrawal</Text>}
                  </Pressable>
                )}
              </View>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={openModal}>
        <Text style={styles.fabText}>+ Apply for Leave</Text>
      </Pressable>

      {/* ── Apply Modal ── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Apply for Leave</Text>
              <Text style={styles.modalSub}>Tap dates to select (multiple allowed)</Text>

              <CalendarPicker selectedDates={selDates} onChange={setSelDates} />

              {selDates.length > 0 && (
                <View style={styles.selectedBox}>
                  <Text style={styles.selectedLabel}>Selected dates ({selDates.length}):</Text>
                  <Text style={styles.selectedDates}>{selDates.join('  •  ')}</Text>
                </View>
              )}

              <Text style={[S.label, { marginTop: 12 }]}>Reason *</Text>
              <TextInput
                style={[S.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Briefly describe your reason…"
                multiline
                value={reason}
                onChangeText={setReason}
              />

              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleApply} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Submit</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Calendar styles ───────────────────────────────────────────
const cal = StyleSheet.create({
  container:  { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 10 },
  nav:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  navBtn:     { paddingHorizontal: 12, paddingVertical: 4 },
  navArrow:   { fontSize: 22, color: '#059669', fontWeight: '700' },
  monthLabel: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  row:        { flexDirection: 'row', flexWrap: 'wrap' },
  dayHeader:  { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#64748B', paddingVertical: 4 },
  cell:       { width: '14.28%', alignItems: 'center', paddingVertical: 5 },
  dayNum:     { fontSize: 13, color: '#1E293B', fontWeight: '500' },
  selCell:    { backgroundColor: '#059669', borderRadius: 8 },
  selNum:     { color: '#fff', fontWeight: '800' },
  pastCell:   { opacity: 0.3 },
  pastNum:    { color: '#94A3B8' },
});

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 24 },
  headerTitle:  { color: '#ECFDF5', fontSize: 22, fontWeight: '800' },
  headerSub:    { color: '#A7F3D0', fontSize: 13, marginTop: 4 },
  card:         { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  dateText:     { fontSize: 14, fontWeight: '700', color: C.textDark },
  dateCount:    { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 2 },
  appliedText:  { fontSize: 12, color: C.textLight, marginTop: 2 },
  statusBadge:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:   { fontSize: 11, fontWeight: '800' },
  reason:       { fontSize: 13, color: C.textMed, fontStyle: 'italic', backgroundColor: C.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
  withdrawBtn:  { alignSelf: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 6 },
  withdrawText: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  withdrawalChip: { backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6, borderWidth: 1, borderColor: '#FDE68A' },
  withdrawalChipTxt: { color: '#92400E', fontSize: 12, fontWeight: '600' },
  withdrawalChipRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  withdrawalChipRejectedTxt: { color: '#991B1B' },
  empty:        { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:          { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: '#059669', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText:      { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '88%' },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 2 },
  modalSub:     { fontSize: 12, color: C.textLight, marginBottom: 12 },
  selectedBox:  { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginTop: 6 },
  selectedLabel:{ fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 },
  selectedDates:{ fontSize: 12, color: '#065F46', lineHeight: 18 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:    { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  cancelText:   { color: C.textMed, fontWeight: '700' },
  saveBtn:      { backgroundColor: '#059669' },
  saveText:     { color: '#fff', fontWeight: '800' },
});
