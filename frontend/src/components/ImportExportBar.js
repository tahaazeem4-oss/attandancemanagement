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
import { exportFile, downloadTemplate, importFile } from '../services/importExport';
import { C } from '../config/theme';

export default function ImportExportBar({
  templatePath,
  importPath,
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

  const doTemplate = () => handle('template', () => downloadTemplate(templatePath, templateFilename));

  const doImport = () => handle('import', async () => {
    const result = await importFile(importPath);
    if (!result) return;
    const msg = result.message || 'Import complete';
    const detail = result.errors?.length
      ? `\n\nSkipped rows:\n${result.errors.slice(0, 5).join('\n')}${result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : ''}`
      : '';
    Alert.alert('Import Result', msg + detail);
    if (onImportDone) onImportDone(result);
  });

  const doExport = () => handle('export', () => exportFile(exportPath, exportFilename, exportParams));

  return (
    <View style={styles.bar}>
      {templatePath && (
        <Pressable style={[styles.btn, styles.templateBtn]} onPress={doTemplate} disabled={!!loading}>
          {loading === 'template'
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Text style={styles.templateTxt}>Template</Text>}
        </Pressable>
      )}
      {importPath && (
        <Pressable style={[styles.btn, styles.importBtn]} onPress={doImport} disabled={!!loading}>
          {loading === 'import'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.importTxt}>Import</Text>}
        </Pressable>
      )}
      {exportPath && (
        <Pressable style={[styles.btn, styles.exportBtn]} onPress={doExport} disabled={!!loading}>
          {loading === 'export'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.exportTxt}>Export</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  templateBtn: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  importBtn:   { borderColor: '#86EFAC', backgroundColor: '#16A34A' },
  exportBtn:   { borderColor: '#93C5FD', backgroundColor: C.primary },
  templateTxt: { fontSize: 13, fontWeight: '800', color: C.primary },
  importTxt:   { fontSize: 13, fontWeight: '800', color: '#fff' },
  exportTxt:   { fontSize: 13, fontWeight: '800', color: '#fff' },
});
