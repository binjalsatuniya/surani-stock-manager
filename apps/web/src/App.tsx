import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './routes/LoginPage';
import { DashboardPage } from './routes/DashboardPage';
import { PartiesPage } from './routes/PartiesPage';
import { PartyLedgerPage } from './routes/PartyLedgerPage';
import { ItemsPage } from './routes/ItemsPage';
import { LiveStockPage } from './routes/LiveStockPage';
import { UsersPage } from './routes/UsersPage';
import { InwardPage } from './routes/InwardPage';
import { OutwardPage } from './routes/OutwardPage';
import { PaymentsPage } from './routes/PaymentsPage';
import { OrderBookPage } from './routes/OrderBookPage';
import { ApprovalsPage } from './routes/ApprovalsPage';
import { AuditLogPage } from './routes/AuditLogPage';
import { BackupPage } from './routes/BackupPage';
import { AccountPage } from './routes/AccountPage';
import { WhatsappSettingsPage } from './routes/WhatsappSettingsPage';
import { FieldRulesPage } from './routes/FieldRulesPage';
import { ExpensesPage } from './routes/ExpensesPage';
import { LoginLocationsPage } from './routes/LoginLocationsPage';
import { FinancialYearProvider } from './context/FinancialYearContext';

export function App() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginPage />;

  return (
    <FinancialYearProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/inward" element={<InwardPage />} />
        <Route path="/outward" element={<OutwardPage />} />
        <Route path="/orderbook" element={<OrderBookPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/parties" element={<PartiesPage />} />
        <Route path="/parties/:id/ledger" element={<PartyLedgerPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/live-stock" element={<LiveStockPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/whatsapp-messages" element={<WhatsappSettingsPage />} />
        <Route path="/field-rules" element={<FieldRulesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/login-locations" element={<LoginLocationsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </FinancialYearProvider>
  );
}
