import { createContext, useContext, type ReactNode } from 'react';
import { useApi } from './api';
import type { Site, StatusResponse } from './types';

type Ctx = {
  site: Site | null;
  siteError: Error | null;
  status: StatusResponse | null;
};

const SiteContext = createContext<Ctx>({ site: null, siteError: null, status: null });

/** Site config (static) and service status (polled) are shared by the header and pages. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const site = useApi<Site>('/site');
  const status = useApi<StatusResponse>('/status', 30_000);
  return (
    <SiteContext.Provider value={{ site: site.data, siteError: site.error, status: status.data }}>
      {children}
    </SiteContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSite = () => useContext(SiteContext);
