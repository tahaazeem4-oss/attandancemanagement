import { Alert } from 'react-native';

export function showDestructiveConfirm({ title, message, confirmText = 'Delete', onConfirm }) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
