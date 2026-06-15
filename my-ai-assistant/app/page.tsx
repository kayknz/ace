// app/page.tsx
import ChatInterface from '../components/chat-interface';

export default function Page() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <ChatInterface />
    </main>
  );
}