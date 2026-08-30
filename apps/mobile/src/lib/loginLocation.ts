import * as Location from 'expo-location';

export interface Coords {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export const NO_COORDS: Coords = { latitude: null, longitude: null, accuracy: null };

// The message shown when location can't be obtained — mirrors the website's wording.
export const LOCATION_MESSAGE =
  'Location is required to sign in. Please turn on location/GPS and allow Surani and Sons to access your location, then try again.';

export function isLocationError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('LOCATION_');
}

/**
 * Requests the GPS location for a sign-in, the same way the website does. Throws a LOCATION_* error
 * (blocking the login) if permission is denied, location services are off, or no fix can be read —
 * so the primary Super Admin's Login Locations list stays reliable.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), ms)),
  ]);
}

export async function getLoginCoordsOrThrow(): Promise<Coords> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error('LOCATION_DENIED');

  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!servicesOn) throw new Error('LOCATION_DISABLED');

  // A cached last-known fix is instant — use it when it's recent enough, so signing in isn't blocked
  // waiting for a fresh GPS lock (which can take many seconds, especially indoors or on a first fix).
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  if (last) {
    return { latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy };
  }

  // Otherwise take a fresh fix, but cap the wait so login can never hang on GPS.
  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      10000
    );
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch {
    throw new Error('LOCATION_UNAVAILABLE');
  }
}

/** Best-effort variant for quick biometric unlock: records a fix if we can get one, else null. */
export async function getLoginCoordsBestEffort(): Promise<Coords> {
  try {
    return await getLoginCoordsOrThrow();
  } catch {
    return NO_COORDS;
  }
}
