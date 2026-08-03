import type { Party as PrismaParty, Item as PrismaItem, SalesPerson as PrismaSalesPerson } from '@prisma/client';
import type { Party, Item, SalesPerson, PartyType, ItemUnit } from '@surani/shared';

export function toPartyDTO(p: PrismaParty): Party {
  return {
    id: p.id,
    name: p.name,
    type: p.type as PartyType,
    salesPersonId: p.salesPersonId,
    phone: p.phone,
    email: p.email,
    gst: p.gst,
    opening: Number(p.opening),
    creditDays: p.creditDays,
    defaultFreight: Number(p.defaultFreight),
    address: p.address,
    locationUrl: p.locationUrl,
    vehicle: p.vehicle,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toItemDTO(i: PrismaItem): Item {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit as ItemUnit,
    code: i.code,
    gstPct: Number(i.gstPct),
    rate: Number(i.rate),
    opening: Number(i.opening),
    reorder: Number(i.reorder),
    rateDate: i.rateDate ? i.rateDate.toISOString().slice(0, 10) : null,
    tdsAttachment: i.tdsAttachment ?? null,
    tdsAttachmentName: i.tdsAttachmentName ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function toSalesPersonDTO(s: PrismaSalesPerson): SalesPerson {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    createdAt: s.createdAt.toISOString(),
  };
}
