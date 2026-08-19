import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  FileText,
  TrendingUp,
  ShieldCheck,
  CreditCard,
  PieChart,
  Settings,
  Sparkles,
  Bot
} from 'lucide-react';

import QuickMoneyEntry from './QuickMoneyEntry';
import { Plus, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const Sidebar = () => {
  const [showEntryModal, setShowEntryModal] = React.useState(false);

  const navItems = [
    { name: 'AI Financial Agent', path: '/', icon: Bot },
    { name: 'Dashboard Overview', path: '/dashboard', icon: LayoutDashboard },
    { name: '💰 Money IN / OUT', path: '/money', icon: Wallet },
    { name: 'Investments', path: '/investments', icon: TrendingUp },
    { name: 'Loans & Credit', path: '/loans', icon: CreditCard },
  ];

  return (
    <aside className="w-64 glass-panel m-4 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-2rem)] border-slate-800">
      <div>
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-700/40">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight gradient-text">AI Finance</h1>
            <p className="text-xs text-slate-400 font-medium">Finance OS v1.0</p>
          </div>
        </div>

        {/* Quick Money Entry Trigger Button in Sidebar */}
        <div className="p-4 pb-0">
          <button
            onClick={() => setShowEntryModal(true)}
            className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Money Entry (IN / OUT)</span>
          </button>
        </div>

        {/* Nav links */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* AI Assistant Badge */}
      <div className="p-4 m-4 rounded-xl bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-slate-900 border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-1 text-indigo-300 font-semibold text-xs">
          <Bot className="w-4 h-4 text-indigo-400" />
          <span>Gemini AI Engine Active</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          Primary Financial Command Center active on home.
        </p>
      </div>

      {/* Quick Money Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg">
            <button
              onClick={() => setShowEntryModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors z-10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <QuickMoneyEntry compact={false} onClose={() => setShowEntryModal(false)} />
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
