import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ApprovalRequestDTO } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export function ApprovalsScreen() {
  const { user } = useAuth();
  const canResolve = user?.role === 'superadmin';
  const [rows, setRows] = useState<ApprovalRequestDTO[]>([]);

  async function reload() {
    setRows(await api.approvals.list('pending'));
  }

  useEffect(() => {
    reload();
  }, []);

  async function onApprove(id: string) {
    await api.approvals.approve(id);
    reload();
  }
  async function onReject(id: string) {
    await api.approvals.reject(id);
    reload();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{r.label}</Text>
            <Text style={styles.cardSub}>
              {r.kind} · {r.target}
            </Text>
            {canResolve && (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => onApprove(r.id)}>
                  <Text style={styles.btnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => onReject(r.id)}>
                  <Text style={styles.btnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No pending approvals.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approve: { backgroundColor: '#0d9488' },
  reject: { backgroundColor: '#dc2626' },
  btnText: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
