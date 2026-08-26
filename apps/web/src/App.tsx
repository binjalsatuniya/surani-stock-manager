import { Navigate, Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@surani/shared';
import { useAuth } from './context/AuthContext';
import { usePermission } from './hooks/usePermission';
import { useEnterKeyNav } from './hooks/useEnterKeyNav';
import { useDesktopNotifications } from './hooks/useDesktopNotifications';
import { Layout } from './components/Layout';
import { LoginPage } from './routes/LoginPage';
import { DashboardPage } from './routes/DashboardPage';
import { PartiesPage } from './routes/PartiesPage';
import { PartyLedgerPage } from './routes/PartyLedgerPage';
import { ItemLedgerPage } from './routes/ItemLedgerPage';
import { ImportScansPage } from './routes/ImportScansPage';
import { RolesPage } from './routes/RolesPage';
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
import { PdfLayoutPage } from './routes/PdfLayoutPage';
import { ExpensesPage } from './routes/ExpensesPage';
import { LoginLocationsPage } from './routes/LoginLocationsPage';
import { ShortcutsPage } from './routes/ShortcutsPage';
import { FinancialYearsPage } from './routes/FinancialYearsPage';
import { FinancialYearProvider } from './context/FinancialYearContext';
import { DialogProvider } from './components/Dialogs';

// The landing page ("/") is the Dashboard for users who can see it; otherwise send them to the
// first section they DO have access to (so a dispatch-only user lands on the Order Book instead of
// a Dashboard that just spins "Loading…"). If they have nothing, show a friendly message.
const LANDING_PRIORITY: [string, PermissionKey][] = [
  ['/orderbook', 'view_orderbook'],
  ['/inward', 'view_inward'],
  ['/outward', 'view_outward'],
  ['/payments', 'view_payments'],
  ['/parties', 'view_parties'],
  ['/items', 'view_items'],
  ['/live-stock', 'view_live_stock'],
  ['/expenses', 'view_expenses'],
  ['/users', 'manage_users'],
];

function Home() {
  const can = usePermission();
  if (can('view_dashboard')) return <DashboardPage />;
  const first = LANDING_PRIORITY.find(([, perm]) => can(perm));
  if (first) return <Navigate to={first[0]} replace />;
  return (
    <div className="card" style={{ margin: 24 }}>
      You don’t have access to any section yet. Please ask your administrator to grant permissions.
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  useEnterKeyNav();
  useDesktopNotifications(user?.id);

  if (loading) return null;
  if (!user) return <LoginPage />;

  return (
    <DialogProvider>
    <FinancialYearProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/inward" element={<InwardPage />} />
        <Route path="/outward" element={<OutwardPage />} />
        <Route path="/orderbook" element={<OrderBookPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/parties" element={<PartiesPage />} />
        <Route path="/parties/:id/ledger" element={<PartyLedgerPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/import-scans" element={<ImportScansPage />} />
        <Route path="/items/:id/ledger" element={<ItemLedgerPage />} />
        <Route path="/live-stock" element={<LiveStockPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/whatsapp-messages" element={<WhatsappSettingsPage />} />
        <Route path="/field-rules" element={<FieldRulesPage />} />
        <Route path="/pdf-layout" element={<PdfLayoutPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/login-locations" element={<LoginLocationsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/shortcuts" element={<ShortcutsPage />} />
        <Route path="/financial-years-settings" element={<FinancialYearsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </FinancialYearProvider>
    </DialogProvider>
  );
}
