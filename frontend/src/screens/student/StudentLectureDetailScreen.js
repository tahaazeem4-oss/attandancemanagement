import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Linking } from 'react-native';
import AppHeader from '../../components/AppHeader';
import { C } from '../../config/theme';

const TYPE_LABEL = {
  classwork: 'Class Work',
  homework: 'Homework',
};

export default function StudentLectureDetailScreen({ navigation, route }) {
  const lecture = route?.params?.lecture;

  const handleDownload = async () => {
    const url = lecture?.file_url;
    if (!url) {
      Alert.alert('File missing', 'No attachment is available for this item.');
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Cannot open file', 'This device cannot open the attachment URL.');
      return;
    }

    await Linking.openURL(url);
  };

  if (!lecture) {
    return (
      <View style={styles.root}>
        <AppHeader title="Lecture Details" navigation={navigation} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Item not found</Text>
          <Text style={styles.emptySub}>Please go back and open the item again.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Lecture Details" navigation={navigation} />

      <View style={styles.card}>
        <View style={styles.typePill}>
          <Text style={styles.typeText}>{TYPE_LABEL[lecture.type] || 'Lecture'}</Text>
        </View>

        <Text style={styles.title}>{lecture.lecture_name || 'Untitled'}</Text>

        <View style={styles.metaBlock}>
          <Text style={styles.metaRow}>Subject: {lecture.subject_name || '-'}</Text>
          <Text style={styles.metaRow}>Date: {lecture.date?.slice(0, 10) || '-'}</Text>
          <Text style={styles.metaRow}>
            Class: {lecture.class_name || '-'}{lecture.section_name ? ` - Sec ${lecture.section_name}` : ' - All Sections'}
          </Text>
          <Text style={styles.metaRow}>Uploaded by: {lecture.uploaded_by || '-'}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.downloadBtn, pressed && styles.downloadBtnPressed]}
          onPress={handleDownload}
        >
          <Text style={styles.downloadText}>Download Attachment</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  card: {
    backgroundColor: '#fff',
    margin: 14,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  typePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4338CA',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  metaBlock: {
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  metaRow: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  downloadBtn: {
    marginTop: 16,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  downloadBtnPressed: {
    opacity: 0.8,
  },
  downloadText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#334155',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
});
