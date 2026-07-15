import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { AuditLogEntry } from '@surani/shared';
import { api } from '../lib/apiClient';

export function AuditLogScreen() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.auditLog.list().then(setRows);
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {r.action} · {r.target}
            </Text>
            <Text style={styles.cardSub}>
              {r.label || ''} — {r.actorName} · {new Date(r.timestamp).toLocaleString('en-IN')}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No audit entries.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 13 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
