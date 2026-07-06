import { render } from 'preact';

function App() {
  return <p>Vertex Support — customer chat (skeleton). Guided flow arrives in M4.</p>;
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
