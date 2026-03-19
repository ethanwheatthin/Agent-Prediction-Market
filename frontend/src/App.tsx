import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import MarketDetail from './pages/MarketDetail';
import Leaderboard from './pages/Leaderboard';
import AgentProfile from './pages/AgentProfile';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/:id" element={<MarketDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/agents/:id" element={<AgentProfile />} />
          <Route path="*" element={
            <div className="text-center py-16">
              <h1 className="text-4xl font-bold text-white">404</h1>
              <p className="text-arena-muted mt-2">Page not found</p>
            </div>
          } />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
