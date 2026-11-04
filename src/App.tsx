import { useCallback, useEffect, useState } from 'react';
import AdminApp from './pages/AdminApp';
import JoinPage from './pages/JoinPage';
import LandingPage from './pages/LandingPage';
import ManageApp from './pages/ManageApp';
import StreamerGate from './pages/StreamerGate';
import { clearStreamerToken, getAuthRole, getStreamerToken } from './utils/streamerAuth';

type Route = 'landing' | 'gate' | 'manage' | 'admin' | 'join';

function pathToRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/manage') {
    if (!getStreamerToken()) return 'gate';
    return getAuthRole() === 'admin' ? 'admin' : 'manage';
  }
  if (path === '/admin') {
    if (!getStreamerToken() || getAuthRole() !== 'admin') return 'gate';
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
    if (target === 'manage') {
      if (!getStreamerToken()) target = 'gate';
      else if (getAuthRole() === 'admin') target = 'admin';
    }
    if (target === 'admin' && (!getStreamerToken() || getAuthRole() !== 'admin')) {
      target = 'gate';
    }
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
          clearStreamerToken();
          navigate('landing');
        }}
      />
    );
  }

  if (route === 'manage') {
    return (
      <ManageApp
        onLogout={() => {
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
        navigate(getAuthRole() === 'admin' ? 'admin' : 'manage');
      }}
      onSelectViewer={() => navigate('join')}
    />
  );
}
