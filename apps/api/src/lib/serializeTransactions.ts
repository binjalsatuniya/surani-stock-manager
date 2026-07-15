import type {
  Inward as PrismaInward,
  Outward as PrismaOutward,
  Payment as PrismaPayment,
  PaymentAllocation as PrismaPaymentAllocation,
  FreightEntry as PrismaFreightEntry,
  HandlingEntry as PrismaHandlingEntry,
} from '@prisma/client';
import type {
  Inward,
  Outward,
  Payment,
  FreightEntry,
  HandlingEntry,
  DeliveryType,
  PayStatus,
  FulfilStatus,
  PaymentDirection,
  PaymentMode,
  LedgerSourceKind,
} from '@surani/shared';

const d = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);

export function toInwardDTO(i: PrismaInward): Inward {
  return {
    id: i.id,
    date: d(i.date)!,
    financialYear: i.financialYear ?? '',
    status: (i.status as 'pending' | 'received') ?? 'received',
    partyId: i.partyId,
    itemId: i.itemId,
    qty: Number(i.qty),
    rate: Number(i.rate),
    gstPct: Number(i.gstPct),
    gst: Number(i.gst),
    handlingRate: Number(i.handlingRate),
    handling: Number(i.handling),
    handlingAgentId: i.handlingAgentId,
    amount: Number(i.amount),
    invNo: i.invNo,
    invDate: d(i.invDate),
    deliveryType: i.deliveryType as DeliveryType | null,
    transporterId: i.transporterId,
    freightRate: Number(i.freightRate),
    freight: Number(i.freight),
    vehicle: i.vehicle,
    note: i.note,
    createdBy: i.createdById,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function toOutwardDTO(o: PrismaOutward): Outward {
  return {
    id: o.id,
    date: d(o.date)!,
    financialYear: o.financialYear ?? '',
    partyId: o.partyId,
    itemId: o.itemId,
    qty: Number(o.qty),
    rate: Number(o.rate),
    freightRate: Number(o.freightRate),
    freight: Number(o.freight),
    gstPct: Number(o.gstPct),
    gst: Number(o.gst),
    handlingRate: Number(o.handlingRate),
    handling: Number(o.handling),
    handlingAgentId: o.handlingAgentId,
    amount: Number(o.amount),
    payStatus: o.payStatus as PayStatus,
    creditDays: o.creditDays,
    invNo: o.invNo,
    invDate: d(o.invDate),
    deliveryType: o.deliveryType as DeliveryType | null,
    transporterId: o.transporterId,
    vehicle: o.vehicle,
    fulfil: o.fulfil as FulfilStatus,
    prevFulfil: o.prevFulfil as FulfilStatus | null,
    dispatchedAt: d(o.dispatchedAt),
    deliveredAt: d(o.deliveredAt),
    cancelledAt: d(o.cancelledAt),
    cancelledBy: o.cancelledById,
    note: o.note,
    createdBy: o.createdById,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toPaymentAllocationDTO(a: PrismaPaymentAllocation) {
  return { id: a.id, paymentId: a.paymentId, outwardId: a.outwardId, amount: Number(a.amount) };
}

export function toPaymentDTO(p: PrismaPayment & { paymentAllocations?: PrismaPaymentAllocation[] }): Payment {
  return {
    id: p.id,
    date: d(p.date)!,
    financialYear: p.financialYear ?? '',
    partyId: p.partyId,
    dir: p.dir as PaymentDirection,
    amount: Number(p.amount),
    mode: p.mode as PaymentMode,
    allocations: (p.paymentAllocations ?? []).map(toPaymentAllocationDTO),
    note: p.note,
    createdBy: p.createdById,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toFreightEntryDTO(f: PrismaFreightEntry): FreightEntry {
  return {
    id: f.id,
    date: d(f.date)!,
    transporterId: f.transporterId,
    partyId: f.partyId,
    itemId: f.itemId,
    qty: Number(f.qty),
    freight: Number(f.freight),
    freightRate: Number(f.freightRate),
    inwardId: f.inwardId,
    outwardId: f.outwardId,
    invNo: f.invNo,
    note: f.note,
    createdAt: f.createdAt.toISOString(),
  };
}

export function toHandlingEntryDTO(h: PrismaHandlingEntry): HandlingEntry {
  return {
    id: h.id,
    date: d(h.date)!,
    handlingAgentId: h.handlingAgentId,
    partyId: h.partyId,
    itemId: h.itemId,
    qty: Number(h.qty),
    amount: Number(h.amount),
    handlingRate: Number(h.handlingRate),
    sourceId: h.sourceId,
    sourceKind: h.sourceKind as LedgerSourceKind,
    invNo: h.invNo,
    note: h.note,
    createdAt: h.createdAt.toISOString(),
  };
}
