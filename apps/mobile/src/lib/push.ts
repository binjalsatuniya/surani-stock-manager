import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './apiClient';

// Show a heads-up banner even when the app is in the foreground (otherwise a notification that
// arrives while the user is in the app is delivered silently).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastToken: string | null = null;

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

/**
 * Ask permission, get this device's native (FCM) push token, and register it with the server for
 * the signed-in user. Best-effort: any failure (emulator, permission denied, offline) is swallowed
 * so it never blocks login. Safe to call on every login — the server upserts on the token.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // emulators can't get a real push token
    await ensureAndroidChannel();

    // iOS push is not configured yet: it needs a GoogleService-Info.plist + an APNs key in Firebase
    // and the "Push Notifications" capability (aps-environment entitlement). Asking iOS for a native
    // push token before that entitlement exists can TERMINATE the app right after launch — which
    // looks like the app opening and immediately closing. So skip iOS push until it is set up;
    // Android is unaffected. Remove this guard once the iOS Firebase/APNs setup is done.
    if (Platform.OS === 'ios') return;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const token = (await Notifications.getDevicePushTokenAsync()).data as string;
    if (!token) return;
    lastToken = token;
    // Only Android reaches here (iOS returns above until push is configured).
    await api.push.register(token, 'android');
  } catch (err) {
    console.warn('[push] register failed:', err);
  }
}

/** Drop this device's token on full sign-out so a logged-out phone stops receiving pushes. */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS === 'ios') return; // see registerForPush — iOS push isn't set up yet
  try {
    const token = lastToken ?? ((await Notifications.getDevicePushTokenAsync()).data as string);
    if (token) await api.push.unregister(token);
  } catch (err) {
    console.warn('[push] unregister failed:', err);
  } finally {
    lastToken = null;
  }
}
