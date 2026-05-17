import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../../config/theme';

const FILE_BADGE = {
  pdf: { bg: '#FEE2E2', border: '#FECACA', text: '#DC2626' },
  docx: { bg: '#DBEAFE', border: '#BFDBFE', text: '#1D4ED8' },
  pptx: { bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' },
  ppt: { bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' },
  txt: { bg: '#F1F5F9', border: '#E2E8F0', text: '#64748B' },
};

function formatDate(iso) {
  if (!iso) return '';
  const diffDays = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MaterialCard({ material, onPress }) {
  const ext = (material.file_ext || '').replace('.', '').toLowerCase();
  const badge = FILE_BADGE[ext] || FILE_BADGE.txt;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <View style={styles.cardAccent} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <View style={[styles.fileBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.fileBadgeText, { color: badge.text }]}>{(ext || 'FILE').toUpperCase()}</Text>
          </View>
          {!!material.page_count && (
            <View style={styles.pagePill}>
              <Ionicons name="book-outline" size={11} color={C.textLight} />
              <Text style={styles.pagePillText}>{material.page_count} pages</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{material.title}</Text>

        {!!material.topic && (
          <View style={styles.topicPill}>
            <Ionicons name="bookmark-outline" size={12} color={C.primary} />
            <Text style={styles.topicText}>{material.topic}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Ionicons name="person-circle-outline" size={13} color={C.textLight} />
          <Text style={styles.metaText}>{material.uploaded_by_name || 'Teacher'}</Text>
          <View style={styles.dot} />
          <Ionicons name="time-outline" size={12} color={C.textLight} />
          <Text style={styles.metaText}>{formatDate(material.created_at)}</Text>
        </View>
      </View>
      <View style={styles.chevronWrap}>
        <Ionicons name="chevron-forward" size={18} color={C.primary} />
      </View>
    </TouchableOpacity>
  );
}

export default function StudentAiMaterialsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const materials = Array.isArray(route?.params?.materials) ? route.params.materials : [];
  const subjectId = route?.params?.subjectId;
  const subjectName = route?.params?.subjectName;
  const child = route?.params?.child;

  return (
    <View style={styles.flex}>
      <LinearGradient colors={C.brandGradient} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.headerLabel}>AI TUTOR</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{subjectName || 'Study Materials'}</Text>
          <Text style={styles.headerSub}>Select a file before opening the chat.</Text>
        </View>
        <View style={styles.headerSide} />
      </LinearGradient>

      {materials.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="documents-outline" size={38} color={C.primary} />
          </View>
          <Text style={styles.emptyTitle}>No materials found</Text>
          <Text style={styles.emptyBody}>There are no ready study files for this subject yet.</Text>
        </View>
      ) : (
        <FlatList
          data={materials}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <MaterialCard
              material={item}
              onPress={() => navigation.navigate('StudentAiChat', {
                subjectId,
                subjectName,
                selectedMaterial: item,
                materials,
                ...(child ? { child } : {}),
              })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: C.brandDeep,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  backBtn: {
    marginRight: 2,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSide: { width: 42, height: 42 },
  titleWrap: { flex: 1, alignItems: 'center', minWidth: 0 },
  headerLabel: { color: C.headerSub, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2, textAlign: 'center' },
  headerTitle: { color: C.headerText, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  headerSub: { color: C.headerSub, fontSize: 13, marginTop: 2, textAlign: 'center' },
  listContent: { padding: 14, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccent: { width: 4, alignSelf: 'stretch', backgroundColor: C.primary },
  cardBody: { flex: 1, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fileBadge: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  fileBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  pagePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pagePillText: { fontSize: 10, color: C.textLight, fontWeight: '600' },
  cardTitle: { color: C.textDark, fontSize: 15, fontWeight: '800', lineHeight: 21, marginBottom: 7 },
  topicPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  topicText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: C.textLight },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1', marginHorizontal: 2 },
  chevronWrap: { paddingHorizontal: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: C.textDark, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyBody: { color: C.textMed, fontSize: 13, lineHeight: 21, textAlign: 'center' },
});