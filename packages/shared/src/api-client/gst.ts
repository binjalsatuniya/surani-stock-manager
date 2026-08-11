import type { HttpClient } from './http';

/** Registered taxpayer details, fetched by the server from the GST lookup provider. */
export interface GstLookupResult {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  /** "Active" / "Cancelled" etc. — worth checking before claiming input credit. */
  status: string | null;
  registrationDate: string | null;
  businessType: string | null;
}

export function createGstClient(http: HttpClient) {
  return {
    /** Whether a lookup key is configured on the server; the UI hides the button when not. */
    status: () => http.get<{ configured: boolean }>('/gst/status'),
    lookup: (gstin: string) => http.get<GstLookupResult>(`/gst/lookup/${encodeURIComponent(gstin)}`),
  };
}
