import React from 'react';
import { MemoryRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { Shield, Users, Sparkles } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';

function DemoBanner() {
  const { user, demoUsers, switchDemoUser } = useAuth();

  return (
    <div className="bg-slate-900 text-slate-100 border-b border-slate-700 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white font-semibold">
          <Sparkles className="w-3 h-3" /> Interactive Demo
        </span>
        <span className="text-slate-300 hidden sm:inline">
          Switch users to test multi-tenant Team RBAC &amp; namespace isolation:
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {demoUsers.map((u) => {
          const active = user?.username === u.username;
          const isAdm = u.role === 'admin';
          return (
            <button
              key={u.username}
              type="button"
              onClick={() => switchDemoUser(u.username)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
                active
                  ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              title={u.demoDescription}
            >
              {isAdm ? <Shield className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              <span>{u.username}</span>
              <span className={`text-[10px] px-1 rounded ${active ? 'bg-blue-500/50 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {u.demoBadge}
              </span>
            </button>
          );
        })}
        <a
          href="/"
          className="ml-2 text-slate-400 hover:text-white underline"
        >
          Back to site
        </a>
      </div>
    </div>
  );
}

function DemoShell() {
  const { user } = useAuth();
  return (
    <div className="App min-h-screen m-0 p-0 flex flex-col">
      <DemoBanner />
      <div className="flex-1">
        <Routes>
          <Route path="/*" element={<Dashboard key={user?.username || 'admin'} />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <DemoShell />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
