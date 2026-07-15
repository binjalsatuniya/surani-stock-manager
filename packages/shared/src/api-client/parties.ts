import type { HttpClient } from './http';
import type { Party, PartyType } from '../types';

export type CreatePartyInput = Omit<Party, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdatePartyInput = Partial<CreatePartyInput>;

export function createPartiesClient(http: HttpClient) {
  return {
    list: (type?: PartyType) => http.get<Party[]>(`/parties${type ? `?type=${type}` : ''}`),
    create: (input: CreatePartyInput) => http.post<Party>('/parties', input),
    update: (id: string, input: UpdatePartyInput) => http.patch<Party>(`/parties/${id}`, input),
    remove: (id: string) => http.delete<void>(`/parties/${id}`),
  };
}
