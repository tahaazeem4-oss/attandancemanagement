import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem     from 'expo-file-system/legacy';
import * as Sharing        from 'expo-sharing';
import { Alert }           from 'react-native';
import api from './api';

// Convert an ArrayBuffer to a base64 string (needed to write binary via FileSystem)
// Avoids using global btoa because it may be unavailable in some RN runtimes.
function arrayBufferToBase64(buffer) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  let out = '';
  let i = 0;

  while (i < bytes.length) {
    const b1 = bytes[i++] || 0;
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | ((Number.isNaN(b2) ? 0 : b2) >> 4);
    const enc3 = Number.isNaN(b2) ? 64 : (((b2 & 15) << 2) | ((Number.isNaN(b3) ? 0 : b3) >> 6));
    const enc4 = Number.isNaN(b3) ? 64 : (b3 & 63);

    out += chars.charAt(enc1);
    out += chars.charAt(enc2);
    out += enc3 === 64 ? '=' : chars.charAt(enc3);
    out += enc4 === 64 ? '=' : chars.charAt(enc4);
  }

  return out;
}

// ── Export ────────────────────────────────────────────────────────────────
/**
 * Downloads an Excel file via axios (uses the existing Authorization header),
 * writes it to the app cache, then opens the native share sheet.
 */
export async function exportFile(path, filename, params = {}) {
  try {
    if (!path) {
      Alert.alert('Export Failed', 'Export path is missing.');
      return false;
    }

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
export async function downloadTemplate(path, filename, params = {}) {
  return exportFile(path, filename, params);
}

// ── Import ────────────────────────────────────────────────────────────────
/**
 * Let the user pick an xlsx/csv file and upload it to the backend.
 * @param {string} path   - API path, e.g. '/import-export/teachers/import'
 * @returns {{ created, errors, message } | null}
 */
export async function importFile(path, extraFields = {}) {
  try {
    if (!path) {
      Alert.alert('Import Failed', 'Import path is missing.');
      return null;
    }

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
    let uri     = asset.uri;
    const name  = asset.name || 'upload.xlsx';
    const type  = asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // Some Android pickers return content:// URIs that fail multipart upload.
    // Copy once to cache and upload from a stable file:// URI.
    if (uri && !String(uri).startsWith('file://')) {
      const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const cachedUri = `${FileSystem.cacheDirectory}import_${Date.now()}_${safeName}`;
      await FileSystem.copyAsync({ from: uri, to: cachedUri });
      uri = cachedUri;
    }

    // Build multipart form
    const formData = new FormData();
    formData.append('file', { uri, name, type });
    Object.entries(extraFields || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      formData.append(k, String(v));
    });

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
