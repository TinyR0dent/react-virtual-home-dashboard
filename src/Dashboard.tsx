import { FloorStackViewer } from './components/FloorViewer';

const base = import.meta.env.BASE_URL;
const buildId = import.meta.env.VITE_BUILD_ID ?? 'dev';

function Dashboard() {
  return (
    <FloorStackViewer
      groundFloorUrl={`${base}models/ground-floor.glb?v=${buildId}`}
      upperFloors={[
        {
          modelUrl: `${base}models/first-floor.glb?v=${buildId}`,
          // Adjust to your floor-to-floor height in Blender units.
          // In Blender: select the top of a ground-floor wall → read Z in the N-panel.
          yOffset: 2.4,
        },
      ]}
    />
  );
}

export default Dashboard;
