import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, Modal, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { C, S } from "../../config/theme";
import AppHeader from "../../components/AppHeader";

const EMPTY_FORM = { email: "", password: "", first_name: "", last_name: "", phone: "" };

export default function AdminParentsScreen({ navigation }) {
  // ── List state ────────────────────────────────────────────────
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Add/Edit modal ────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Children modal ────────────────────────────────────────────
  const [childModal, setChildModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);

  // ── Student search state ──────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [selClass, setSelClass] = useState(null);
  const [selSection, setSelSection] = useState(null);
  const [nameQ, setNameQ] = useState("");
  const [stuLoading, setStuLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  // ── Load parents ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/parents");
      setParents(data.parents || []);
    } catch { Alert.alert("Error", "Could not load parents"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ───────────────────────────────────────────────────
  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const initials = (p) => {
    var a = (p.first_name || "?")[0].toUpperCase();
    var b = (p.last_name || "")[0] ? p.last_name[0].toUpperCase() : "";
    return a + b;
  };

  // ── Open modals ───────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ email: p.email || "", password: "", first_name: p.first_name || "", last_name: p.last_name || "", phone: p.phone || "" });
    setModal(true);
  };

  // ── Save parent ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.email) return Alert.alert("Validation", "Email is required.");
    if (!editing && !form.password) return Alert.alert("Validation", "Password is required for new parents.");
    setSaving(true);
    try {
      if (editing) {
        const upd = { email: form.email, first_name: form.first_name, last_name: form.last_name, phone: form.phone };
        if (form.password) upd.password = form.password;
        await api.put("/admin/parents/" + editing.id, upd);
      } else {
        await api.post("/admin/parents", form);
      }
      setModal(false);
      load();
    } catch (err) {
      Alert.alert("Error", (err.response && err.response.data && err.response.data.message) || "Could not save");
    } finally { setSaving(false); }
  };

  // ── Delete parent ─────────────────────────────────────────────
  const handleDelete = (p) => {
    Alert.alert("Delete Parent", "Delete " + p.email + "?\nThis will also remove all linked children.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try { await api.delete("/admin/parents/" + p.id); load(); }
          catch (err) { Alert.alert("Error", (err.response && err.response.data && err.response.data.message) || "Could not delete"); }
        },
      },
    ]);
  };

  // ── Open children modal ───────────────────────────────────────
  const openChildren = async (p) => {
    setSelectedParent(p);
    setChildren([]);
    setClasses([]);
    setSections([]);
    setStudents([]);
    setSelClass(null);
    setSelSection(null);
    setNameQ("");
    setChildModal(true);
    setChildrenLoading(true);
    try {
      const [childRes, classRes] = await Promise.all([
        api.get("/admin/parents/" + p.id + "/children"),
        api.get("/classes"),
      ]);
      setChildren(childRes.data.children || []);
      setClasses(Array.isArray(classRes.data) ? classRes.data : (classRes.data.classes || []));
    } catch { Alert.alert("Error", "Failed to load data"); }
    finally { setChildrenLoading(false); }
  };

  // ── Class select ──────────────────────────────────────────────
  const onSelectClass = async (cls) => {
    setSelClass(cls);
    setSelSection(null);
    setStudents([]);
    setSections([]);
    try {
      const { data } = await api.get("/classes/" + cls.id + "/sections");
      setSections(Array.isArray(data) ? data : (data.sections || []));
    } catch { Alert.alert("Error", "Failed to load sections"); }
  };

  // ── Section select ────────────────────────────────────────────
  const onSelectSection = async (sec) => {
    setSelSection(sec);
    setStudents([]);
    setStuLoading(true);
    try {
      const { data } = await api.get("/students", { params: { class_id: selClass.id, section_id: sec.id } });
      setStudents(Array.isArray(data) ? data : (data.students || []));
    } catch { Alert.alert("Error", "Failed to load students"); }
    finally { setStuLoading(false); }
  };

  // ── Link / unlink ─────────────────────────────────────────────
  const onLink = async (student) => {
    setLinking(true);
    try {
      await api.post("/admin/parents/" + selectedParent.id + "/link-child", { student_id: student.id, relationship: "parent" });
      const { data } = await api.get("/admin/parents/" + selectedParent.id + "/children");
      setChildren(data.children || []);
    } catch (err) {
      Alert.alert("Error", (err.response && err.response.data && err.response.data.message) || "Failed to link");
    } finally { setLinking(false); }
  };

  const onUnlink = (studentId, name) => {
    Alert.alert("Remove Child", "Remove " + name + " from this parent?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await api.delete("/admin/parents/" + selectedParent.id + "/children/" + studentId);
            setChildren(function(prev) { return prev.filter(function(c) { return c.student_id !== studentId; }); });
          } catch { Alert.alert("Error", "Failed to unlink"); }
        },
      },
    ]);
  };

  const isLinked = (id) => children.some(function(c) { return c.student_id === id; });

  const filteredStudents = students.filter(function(s) {
    if (!nameQ.trim()) return true;
    var q = nameQ.toLowerCase();
    return ((s.first_name || "").toLowerCase().includes(q) || (s.last_name || "").toLowerCase().includes(q));
  });

  // ── Render parent card (student style) ───────────────────────
  const renderParent = function({ item }) {
    return (
      <Pressable
        style={function({ pressed }) { return [styles.card, pressed && { opacity: 0.88 }]; }}
        onPress={function() { openEdit(item); }}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.first_name || ""} {item.last_name || ""}</Text>
          <Text style={styles.sub}>{item.email}</Text>
          {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
        </View>
        <Pressable style={styles.childBtn} onPress={function() { openChildren(item); }}>
          <Ionicons name="people" size={15} color={C.primary} />
          <Text style={styles.childBtnTxt}>Children</Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Parents" navigation={navigation} />

      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={parents}
            keyExtractor={function(item) { return String(item.id); }}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No parent accounts yet.</Text>}
            renderItem={renderParent}
          />
        )
      }

      {/* FAB */}
      <Pressable style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Parent</Text>
      </Pressable>

      {/* ── Add/Edit Modal ─────────────────────────────────────── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={function() { setModal(false); }}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? "Edit Parent" : "Add Parent"}</Text>

              <Text style={S.label}>Email *</Text>
              <TextInput style={S.input} placeholder="parent@email.com" value={form.email}
                onChangeText={function(v) { F("email", v); }} keyboardType="email-address" autoCapitalize="none" />

              <Text style={S.label}>{editing ? "New Password (leave blank to keep)" : "Password *"}</Text>
              <TextInput style={S.input} placeholder="Password" value={form.password}
                onChangeText={function(v) { F("password", v); }} secureTextEntry />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={S.label}>First Name</Text>
                  <TextInput style={S.input} placeholder="First name" value={form.first_name}
                    onChangeText={function(v) { F("first_name", v); }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.label}>Last Name</Text>
                  <TextInput style={S.input} placeholder="Last name" value={form.last_name}
                    onChangeText={function(v) { F("last_name", v); }} />
                </View>
              </View>

              <Text style={S.label}>Phone</Text>
              <TextInput style={S.input} placeholder="Phone number" value={form.phone}
                onChangeText={function(v) { F("phone", v); }} keyboardType="phone-pad" />

              {editing && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Danger Zone</Text>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: "#DC2626", marginTop: 8 }]}
                    onPress={function() { var cur = editing; setModal(false); handleDelete(cur); }}
                  >
                    <Text style={styles.saveBtnText}>Delete Parent</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={function() { setModal(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Children Modal ─────────────────────────────────────── */}
      <Modal visible={childModal} transparent animationType="slide" onRequestClose={function() { setChildModal(false); }}>
        <View style={styles.overlay}>
          <View style={styles.childrenSheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedParent ? ((selectedParent.first_name || "") + " " + (selectedParent.last_name || "")).trim() || selectedParent.email : ""} — Children
              </Text>
              <Pressable onPress={function() { setChildModal(false); }}>
                <Ionicons name="close" size={26} color={C.textDark} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {/* Linked children */}
              <Text style={styles.sectionLabel}>Linked Children</Text>
              {childrenLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
              ) : children.length === 0 ? (
                <Text style={styles.empty2}>No children linked yet</Text>
              ) : (
                children.map(function(c) {
                  return (
                    <View key={c.student_id} style={styles.childRow}>
                      <View style={styles.childAvatar}>
                        <Text style={styles.avatarText}>{(c.first_name || "?")[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{c.first_name} {c.last_name}</Text>
                        <Text style={styles.sub}>{c.relationship || "parent"}</Text>
                      </View>
                      <Pressable onPress={function() { onUnlink(c.student_id, c.first_name + " " + c.last_name); }}>
                        <Ionicons name="close-circle" size={22} color="#DC2626" />
                      </Pressable>
                    </View>
                  );
                })
              )}

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Search &amp; Add Student</Text>

              {/* Class chips */}
              <Text style={styles.filterLabel}>Class</Text>
              {classes.length === 0
                ? <Text style={styles.empty2}>No classes found</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {classes.map(function(cls) {
                      var active = selClass && selClass.id === cls.id;
                      return (
                        <TouchableOpacity key={cls.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={function() { onSelectClass(cls); }}>
                          <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{cls.class_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )
              }

              {/* Section chips */}
              {selClass ? (
                <>
                  <Text style={styles.filterLabel}>Section</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {sections.map(function(sec) {
                      var active = selSection && selSection.id === sec.id;
                      return (
                        <TouchableOpacity key={sec.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={function() { onSelectSection(sec); }}>
                          <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{sec.section_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {/* Student list */}
              {selSection ? (
                <>
                  <TextInput style={[S.input, { marginBottom: 8 }]}
                    placeholder="Search by name…" value={nameQ} onChangeText={setNameQ} />
                  {stuLoading ? (
                    <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
                  ) : filteredStudents.length === 0 ? (
                    <Text style={styles.empty2}>No students found</Text>
                  ) : (
                    filteredStudents.map(function(s) {
                      var linked = isLinked(s.id);
                      return (
                        <View key={s.id} style={styles.stuRow}>
                          <View style={styles.childAvatar}>
                            <Text style={styles.avatarText}>{(s.first_name || "?")[0].toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.name}>{s.first_name} {s.last_name}</Text>
                            <Text style={styles.sub}>{s.roll_no ? "Roll: " + s.roll_no : "ID: " + s.id}</Text>
                          </View>
                          {linked ? (
                            <View style={styles.linkedBadge}>
                              <Text style={styles.linkedBadgeTxt}>Linked</Text>
                            </View>
                          ) : (
                            <Pressable style={[styles.linkBtn, linking && { opacity: 0.6 }]}
                              onPress={function() { onLink(s); }} disabled={linking}>
                              {linking
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={styles.linkBtnTxt}>+ Link</Text>}
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // ── Card list ──────────────────────────────────────────────────
  card: {
    backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14,
    flexDirection: "row", alignItems: "center",
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: "#EEF2FF",
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  childAvatar: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF2FF",
    justifyContent: "center", alignItems: "center", marginRight: 10,
  },
  avatarText: { color: C.primary, fontWeight: "800", fontSize: 14 },
  name: { fontSize: 15, fontWeight: "700", color: C.textDark },
  sub: { fontSize: 12, color: C.textLight, marginTop: 1 },
  childBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10,
  },
  childBtnTxt: { fontSize: 11, fontWeight: "700", color: C.primary },
  empty: { textAlign: "center", color: C.textLight, marginTop: 40, fontSize: 15 },
  empty2: { fontSize: 13, color: C.textLight, textAlign: "center", marginVertical: 8 },
  // ── FAB ────────────────────────────────────────────────────────
  fab: {
    position: "absolute", bottom: 24, right: 20, backgroundColor: C.primary,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14,
    elevation: 6, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  // ── Modals ─────────────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  childrenSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 10, maxHeight: "92%",
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.textDark, flex: 1, marginRight: 8 },
  row: { flexDirection: "row", gap: 10 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: C.textMed, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  filterLabel: { fontSize: 12, fontWeight: "600", color: C.textMed, marginBottom: 6 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelBtnText: { color: C.textMed, fontWeight: "700" },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  // ── Child / student rows ───────────────────────────────────────
  childRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  stuRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  // ── Class/section chips ────────────────────────────────────────
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#F3F4F6", marginRight: 8 },
  chipActive: { backgroundColor: C.primary },
  chipTxt: { fontSize: 13, fontWeight: "600", color: C.textMed },
  chipTxtActive: { color: "#fff" },
  // ── Link badge / button ────────────────────────────────────────
  linkBtn: { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  linkBtnTxt: { fontSize: 13, fontWeight: "700", color: "#fff" },
  linkedBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  linkedBadgeTxt: { fontSize: 12, fontWeight: "600", color: "#059669" },
});
