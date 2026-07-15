import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DashboardKpis } from '@surani/shared';
import { api } from '../lib/apiClient';

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    api.dashboard.kpis().then(setKpis);
  }, []);

  if (!kpis) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.grid}>
      <Kpi label="Total items" value={kpis.totalItems} />
      <Kpi label="Total receivable" value={kpis.receivable.toFixed(2)} color="#10b981" />
      <Kpi label="Total payable" value={kpis.payable.toFixed(2)} color="#ef4444" />
      <Kpi label="Net position" value={kpis.netPosition.toFixed(2)} color={kpis.netPosition >= 0 ? '#10b981' : '#ef4444'} />
      <Kpi label="Low stock items" value={kpis.lowStockCount} />
      <Kpi label="Pending orders" value={kpis.pendingOrders} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiLabel: { color: '#94a3b8', fontSize: 12 },
  kpiValue: { fontSize: 22, fontWeight: '700', marginTop: 6, color: '#0b1220' },
});
