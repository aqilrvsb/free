export interface SofiaRegistration {
  aor?: string;
  user?: string;
  realm?: string;
  contact?: string;
  network_ip?: string;
  network_port?: string;
  status?: string;
  rpid?: string;
  agent?: string;
  ping_status?: string;
  ping_time?: string;
  host?: string;
}

export interface SofiaProfile {
  status?: { type?: string; state?: string };
  info?: Record<string, unknown>;
  registrations?: SofiaRegistration[] | { registrations?: SofiaRegistration[] };
  extensionPresence?: ExtensionPresence[];
  activeDomain?: string | null;
  extensionStats?: {
    total: number;
    online: number;
    offline: number;
  };
  extensionStatsOverall?: {
    total: number;
    online: number;
    offline: number;
  };
}

export interface ExtensionPresence {
  id: string;
  tenantId: string;
  tenantDomain?: string | null;
  displayName?: string | null;
  online: boolean;
  contact?: string | null;
  network_ip?: string | null;
  network_port?: string | null;
  agent?: string | null;
  status?: string | null;
  ping_status?: string | null;
  ping_time?: string | null;
}

export interface SofiaRegistrationsPayload {
  profiles?: Record<string, SofiaProfile>;
}

export interface RegistrationSnapshot {
  profile: string;
  domain?: string | null;
  profileData?: SofiaProfile;
  registrations: SofiaRegistration[];
  raw: string;
  generatedAt: number;
}

export interface RegistrationEventMessage {
  action: 'register' | 'unregister' | 'expire' | 'reregister' | string;
  profile: string;
  username: string;
  domain?: string | null;
  contact?: string;
  networkIp?: string;
  networkPort?: string;
  userAgent?: string;
  expires?: string;
  timestamp: number;
  eventId?: string;
}

export function extractRegistrations(profile?: SofiaProfile): SofiaRegistration[] {
  if (!profile?.registrations) {
    return [];
  }
  if (Array.isArray(profile.registrations)) {
    return profile.registrations;
  }
  if (Array.isArray(profile.registrations.registrations)) {
    return profile.registrations.registrations;
  }
  return [];
}

export function buildSnapshot(
  payload: SofiaRegistrationsPayload | undefined,
  profile: string,
  raw: string,
  domain?: string | null,
): RegistrationSnapshot {
  const profileData = payload?.profiles?.[profile];
  const activeDomain =
    typeof profileData?.activeDomain === "string" && profileData.activeDomain.length > 0
      ? profileData.activeDomain.toLowerCase()
      : null;
  const normalizedDomain =
    typeof domain === "string" && domain.trim().length > 0 ? domain.trim().toLowerCase() : null;
  return {
    profile,
    domain: normalizedDomain ?? activeDomain ?? null,
    profileData,
    registrations: extractRegistrations(profileData),
    raw,
    generatedAt: Date.now(),
  };
}
