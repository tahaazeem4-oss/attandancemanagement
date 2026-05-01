/**
 * importExport.js  — Frontend service
 *
 * importFile(endpoint)  — picks an xlsx/csv file and POSTs it to the backend
 * exportFile(endpoint, filename, params) — GETs an xlsx from backend and saves/shares it
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem      from 'expo-file-system/legacy';
import * as Sharing         from 'expo-sharing';
import { Alert, Platform }  from 'react-native';
import api from './api';

const BASE = api.defaults.baseURL; // e.g. http://192.168.100.36:5000/api

// ── Export ────────────────────────────────────────────────────────────────
/**
 * Download an Excel file from the backend and open the share sheet.
 * @param {string} path   - API path, e.g. '/import-export/teachers/export'
 * @param {string} filename - e.g. 'teachers.xlsx'
 * @param {object} params - query params object (optional)
 */
export async function exportFile(path, filename, params = {}) {
  try {
    const token = api.defaults.headers.common['Authorization']?.replace('Bearer ', '');
    const query = new URLSearchParams({ ...params, _token: token }).toString();
    const url   = `${BASE}${path}?${query}`;

    // Save to documentDirectory so it persists (not wiped by OS cache cleanup)
    const localUri = FileSystem.documentDirectory + filename;
    const dl = await FileSystem.downloadAsync(url, localUri, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (dl.status !== 200) {
      Alert.alert('Export Failed', 'Server returned an error.');
      return false;
    }

    // Show confirmation — offer Share only as an optional action
    Alert.alert(
      '✅ Downloaded',
      `${filename} saved successfully.`,
      [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Share / Open',
          onPress: async () => {
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(dl.uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                UTI: 'com.microsoft.excel.xlsx',
              });
            }
          },
        },
      ]
    );
    return true;
  } catch (err) {
    console.error('[exportFile]', err);
    Alert.alert('Export Failed', err.message || 'Unknown error');
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
