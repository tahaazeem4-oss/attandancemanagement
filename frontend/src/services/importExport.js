import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem     from 'expo-file-system/legacy';
import * as Sharing        from 'expo-sharing';
import { Alert }           from 'react-native';
import api from './api';

// Convert an ArrayBuffer to a base64 string (needed to write binary via FileSystem)
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Export ────────────────────────────────────────────────────────────────
/**
 * Downloads an Excel file via axios (uses the existing Authorization header),
 * writes it to the app cache, then opens the native share sheet.
 */
export async function exportFile(path, filename, params = {}) {
  try {
    // Use axios so the Authorization header is sent automatically
    const response = await api.get(path, {
      params,
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Write binary to cache as base64
    const base64 = arrayBufferToBase64(response.data);
    const localUri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Share / save via native sheet
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(localUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Save or share the report',
        UTI: 'com.microsoft.excel.xlsx',
      });
    } else {
      Alert.alert('Saved', `File saved to: ${localUri}`);
    }
    return true;
  } catch (err) {
    const status = err?.response?.status;
    const msg    = err?.response?.data
      ? (() => { try { return JSON.parse(new TextDecoder().decode(err.response.data)).message; } catch { return null; } })()
      : null;
    console.error('[exportFile]', status, msg || err.message);
    Alert.alert('Export Failed', msg || (status ? `Server error ${status}` : err.message) || 'Unknown error');
    return false;
  }
}

// ── Download Template ─────────────────────────────────────────────────────
export async function downloadTemplate(path, filename) {
  return exportFile(path, filename);
}

// ── Import ────────────────────────────────────────────────────────────────
/**
 * Let the user pick an xlsx/csv file and upload it to the backend.
 * @param {string} path   - API path, e.g. '/import-export/teachers/import'
 * @returns {{ created, errors, message } | null}
 */
export async function importFile(path) {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        '*/*', // fallback for some Android versions
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    const uri   = asset.uri;
    const name  = asset.name || 'upload.xlsx';
    const type  = asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // Build multipart form
    const formData = new FormData();
    formData.append('file', { uri, name, type });

    const { data } = await api.post(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return data; // { message, created, errors[] }
  } catch (err) {
    console.error('[importFile]', err);
    Alert.alert('Import Failed', err?.response?.data?.message || err.message || 'Unknown error');
    return null;
  }
}
