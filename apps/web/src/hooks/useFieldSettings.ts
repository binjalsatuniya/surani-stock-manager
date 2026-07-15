import { useEffect, useState } from 'react';
import { effectiveFieldSettings, type FieldSettingKey, type FieldSettingsMap } from '@surani/shared';
import { api } from '../lib/apiClient';

/** Reads the superadmin's field rules. `required(key)` tells a form whether a field must be filled. */
export function useFieldSettings() {
  const [settings, setSettings] = useState<FieldSettingsMap>(() => effectiveFieldSettings({}));

  useEffect(() => {
    api.fieldSettings
      .get()
      .then(setSettings)
      .catch(() => {});
  }, []);

  return {
    settings,
    required: (key: FieldSettingKey) => !!settings[key],
  };
}
