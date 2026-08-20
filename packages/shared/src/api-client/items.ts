import type { HttpClient } from './http';
import type { Item } from '../types';

export type CreateItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateItemInput = Partial<CreateItemInput>;

export interface StockLevel {
  itemId: string;
  qty: number;
}

export function createItemsClient(http: HttpClient) {
  return {
    list: () => http.get<Item[]>('/items'),
    create: (input: CreateItemInput) => http.post<Item>('/items', input),
    update: (id: string, input: UpdateItemInput) => http.patch<Item>(`/items/${id}`, input),
    remove: (id: string) => http.delete<void>(`/items/${id}`),
    stock: () => http.get<StockLevel[]>('/items/stock'),
    // The list omits the (large) TDS blob; fetch it on demand when viewing.
    getTds: (id: string) =>
      http.get<{ tdsAttachment: string | null; tdsAttachmentName: string | null }>(`/items/${id}/tds`),
  };
}
