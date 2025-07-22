import { createRoot } from 'react-dom/client';
import NexlaChatWidget from './components/NexlaChatWidget';

// This will mount the widget to a div with id 'nexla-chatbot-widget'
const mount = (element: HTMLElement) => {
  createRoot(element).render(<NexlaChatWidget />);
};

// Expose globally for script embed
(window as any).NexlaChatWidget = { mount }; 