import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import Dashboard from './Dashboard';
import { Header } from './components/Header';

const hassUrl = import.meta.env.VITE_HA_URL ?? window.location.origin;
const hassToken = import.meta.env.VITE_HA_TOKEN;

function App() {
  return (
    <>
      <HassConnect hassUrl={hassUrl} hassToken={hassToken}>
        <ThemeProvider />
        <Header />
        <Dashboard />
      </HassConnect>
    </>
  );
}

export default App;
