import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';
import { C } from '../../config/theme';

const TYPE_LABEL   = { classwork: 'Class Work', homework: 'Homework' };
const TYPE_COLOR   = { classwork: '#4338CA', homework: '#B45309' };
const TYPE_BG      = { classwork: '#EEF2FF', homework: '#FFFBEB' };
const TYPE_BORDER  = { classwork: '#C7D2FE', homework: '#FDE68A' };
const TYPE_ICON    = { classwork: 'book-outline', homework: 'pencil-outline' };

export default function StudentLectureDetailScreen({ navigation, route }) {
  const lecture = route?.params?.lecture;

  const handleDownload = async () => {
    const url = lecture?.file_url;
    if (!url) { Alert.alert('No attachment', 'No file is attached to this item.'); return; }
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) { Alert.alert('Cannot open', 'This device cannot open the attachment.'); return; }
    await Linking.openURL(url);
  };

  if (!lecture) {
    return (
      <View style={styles.root}>
        <AppHeader title="Details" navigation={navigation} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Item not found</Text>
          <Text style={styles.emptySub}>Go back and open the item again.</Text>
        </View>
      </View>
    );
  }

  const typeColor  = TYPE_COLOR[lecture.type]  || C.primary;
  const typeBg     = TYPE_BG[lecture.type]     || C.primaryLight;
  const typeBorder = TYPE_BORDER[lecture.type] || '#C7D2FE';
  const typeIcon   = TYPE_ICON[lecture.type]   || 'document-outline';

  return (
    <View style={styles.root}>
      <AppHeader title="Lecture Details" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header card ── */}
        <View style={styles.headerCard}>
          <View style={[styles.typePill, { backgroundColor: typeBg, borderColor: typeBorder }]}>
            <Ionicons name={typeIcon} size={12} color={typeColor} />
            <Text style={[styles.typeText, { color: typeColor }]}>{TYPE_LABEL[lecture.type] || 'Lecture'}</Text>
          </View>
          <Text style={styles.title}>{lecture.lecture_name || 'Untitled'}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="book-outline" size={13} color="#64748B" />
              <Text style={styles.metaChipTxt}>{lecture.subject_name || 'Subject'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color="#64748B" />
              <Text style={styles.metaChipTxt}>{(lecture.date || '').slice(0, 10)}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="school-outline" size={13} color="#64748B" />
              <Text style={styles.metaChipTxt}>
                {lecture.class_name || '-'}{lecture.section_name ? ` · Sec ${lecture.section_name}` : ' · All Sections'}
              </Text>
            </View>
          </View>
          {lecture.uploaded_by ? (
            <Text style={styles.uploaderTxt}>Posted by {lecture.uploaded_by}</Text>
          ) : null}
        </View>

        {/* ── Message Board ── */}
        {lecture.message ? (
          <View style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <Ionicons name="chatbox-outline" size={16} color={C.primary} />
              <Text style={styles.messageHeaderTxt}>Instructions / Notes</Text>
            </View>
            <Text style={styles.messageBody}>{lecture.message}</Text>
          </View>
        ) : null}

        {/* ── Attachment ── */}
        {lecture.file_url ? (
          <Pressable
            style={({ pressed }) => [styles.downloadBtn, pressed && { opacity: 0.82 }]}
            onPress={handleDownload}
          >
            <View style={styles.downloadIconWrap}>
              <Ionicons name="document-text-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.downloadTitle}>Download Attachment</Text>
              <Text style={styles.downloadSub}>Tap to open PDF</Text>
            </View>
            <Ionicons name="arrow-down-circle-outline" size={24} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.noAttachment}>
            <Ionicons name="attach-outline" size={16} color="#94A3B8" />
            <Text style={styles.noAttachmentTxt}>No attachment for this item</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },

  // Header card
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#94A3B8',
    shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10,
  },
  typeText:  { fontSize: 12, fontWeight: '800' },
  title:     { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  metaChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0' },
  metaChipTxt: { fontSize: 13, color: '#475569', fontWeight: '500' },
  uploaderTxt: { fontSize: 12, color: '#94A3B8', marginTop: 6 },

  // Message board
  messageCard: {
    backgroundColor: '#fff',
    borderRadius: 16, overflow: 'hidden',
    elevation: 1, shadowColor: '#94A3B8',
    shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
  },
  messageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E0E7FF',
  },
  messageHeaderTxt: { fontSize: 13, fontWeight: '700', color: C.primary },
  messageBody:      { padding: 14, fontSize: 15, color: '#1E293B', lineHeight: 24 },

  // Download button
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#2563EB', borderRadius: 14, padding: 14,
    elevation: 3, shadowColor: '#2563EB', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  downloadIconWrap:  { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  downloadTitle:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  downloadSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  // No attachment
  noAttachment: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  noAttachmentTxt: { fontSize: 13, color: '#94A3B8' },

  // Empty state
  emptyWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#334155' },
  emptySub:   { fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center' },
});
