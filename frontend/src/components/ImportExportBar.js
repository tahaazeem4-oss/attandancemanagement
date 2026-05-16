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
import { exportFile, exportCsvFile, downloadTemplate, importFile } from '../services/importExport';
import { C } from '../config/theme';

export default function ImportExportBar({
  templatePath,
  templateParams = {},
  importPath,
  importFields = {},
  exportPath,
  exportParams = {},
  exportFilename = 'export.xlsx',
  exportCsvFilename,
  showCsvExport = true,
  templateFilename = 'template.xlsx',
  onImportDone,
}) {
  const [loading, setLoading] = useState(null); // 'template' | 'import' | 'export' | 'exportCsv'

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
  const doExportCsv = () => handle('exportCsv', () => exportCsvFile(
    exportPath,
    exportCsvFilename || exportFilename,
    exportParams,
  ));

  const ACTIONS = [
    {
      key: 'template',
      visible: !!templatePath,
      icon: 'document-outline',
      label: 'Template',
      onPress: doTemplate,
      loadingColor: '#3B82F6',
      style: styles.templateBtn,
      labelStyle: styles.templateTxt,
      iconColor: '#3B82F6',
    },
    {
      key: 'import',
      visible: !!importPath,
      icon: 'arrow-up-circle-outline',
      label: 'Import',
      onPress: doImport,
      loadingColor: '#10B981',
      style: styles.importBtn,
      labelStyle: styles.importTxt,
      iconColor: '#10B981',
    },
    {
      key: 'export',
      visible: !!exportPath,
      icon: 'arrow-down-circle-outline',
      label: 'Excel',
      onPress: doExport,
      loadingColor: '#F59E0B',
      style: styles.exportBtn,
      labelStyle: styles.exportTxt,
      iconColor: '#F59E0B',
    },
    {
      key: 'exportCsv',
      visible: !!exportPath && showCsvExport,
      icon: 'document-text-outline',
      label: 'CSV',
      onPress: doExportCsv,
      loadingColor: '#0EA5E9',
      style: styles.csvBtn,
      labelStyle: styles.csvTxt,
      iconColor: '#0EA5E9',
    },
  ].filter(a => a.visible);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {ACTIONS.map(action => (
          <Pressable
            key={action.key}
            style={({ pressed }) => [
              styles.btn, 
              action.style, 
              pressed && styles.btnPressed,
              !!loading && loading !== action.key && styles.btnDisabled
            ]}
            onPress={action.onPress}
            disabled={!!loading}
          >
            {loading === action.key ? (
              <ActivityIndicator size="small" color={action.loadingColor} />
            ) : (
              <>
                <Ionicons name={action.icon} size={20} color={action.iconColor || C.primary} />
                <Text style={action.labelStyle}>{action.label}</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  bar: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  btnPressed: { 
    opacity: 0.85,
  },
  btnDisabled: { opacity: 0.6 },
  templateBtn: { 
    borderColor: '#DBEAFE', 
    backgroundColor: '#F0F9FF',
  },
  importBtn: { 
    borderColor: '#DCFCE7', 
    backgroundColor: '#F0FDF4',
  },
  exportBtn: { 
    borderColor: '#FEF3C7', 
    backgroundColor: '#FFFBEB',
  },
  csvBtn: {
    borderColor: '#DBEAFE',
    backgroundColor: '#F0F9FF',
  },
  templateTxt: { fontSize: 13, fontWeight: '700', color: '#3B82F6' },
  importTxt: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  exportTxt: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  csvTxt: { fontSize: 13, fontWeight: '700', color: '#0EA5E9' },
  lightSub: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  darkSub: { fontSize: 10, color: '#E2E8F0', fontWeight: '600' },
});
