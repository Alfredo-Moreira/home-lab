import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SiteProvider } from './lib/site';
import { Architecture } from './pages/Architecture';
import { Hardware } from './pages/Hardware';
import { Log } from './pages/Log';
import { NotFound } from './pages/NotFound';
import { Overview } from './pages/Overview';

const LogEntryPage = lazy(() => import('./pages/LogEntry'));

export default function App() {
  return (
    <SiteProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="architecture" element={<Architecture />} />
          <Route path="hardware" element={<Hardware />} />
          <Route path="log" element={<Log />} />
          <Route
            path="log/:slug"
            element={
              <Suspense fallback={null}>
                <LogEntryPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SiteProvider>
  );
}
