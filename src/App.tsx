import { ThemeProvider } from '@hakit/components';
import { HassConnect } from '@hakit/core';
import Dashboard from './Dashboard';
import { Header } from './components/Header';

function App() {
  return (
    <>
      <HassConnect hassUrl={import.meta.env.VITE_HA_URL} hassToken={import.meta.env.VITE_HA_TOKEN}>
        <ThemeProvider />
        <Header />
        <Dashboard />
      </HassConnect>
    </>
  );
}

export default App;
