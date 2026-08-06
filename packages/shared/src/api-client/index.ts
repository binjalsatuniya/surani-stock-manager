import { createHttpClient, type HttpClientOptions } from './http';
import { createAuthClient } from './auth';
import { createUsersClient } from './users';
import { createPartiesClient } from './parties';
import { createItemsClient } from './items';
import { createSalesPersonsClient } from './sales-persons';
import { createInwardClient } from './inward';
import { createOutwardClient } from './outward';
import { createPaymentsClient } from './payments';
import { createLedgerClient } from './ledger';
import { createDashboardClient } from './dashboard';
import { createOrdersClient, createOrderbookClient } from './orderbook';
import { createApprovalsClient } from './approvals';
import { createAuditLogClient } from './auditlog';
import { createBackupClient } from './backup';
import { createWhatsappClient } from './whatsapp';
import { createFinancialYearsClient } from './financial-years';
import { createFieldSettingsClient } from './field-settings';
import { createExpensesClient } from './expenses';
import { createLoginLocationsClient } from './login-locations';
import { createResetClient } from './reset';
import { createRecoveryClient } from './recovery';
import { createPdfSettingsClient } from './pdf-settings';
import { createPushClient } from './push';

export * from './http';
export * from './reset';
export * from './items';
export * from './parties';
export * from './ledger';
export * from './dashboard';
export * from './approvals';
export * from './auditlog';
export * from './whatsapp';
export * from './expenses';
export * from './login-locations';

export function createApiClient(opts: HttpClientOptions) {
  const http = createHttpClient(opts);
  const rawAuth = createAuthClient(http);

  // Every auth method that returns a fresh accessToken must set it immediately — don't rely on
  // the 401-retry-refresh path to pick it up eventually. On web this was silently masked because
  // the httpOnly cookie let a stray 401 self-heal; on mobile (no cookie jar) there's no such
  // safety net, so the very first authenticated call after login/unlock would 401 for real.
  const auth: typeof rawAuth = {
    ...rawAuth,
    login: async (...args) => {
      const res = await rawAuth.login(...args);
      opts.setAccessToken(res.accessToken);
      return res;
    },
    refresh: async (...args) => {
      const res = await rawAuth.refresh(...args);
      opts.setAccessToken(res.accessToken);
      return res;
    },
    quickUnlockPin: async (...args) => {
      const res = await rawAuth.quickUnlockPin(...args);
      opts.setAccessToken(res.accessToken);
      return res;
    },
    quickUnlockBiometric: async (...args) => {
      const res = await rawAuth.quickUnlockBiometric(...args);
      opts.setAccessToken(res.accessToken);
      return res;
    },
  };

  return {
    http,
    auth,
    users: createUsersClient(http),
    parties: createPartiesClient(http),
    items: createItemsClient(http),
    salesPersons: createSalesPersonsClient(http),
    inward: createInwardClient(http),
    outward: createOutwardClient(http),
    payments: createPaymentsClient(http),
    ledger: createLedgerClient(http),
    dashboard: createDashboardClient(http),
    orders: createOrdersClient(http),
    orderbook: createOrderbookClient(http),
    approvals: createApprovalsClient(http),
    auditLog: createAuditLogClient(http),
    backup: createBackupClient(http),
    whatsapp: createWhatsappClient(http),
    financialYears: createFinancialYearsClient(http),
    fieldSettings: createFieldSettingsClient(http),
    expenses: createExpensesClient(http),
    loginLocations: createLoginLocationsClient(http),
    reset: createResetClient(http),
    recovery: createRecoveryClient(http),
    pdfSettings: createPdfSettingsClient(http),
    push: createPushClient(http),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
