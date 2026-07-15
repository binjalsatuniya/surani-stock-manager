import type { HttpClient } from './http';
import type { FieldSettingsMap } from '../field-settings';

export function createFieldSettingsClient(http: HttpClient) {
  return {
    get: () => http.get<FieldSettingsMap>('/field-settings'),
    set: (key: string, required: boolean) => http.patch<FieldSettingsMap>(`/field-settings/${key}`, { required }),
  };
}
