// الراوتر والتخطيط العام
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import Shell from './components/Shell';
import { isLoggedIn } from './lib/auth';
import { queryClient } from './lib/queryClient';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LiveMap from './pages/LiveMap';
import Dispatch from './pages/Dispatch';
import Orders from './pages/Orders';
import Restaurants from './pages/Restaurants';
import Captains from './pages/Captains';
import Companies from './pages/Companies';
import Compliance from './pages/Compliance';
import Tga from './pages/Tga';
import Settlements from './pages/Settlements';
import Wallets from './pages/Wallets';
import Coupons from './pages/Coupons';
import Support from './pages/Support';
import Quality from './pages/Quality';
import Reports from './pages/Reports';
import UsersRoles from './pages/UsersRoles';
import Settings from './pages/Settings';
import Zones from './pages/Zones';
import Integrations from './pages/Integrations';
import RelayMonitor from './pages/RelayMonitor';

/** يمنع الوصول لأي صفحة من غير جلسة، وبيفتكر المسار عشان يرجّعه بعد الدخول. */
function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/map" element={<LiveMap />} />
            <Route path="/dispatch" element={<Dispatch />} />
            <Route path="/relay" element={<RelayMonitor />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/restaurants" element={<Restaurants />} />
            <Route path="/captains" element={<Captains />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/tga" element={<Tga />} />
            <Route path="/finance" element={<Settlements />} />
            <Route path="/wallets" element={<Wallets />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/support" element={<Support />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<UsersRoles />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
