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
    // Follow-up tab: companies scoped to the caller (Super Admin sees all; a linked sales person
    // sees only theirs), and setting the follow-up days on one company.
    followupList: () => http.get<Party[]>('/parties/followup'),
    setFollowUp: (id: string, followUpDays: number | null) =>
      http.patch<Party>(`/parties/${id}/followup`, { followUpDays }),
  };
}
