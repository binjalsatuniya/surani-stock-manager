import { fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildWhatsappLink, type Party, type PartyLedgerEntry } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const balStr = (b: number) => (b >= 0 ? `₹${fmtAmount(b)} Dr` : `₹${fmtAmount(Math.abs(b))} Cr`);

export function PartyLedgerScreen() {
  const route = useRoute<any>();
  const partyId: string | undefined = route.params?.partyId;
  const can = usePermission();
  const { fill } = useWhatsappTemplates();
  const [party, setParty] = useState<Party | null>(null);
  const [entries, setEntries] = useState<PartyLedgerEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!partyId) return;
    api.parties
      .list()
      .then((all) => setParty(all.find((p) => p.id === partyId) ?? null))
      .catch(() => {});
    api.ledger.party(partyId).then(setEntries).catch(() => {});
  }, [partyId]);

  const opening = Number(party?.opening ?? 0);
  const totalDr = entries.reduce((s, e) => s + e.dr, 0);
  const totalCr = entries.reduce((s, e) => s + e.cr, 0);
  const closing = opening + totalDr - totalCr; // + = they owe you, − = you owe them

  // Pre-compute a running balance for each row (starting from the opening balance).
  let running = opening;
  const rows = entries.map((e) => {
    running += e.dr - e.cr;
    return { ...e, balance: running };
  });

  function onShare() {
    if (!party) return;
    const lines = rows.map((e) => {
      const amt = e.dr > 0 ? `+₹${fmtAmount(e.dr)}` : `-₹${fmtAmount(e.cr)}`;
      return `${fmtDate(e.date)} — ${e.description}\n   ${amt} → ${balStr(e.balance)}`;
    });
    const message = fill('ledgerStatement', {
      partyName: party.name,
      date: fmtDate(new Date().toISOString()),
      lines: lines.length ? lines.join('\n\n') : 'No transactions yet.',
      closingBalance: balStr(closing),
    });
    if (!message) return;
    Linking.openURL(buildWhatsappLink(party.phone, message)).catch(() => setError('Could not open WhatsApp on this phone.'));
  }

  async function onExportPdf() {
    const body = rows
      .map(
        (e) =>
          `<tr><td>${fmtDate(e.date)}</td><td>${e.description}</td><td style="text-align:right">${
            e.dr ? fmtAmount(e.dr) : ''
          }</td><td style="text-align:right">${e.cr ? fmtAmount(e.cr) : ''}</td><td style="text-align:right">${balStr(
            e.balance
          )}</td></tr>`
      )
      .join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0b1220}
      h1{font-size:18px;margin:0 0 4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #e2e8f0;padding:7px 6px;text-align:left}
      th{background:#f5f7fb}
      tfoot td{font-weight:700}
    </style></head><body>
      <h1>SURANI AND SONS — Party Ledger</h1>
      <div class="sub">${party?.name || 'Party'} &middot; Generated ${fmtDate(new Date().toISOString())}</div>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
        <tbody>
          <tr><td>—</td><td style="font-style:italic">Opening balance</td><td></td><td></td><td style="text-align:right">${balStr(
            opening
          )}</td></tr>
          ${body}
          <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing balance</td><td></td><td></td><td style="text-align:right">${balStr(
            closing
          )}</td></tr>
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td style="text-align:right">${totalDr.toFixed(
          2
        )}</td><td style="text-align:right">${fmtAmount(totalCr)}</td><td style="text-align:right">${balStr(closing)}</td></tr></tfoot>
      </table>
    </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ledger — {party?.name || '…'}</Text>

        {/* Outstanding summary */}
        <View
          style={[
            styles.summary,
            closing > 0 ? styles.summaryDr : closing < 0 ? styles.summaryCr : styles.summaryNil,
          ]}
        >
          <Text style={styles.summaryLabel}>
            {closing > 0
              ? 'AMOUNT RECEIVABLE (THEY OWE YOU)'
              : closing < 0
              ? 'AMOUNT PAYABLE (YOU OWE THEM)'
              : 'SETTLED — NOTHING PENDING'}
          </Text>
          <Text style={[styles.summaryVal, closing > 0 ? styles.drText : closing < 0 ? styles.crText : styles.nilText]}>
            {balStr(closing)}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.row}>
          {can('send_whatsapp') && !!party?.phone && (
            <TouchableOpacity style={[styles.btnWa, styles.col]} onPress={onShare}>
              <Text style={styles.btnText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.btn, styles.col]} onPress={onExportPdf}>
            <Text style={styles.btnText}>Export PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.entryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.opening}>Opening balance</Text>
          </View>
          <Text style={styles.balance}>{balStr(opening)}</Text>
        </View>

        {rows.map((e, idx) => (
          <View key={idx} style={styles.entryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.desc}>{e.description}</Text>
              <Text style={styles.meta}>{fmtDate(e.date)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={e.dr ? styles.dr : styles.cr}>
                {e.dr ? `+₹${fmtAmount(e.dr)}` : `−₹${fmtAmount(e.cr)}`}
              </Text>
              <Text style={styles.balance}>{balStr(e.balance)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.closingRow}>
          <Text style={styles.closingLabel}>Closing balance</Text>
          <Text style={[styles.closingVal, closing > 0 ? styles.drText : closing < 0 ? styles.crText : styles.nilText]}>
            {balStr(closing)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.meta}>Total</Text>
          <Text style={styles.meta}>
            Dr {fmtAmount(totalDr)} · Cr {fmtAmount(totalCr)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },

  summary: { marginTop: 10, borderWidth: 1, borderRadius: 10, padding: 14 },
  summaryDr: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  summaryCr: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  summaryNil: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  summaryLabel: { fontSize: 10, letterSpacing: 0.6, color: '#64748b', fontWeight: '700' },
  summaryVal: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  drText: { color: '#15803d' },
  crText: { color: '#dc2626' },
  nilText: { color: '#0b1220' },

  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  opening: { fontStyle: 'italic', color: '#64748b', fontSize: 13 },
  desc: { fontSize: 13, color: '#0b1220', fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  dr: { color: '#15803d', fontWeight: '700', fontSize: 12.5 },
  cr: { color: '#dc2626', fontWeight: '700', fontSize: 12.5 },
  balance: { color: '#0b1220', fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  closingRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 10 },
  closingLabel: { fontWeight: '700', color: '#0b1220', fontSize: 13 },
  closingVal: { fontWeight: '800', fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },

  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnWa: { backgroundColor: '#25d366', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
});
