/**
 * ImportExportBar
 * A compact row of buttons: [↓ Template]  [↑ Import]  [↓ Export]
 *
 * Props:
 *   templatePath  - API path for template download  (optional)
 *   importPath    - API path for import POST          (optional)
 *   exportPath    - API path for export GET           (optional)
 *   exportParams  - query params object for export    (optional)
 *   exportFilename- filename for the downloaded file
 *   onImportDone  - callback(result) after successful import
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { exportFile, downloadTemplate, importFile } from '../services/importExport';
import { C } from '../config/theme';

export default function ImportExportBar({
  templatePath,
  templateParams = {},
  importPath,
  importFields = {},
  exportPath,
  exportParams = {},
  exportFilename = 'export.xlsx',
  templateFilename = 'template.xlsx',
  onImportDone,
}) {
  const [loading, setLoading] = useState(null); // 'template' | 'import' | 'export'

  const handle = async (type, fn) => {
    setLoading(type);
    try { await fn(); } finally { setLoading(null); }
  };

  const doTemplate = () => handle('template', () => downloadTemplate(templatePath, templateFilename, templateParams));

  const doImport = () => handle('import', async () => {
    const result = await importFile(importPath, importFields);
    if (!result) return;
    const msg = result.message || 'Import complete';
    const detail = result.errors?.length
      ? `\n\nSkipped rows:\n${result.errors.slice(0, 5).join('\n')}${result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : ''}`
      : '';
    Alert.alert('Import Result', msg + detail);
    if (onImportDone) onImportDone(result);
  });

  const doExport = () => handle('export', () => exportFile(exportPath, exportFilename, exportParams));

  const ACTIONS = [
    {
      key: 'template',
      visible: !!templatePath,
      icon: 'download-outline',
      label: 'Template',
      sub: 'Get sample file',
      onPress: doTemplate,
      loadingColor: C.primary,
      style: styles.templateBtn,
      labelStyle: styles.templateTxt,
    },
    {
      key: 'import',
      visible: !!importPath,
      icon: 'cloud-upload-outline',
      label: 'Import',
      sub: 'Upload sheet',
      onPress: doImport,
      loadingColor: '#fff',
      style: styles.importBtn,
      labelStyle: styles.importTxt,
      subStyle: styles.darkSub,
      iconColor: '#fff',
    },
    {
      key: 'export',
      visible: !!exportPath,
      icon: 'cloud-download-outline',
      label: 'Export',
      sub: 'Download data',
      onPress: doExport,
      loadingColor: '#fff',
      style: styles.exportBtn,
      labelStyle: styles.exportTxt,
      subStyle: styles.darkSub,
      iconColor: '#fff',
    },
  ].filter(a => a.visible);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Template / Import / Export</Text>
      <View style={styles.bar}>
        {ACTIONS.map(action => (
          <Pressable
            key={action.key}
            style={[styles.btn, action.style, !!loading && loading !== action.key && styles.btnDisabled]}
            onPress={action.onPress}
            disabled={!!loading}
          >
            {loading === action.key ? (
              <ActivityIndicator size="small" color={action.loadingColor} />
            ) : (
              <>
                <Ionicons name={action.icon} size={16} color={action.iconColor || C.primary} />
                <Text style={action.labelStyle}>{action.label}</Text>
                <Text style={action.subStyle || styles.lightSub}>{action.sub}</Text>
              </>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  bar: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  btnDisabled: { opacity: 0.55 },
  templateBtn: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  importBtn:   { borderColor: '#86EFAC', backgroundColor: '#16A34A' },
  exportBtn:   { borderColor: '#93C5FD', backgroundColor: C.primary },
  templateTxt: { fontSize: 13, fontWeight: '800', color: C.primary },
  importTxt:   { fontSize: 13, fontWeight: '800', color: '#fff' },
  exportTxt:   { fontSize: 13, fontWeight: '800', color: '#fff' },
  lightSub: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  darkSub: { fontSize: 10, color: '#E2E8F0', fontWeight: '600' },
});
