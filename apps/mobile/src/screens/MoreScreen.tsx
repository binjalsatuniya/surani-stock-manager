import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { PermissionKey } from '@surani/shared';
import { usePermission } from '../hooks/usePermission';

const ITEMS: { route: string; label: string; perm?: PermissionKey }[] = [
  { route: 'Inward', label: 'Inward', perm: 'view_inward' },
  { route: 'Outward', label: 'Outward', perm: 'view_outward' },
  { route: 'Payments', label: 'Payment Due', perm: 'view_payments' },
  { route: 'Items', label: 'Items', perm: 'view_items' },
  { route: 'LiveStock', label: 'Live Stock & Rate', perm: 'view_items' },
  { route: 'Users', label: 'Users', perm: 'manage_users' },
  { route: 'Approvals', label: 'Approvals', perm: 'view_approvals' },
  { route: 'AuditLog', label: 'Audit Log', perm: 'view_audit_log' },
  { route: 'Whatsapp', label: 'WhatsApp Messages', perm: 'send_whatsapp' },
  { route: 'Account', label: 'My Account' },
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const can = usePermission();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
      {ITEMS.filter((it) => !it.perm || can(it.perm)).map((it) => (
        <TouchableOpacity key={it.route} style={styles.row} onPress={() => navigation.navigate(it.route)}>
          <Text style={styles.rowText}>{it.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowText: { fontWeight: '600', fontSize: 15, color: '#1e293b' },
  chevron: { fontSize: 22, color: '#94a3b8' },
});
