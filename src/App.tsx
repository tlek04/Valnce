import { useCallback, useEffect, useState } from 'react';
import AdminApp from './pages/AdminApp';
import JoinPage from './pages/JoinPage';
import LandingPage from './pages/LandingPage';
import ManageApp from './pages/ManageApp';
import StreamerGate from './pages/StreamerGate';
import {
  clearAdminToken,
  clearStreamerToken,
  fetchTrustStatus,
  getAdminToken,
  getStreamerToken,
} from './utils/streamerAuth';
import { fetchSiteSettings } from './utils/siteSettings';

type Route = 'landing' | 'gate' | 'manage' | 'admin' | 'join';

function pathToRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/manage') {
    // 스트리머 또는 관리자 토큰이면 매니지 진입(staff API는 admin Bearer도 허용)
    if (!getStreamerToken() && !getAdminToken()) return 'gate';
    return 'manage';
  }
  if (path === '/admin') {
    if (!getAdminToken()) return 'gate';
    return 'admin';
  }
  if (path === '/join') return 'join';
  return 'landing';
}

function routeToPath(route: Route): string {
  if (route === 'manage' || route === 'gate') return '/manage';
  if (route === 'admin') return '/admin';
  if (route === 'join') return '/join';
  return '/';
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => pathToRoute(window.location.pathname));

  const navigate = useCallback((next: Route) => {
    let target = next;
    if (target === 'manage' && !getStreamerToken()) target = 'gate';
    if (target === 'admin' && !getAdminToken()) target = 'gate';
    const path = routeToPath(target);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(target);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route === 'join') {
    return <JoinPage onBack={() => navigate('landing')} />;
  }

  if (route === 'gate') {
    return (
      <StreamerGate
        onBack={() => navigate('landing')}
        onSuccess={(role) => navigate(role === 'admin' ? 'admin' : 'manage')}
      />
    );
  }

  if (route === 'admin') {
    return (
      <AdminApp
        onLogout={() => {
          clearAdminToken();
          navigate(getStreamerToken() ? 'manage' : 'landing');
        }}
      />
    );
  }

  if (route === 'manage') {
    return (
      <ManageApp
        onLogout={() => {
          // 401/만료 시 clearAllAuthTokens는 Manage 쪽에서 호출. 여기선 게이트로만 이동.
          if (getStreamerToken()) clearStreamerToken();
          navigate('gate');
        }}
        onAdminEnter={() => navigate('admin')}
      />
    );
  }

  return (
    <LandingPage
      onSelectStreamer={() => {
        void (async () => {
          const [settings, trusted] = await Promise.all([fetchSiteSettings(), fetchTrustStatus()]);
          const streamerOpen = settings.streamerAccessOpen || trusted;
          // 스트리머 입장이 닫혀 카드가「관리자」일 때만 관리자 토큰으로 직행
          if (!streamerOpen) {
            navigate(getAdminToken() ? 'admin' : 'gate');
            return;
          }
          // 스트리머 입장이 열려 있으면 관리자 토큰이 있어도 매니지/게이트로
          navigate(getStreamerToken() ? 'manage' : 'gate');
        })();
      }}
      onSelectViewer={() => navigate('join')}
    />
  );
}
