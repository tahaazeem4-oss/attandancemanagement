import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { C } from '../../config/theme';
import PickerField from '../../components/PickerField';

export default function StaffNewChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState({ class_id: '', section_id: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(null);
  const mountedRef = useRef(true);

  // Load classes on mount
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const response = await api.get('/classes');
        if (mountedRef.current) {
          const classesData = response.data || [];
          setClasses(classesData);
          if (classesData.length > 0) {
            setFilter({ class_id: String(classesData[0].id), section_id: '' });
            loadSections(classesData[0].id);
          } else {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('[StaffNewChatScreen] Load classes error:', err);
        if (mountedRef.current) {
          Alert.alert('Error', 'Failed to load classes');
          setLoading(false);
        }
      }
    };
    loadClasses();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load sections when class changes
  const loadSections = async (classId) => {
    try {
      const response = await api.get(`/classes/${classId}/sections`);
      if (mountedRef.current) {
        const sectionsData = response.data || [];
        setSections(sectionsData);
        if (sectionsData.length > 0) {
          const newFilter = { class_id: String(classId), section_id: String(sectionsData[0].id) };
          setFilter(newFilter);
          loadStudents(String(classId), String(sectionsData[0].id));
        } else {
          loadStudents(String(classId), '');
        }
      }
    } catch (err) {
      console.error('[StaffNewChatScreen] Load sections error:', err);
      if (mountedRef.current) {
        setSections([]);
        loadStudents(String(classId), '');
      }
    }
  };

  // Load students when class/section changes
  const loadStudents = async (classId, sectionId, q = '') => {
    setLoading(true);
    try {
      const params = {};
      if (q && String(q).trim()) params.q = q;
      if (classId) params.class_id = classId;
      if (sectionId) params.section_id = sectionId;
      
      const response = await api.get('/students', { params });
      if (mountedRef.current) {
        setStudents(response.data || []);
        setLoading(false);
      }
    } catch (err) {
      console.error('[StaffNewChatScreen] Load students error:', err);
      if (mountedRef.current) {
        setStudents([]);
        setLoading(false);
      }
    }
  };

  // Handle class change
  const handleClassChange = (classId) => {
    setFilter({ class_id: classId, section_id: '' });
    setSections([]);
    setStudents([]);
    if (classId) {
      loadSections(classId);
    } else {
      // "All Classes" should fetch students across all classes.
      loadStudents('', '', search);
    }
  };

  // Handle section change
  const handleSectionChange = (sectionId) => {
    setFilter(p => ({ ...p, section_id: sectionId }));
    loadStudents(filter.class_id, sectionId, search);
  };

  // Handle search with debounce
  const searchTimeoutRef = useRef(null);
  const handleSearch = (q) => {
    setSearch(q);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadStudents(filter.class_id, filter.section_id, q);
    }, 300);
  };

  // Select student and open chat
  const selectStudent = async (student) => {
    try {
      setStarting(student.id);

      // Fetch parents for this student
      let parents;
      try {
        console.log(`[StaffNewChatScreen] Fetching parents for student ${student.id} (${student.first_name})`);
        const response = await api.get(`/chat/student/${student.id}/parents`);
        parents = response.data;
        console.log(`[StaffNewChatScreen] Parents response for ${student.first_name}:`, parents);
      } catch (err) {
        const errMsg = err.response?.data?.message 
          || err.response?.data?.error 
          || err.message 
          || 'Failed to fetch parent accounts';
        console.error(`[StaffNewChatScreen] Parent fetch error for ${student.first_name}:`, err.response?.data || err.message);
        throw new Error(`Parents fetch failed: ${errMsg}`);
      }

      if (!parents || parents.length === 0) {
        Alert.alert(
          'No Parent Account',
          `${student.first_name} does not have a parent account registered in the system.`,
        );
        setStarting(null);
        return;
      }

      const parent = parents[0];
      console.log(`[StaffNewChatScreen] Using parent:`, parent);

      // Create conversation
      let conv;
      try {
        console.log(`[StaffNewChatScreen] Creating conversation with parent ${parent.id}`);
        const response = await api.post('/chat/conversations', {
          parent_id: parent.id,
          student_id: student.id,
        });
        conv = response.data;
        console.log(`[StaffNewChatScreen] Conversation created:`, conv);
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message || 'Failed to create conversation';
        console.error(`[StaffNewChatScreen] Conversation error:`, err.response?.data || err.message);
        throw new Error(`Chat creation failed: ${errMsg}`);
      }

      // Return to message list so re-initiation always lands on Messages page.
      navigation.navigate('ChatList', { refreshAt: Date.now(), openedConversationId: conv?.id || null });
    } catch (err) {
      Alert.alert('Error Starting Chat', err.message);
    } finally {
      setStarting(null);
    }
  };

  const selectedClassObj = classes.find(c => String(c.id) === String(filter.class_id));
  const selectedSectionObj = sections.find(s => String(s.id) === String(filter.section_id));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={28} color={C.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Message Parent</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Filter Summary */}
      <View style={styles.filterSummary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.filterTitle}>Student Selection</Text>
          <Text style={styles.filterSubTitle}>
            {selectedClassObj?.class_name || 'All Classes'}
            {selectedSectionObj ? ` - Section ${selectedSectionObj.section_name}` : ' - All Sections'}
          </Text>
        </View>
        <Pressable style={({ pressed }) => [styles.filterToggleBtn, pressed && { opacity: 0.8 }]} onPress={() => setFiltersOpen(v => !v)}>
          <Text style={styles.filterToggleTxt}>{filtersOpen ? 'Hide' : 'Filters'}</Text>
        </Pressable>
      </View>

      {/* Filter Panel */}
      {filtersOpen && (
        <View style={styles.filterPanel}>
          <Text style={styles.fieldLabel}>Class</Text>
          <PickerField
            label="Class"
            value={filter.class_id}
            onChange={handleClassChange}
            placeholder="Select class"
            items={[{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))]}
          />

          <Text style={styles.fieldLabel}>Section</Text>
          <PickerField
            label="Section"
            value={filter.section_id}
            onChange={handleSectionChange}
            placeholder="All Sections"
            disabled={!filter.class_id}
            items={[{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: `Section ${s.section_name}`, value: String(s.id) }))]}
          />

          <Pressable
            style={({ pressed }) => [styles.clearFilterBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setFilter({ class_id: '', section_id: '' });
              setSections([]);
              loadStudents('', '', search);
            }}
          >
            <Text style={styles.clearFilterTxt}>Clear Filters</Text>
          </Pressable>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={C.border} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          placeholderTextColor={C.border}
          value={search}
          onChangeText={handleSearch}
        />
        {search ? (
          <Pressable onPress={() => handleSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.border} />
          </Pressable>
        ) : null}
      </View>

      {/* Students List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : students.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={C.border} />
          <Text style={styles.emptyText}>No students found</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.studentCard, pressed && { opacity: 0.85 }]}
              onPress={() => selectStudent(item)}
              disabled={starting === item.id}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.first_name?.[0] || '') + (item.last_name?.[0] || '')}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
                {item.roll_no && <Text style={styles.rollNo}>Roll #: {item.roll_no}</Text>}
              </View>
              {starting === item.id ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={C.border} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  filterSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filterSubTitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  filterToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  filterToggleTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  filterPanel: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    padding: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    marginTop: 8,
  },
  clearFilterBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  clearFilterTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  rollNo: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});
