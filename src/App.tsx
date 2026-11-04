import { useCallback, useEffect, useState } from 'react';
import AdminApp from './pages/AdminApp';
import JoinPage from './pages/JoinPage';
import LandingPage from './pages/LandingPage';
import ManageApp from './pages/ManageApp';
import StreamerGate from './pages/StreamerGate';
import {
  clearAdminToken,
  clearStreamerToken,
  getAdminToken,
  getStreamerToken,
} from './utils/streamerAuth';

type Route = 'landing' | 'gate' | 'manage' | 'admin' | 'join';

function pathToRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/manage') {
    if (!getStreamerToken()) return 'gate';
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
          clearStreamerToken();
          navigate('gate');
        }}
        onAdminEnter={() => navigate('admin')}
      />
    );
  }

  return (
    <LandingPage
      onSelectStreamer={() => {
        if (!getStreamerToken()) {
          navigate('gate');
          return;
        }
        navigate('manage');
      }}
      onSelectViewer={() => navigate('join')}
    />
  );
}
