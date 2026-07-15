import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WHATSAPP_TEMPLATES, type WhatsappTemplateKey } from '@surani/shared';
import { api } from '../lib/apiClient';

export function WhatsappScreen() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string>('');

  useEffect(() => {
    api.whatsapp.list().then((rows) => {
      const next: Record<string, string> = {};
      rows.forEach((r) => (next[r.key] = r.template));
      setDrafts(next);
    });
  }, []);

  async function onSave(key: WhatsappTemplateKey) {
    const row = await api.whatsapp.update(key, drafts[key]);
    setDrafts((d) => ({ ...d, [key]: row.template }));
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? '' : k)), 1500);
  }
  async function onReset(key: WhatsappTemplateKey) {
    const row = await api.whatsapp.reset(key);
    setDrafts((d) => ({ ...d, [key]: row.template }));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
      <Text style={styles.intro}>
        Customize the wording of WhatsApp messages. Placeholder tags like {'{partyName}'} are filled in
        automatically when a message is sent.
      </Text>
      {WHATSAPP_TEMPLATES.map((t) => (
        <View key={t.key} style={styles.card}>
          <Text style={styles.cardTitle}>{t.label}</Text>
          <Text style={styles.cardSub}>{t.description}</Text>
          <TextInput
            style={styles.textarea}
            multiline
            value={drafts[t.key] ?? ''}
            onChangeText={(v) => setDrafts((d) => ({ ...d, [t.key]: v }))}
          />
          <Text style={styles.tags}>{t.placeholders.map((p) => p.token).join('  ')}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.save]} onPress={() => onSave(t.key)}>
              <Text style={styles.btnText}>{savedKey === t.key ? 'Saved ✓' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.reset]} onPress={() => onReset(t.key)}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  intro: { color: '#475569', fontSize: 12, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 2, marginBottom: 8 },
  textarea: { backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, minHeight: 140, textAlignVertical: 'top', fontSize: 13 },
  tags: { color: '#94a3b8', fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center' },
  save: { backgroundColor: '#0d9488' },
  reset: { backgroundColor: '#e2e8f0' },
  btnText: { color: '#fff', fontWeight: '700' },
  resetText: { color: '#334155', fontWeight: '700' },
});
