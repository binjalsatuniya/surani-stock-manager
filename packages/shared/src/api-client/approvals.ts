import type { HttpClient } from './http';
import type { ApprovalKind, ApprovalStatus, ApprovalTarget } from '../types';

export interface ApprovalRequestDTO {
  id: string;
  kind: ApprovalKind;
  target: ApprovalTarget;
  targetId: string;
  payload: Record<string, unknown>;
  label: string;
  status: ApprovalStatus;
  requestedBy: string;
  resolvedBy: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

export function createApprovalsClient(http: HttpClient) {
  return {
    list: (status?: ApprovalStatus) =>
      http.get<ApprovalRequestDTO[]>(`/approvals${status ? `?status=${status}` : ''}`),
    approve: (id: string) => http.post<{ ok: true }>(`/approvals/${id}/approve`),
    reject: (id: string) => http.post<{ ok: true }>(`/approvals/${id}/reject`),
  };
}
