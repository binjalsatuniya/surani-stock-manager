import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/routes';
import { usersRouter } from './modules/users/routes';
import { partiesRouter } from './modules/parties/routes';
import { itemsRouter } from './modules/items/routes';
import { salesPersonsRouter } from './modules/sales-persons/routes';
import { inwardRouter } from './modules/inward/routes';
import { outwardRouter } from './modules/outward/routes';
import { paymentsRouter } from './modules/payments/routes';
import { ledgerRouter } from './modules/ledger/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { ordersRouter, orderbookRouter } from './modules/orderbook/routes';
import { approvalsRouter } from './modules/approvals/routes';
import { auditLogRouter } from './modules/auditlog/routes';
import { backupRouter } from './modules/backup/routes';
import { whatsappRouter } from './modules/whatsapp/routes';
import { financialYearsRouter } from './modules/financial-years/routes';
import { fieldSettingsRouter } from './modules/field-settings/routes';
import { expensesRouter } from './modules/expenses/routes';
import { loginLocationsRouter } from './modules/login-locations/routes';
import { resetRouter } from './modules/reset/routes';
import { recoveryRouter } from './modules/recovery/routes';

export const app = express();

app.use(helmet());
// Native Expo Go / mobile requests carry no Origin header and aren't subject to CORS at all —
// this only matters for browser-based clients: the web app and `expo start --web` during dev.
const allowedOrigins = new Set([env.CORS_ORIGIN, 'http://localhost:8081']);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allowed: native/mobile (no Origin), the configured web origin, expo web, any localhost
      // port, and the packaged desktop app (Electron loads from file:// → Origin header is "null").
      if (
        !origin ||
        origin === 'null' ||
        allowedOrigins.has(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
// Larger limit so expense invoice attachments (base64 data URLs) fit in the JSON body.
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/parties', partiesRouter);
app.use('/items', itemsRouter);
app.use('/sales-persons', salesPersonsRouter);
app.use('/inward', inwardRouter);
app.use('/outward', outwardRouter);
app.use('/payments', paymentsRouter);
app.use('/ledger', ledgerRouter);
app.use('/dashboard', dashboardRouter);
app.use('/orders', ordersRouter);
app.use('/orderbook', orderbookRouter);
app.use('/approvals', approvalsRouter);
app.use('/audit-log', auditLogRouter);
app.use('/backup', backupRouter);
app.use('/whatsapp-templates', whatsappRouter);
app.use('/financial-years', financialYearsRouter);
app.use('/field-settings', fieldSettingsRouter);
app.use('/expenses', expensesRouter);
app.use('/login-locations', loginLocationsRouter);
app.use('/reset', resetRouter);
app.use('/recovery', recoveryRouter);

app.use(errorHandler);
