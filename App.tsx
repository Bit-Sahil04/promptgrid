import React from 'react';
import { Grid } from './components/Grid';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500/30">
      <Grid />
    </div>
  );
};

export default App;
