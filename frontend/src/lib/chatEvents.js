import { DeviceEventEmitter } from 'react-native';

const CHAT_UNREAD_REFRESH_EVENT = 'chat:unread-refresh';

export function emitChatUnreadRefresh() {
  DeviceEventEmitter.emit(CHAT_UNREAD_REFRESH_EVENT);
}

export function subscribeChatUnreadRefresh(callback) {
  const sub = DeviceEventEmitter.addListener(CHAT_UNREAD_REFRESH_EVENT, callback);
  return () => sub.remove();
}
