import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <p>Vertex Support — admin console (skeleton). Inbox and tools arrive in M5.</p>;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
