export interface SofiaRegistration {
  aor?: string;
  user?: string;
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
  extensionStats?: {
    total: number;
    online: number;
    offline: number;
  };
}

export interface ExtensionPresence {
  id: string;
  tenantId: string;
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
  profileData?: SofiaProfile;
  registrations: SofiaRegistration[];
  raw: string;
  generatedAt: number;
}

export interface RegistrationEventMessage {
  action: 'register' | 'unregister' | 'expire' | 'reregister' | string;
  profile: string;
  username: string;
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
): RegistrationSnapshot {
  const profileData = payload?.profiles?.[profile];
  return {
    profile,
    profileData,
    registrations: extractRegistrations(profileData),
    raw,
    generatedAt: Date.now(),
  };
}
