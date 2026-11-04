import { useCallback, useEffect, useState } from 'react';
import JoinPage from './pages/JoinPage';
import LandingPage from './pages/LandingPage';
import ManageApp from './pages/ManageApp';
import StreamerGate from './pages/StreamerGate';
import { getStreamerToken } from './utils/streamerAuth';

type Route = 'landing' | 'gate' | 'manage' | 'join';

function pathToRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/manage') {
    return getStreamerToken() ? 'manage' : 'gate';
  }
  if (path === '/join') return 'join';
  return 'landing';
}

function routeToPath(route: Route): string {
  if (route === 'manage' || route === 'gate') return '/manage';
  if (route === 'join') return '/join';
  return '/';
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => pathToRoute(window.location.pathname));

  const navigate = useCallback((next: Route) => {
    const path = routeToPath(next);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(next === 'manage' && !getStreamerToken() ? 'gate' : next);
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
        onSuccess={() => navigate('manage')}
      />
    );
  }

  if (route === 'manage') {
    return (
      <ManageApp
        onLogout={() => {
          navigate('landing');
        }}
      />
    );
  }

  return (
    <LandingPage
      onSelectStreamer={() => navigate(getStreamerToken() ? 'manage' : 'gate')}
      onSelectViewer={() => navigate('join')}
    />
  );
}
