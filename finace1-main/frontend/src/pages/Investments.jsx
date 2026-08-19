import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, Plus, Trash2, Sparkles, PieChart, Wallet, 
  ArrowUpRight, ArrowDownRight, Shield, Layers, Bot, X
} from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';

const AssetTypeColors = {
  'Stocks': '#6366F1',
  'Mutual Funds': '#10B981',
  'ETFs': '#F59E0B',
  'Bonds': '#8B5CF6',
  'Other': '#EC4899'
};

const Investments = () => {
  const { formatCurrency } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    asset_name: '',
    asset_type: 'Mutual Funds',
    amount_invested: '20000',
    current_value: '22000',
    risk_level: 'Moderate',
    notes: ''
  });

  useEffect(() => {
    fetchInvestments();
    window.addEventListener('finance-data-updated', fetchInvestments);
    return () => window.removeEventListener('finance-data-updated', fetchInvestments);
  }, []);

  const fetchInvestments = async () => {
    try {
      const res = await axios.get('/api/investments/');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch investments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInvestment = async (e) => {
    e.preventDefault();
    if (!form.asset_name.trim()) {
      setFormError('Please enter an asset name (e.g. Nifty 50 Index Fund, SBI Debt Fund)');
      return;
    }
    const invested = parseFloat(form.amount_invested) || 0;
    const current = parseFloat(form.current_value) || 0;
    if (invested <= 0) {
      setFormError('Please enter a valid invested amount greater than 0');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await axios.post('/api/investments/', {
        asset_name: form.asset_name.trim(),
        asset_type: form.asset_type,
        amount_invested: invested,
        current_value: current || invested,
        risk_level: form.risk_level,
        notes: form.notes.trim()
      });
      
      setShowAddModal(false);
      setForm({
        asset_name: '',
        asset_type: 'Mutual Funds',
        amount_invested: '20000',
        current_value: '22000',
        risk_level: 'Moderate',
        notes: ''
      });
      
      fetchInvestments();
      window.dispatchEvent(new CustomEvent('finance-data-updated'));
    } catch (err) {
      console.error('Error creating investment:', err);
      setFormError('Failed to record investment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvestment = async (id) => {
    try {
      await axios.delete(`/api/investments/${id}`);
      fetchInvestments();
      window.dispatchEvent(new CustomEvent('finance-data-updated'));
    } catch (err) {
      console.error('Failed to delete investment:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-indigo-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const pnl = data?.portfolio_summary ?? { total_invested: 0, total_current_value: 0, pnl: 0, pnl_pct: 0, is_profit: true };
  const items = data?.investments || [];
  const allocation = data?.asset_allocation || {};
  const recommendations = data?.ai_recommendations || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            Investment Portfolio & Asset Allocation
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-Time Mutual Funds, ETFs, Bonds & Stocks • Synchronized with Central AI Financial Agent.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Investment</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 space-y-1">
          <span className="text-xs text-slate-400 font-semibold block">Total Portfolio Value</span>
          <h3 className="text-2xl font-extrabold text-slate-100">{formatCurrency(pnl.total_current_value)}</h3>
          <span className="text-[11px] text-slate-400 block">Initial Cost: {formatCurrency(pnl.total_invested)}</span>
        </div>

        <div className="glass-panel p-5 space-y-1">
          <span className="text-xs text-slate-400 font-semibold block">Total Returns (PnL)</span>
          <h3 className={`text-2xl font-extrabold flex items-center gap-1 ${pnl.is_profit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnl.is_profit ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
            {formatCurrency(pnl.pnl)}
          </h3>
          <span className={`text-[11px] font-semibold ${pnl.is_profit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnl.pnl_pct >= 0 ? '+' : ''}{pnl.pnl_pct}% All-time Gain
          </span>
        </div>

        <div className="glass-panel p-5 space-y-1">
          <span className="text-xs text-slate-400 font-semibold block">Active Holdings</span>
          <h3 className="text-2xl font-extrabold text-indigo-400">{items.length}</h3>
          <span className="text-[11px] text-slate-400 block">Across {Object.keys(allocation).length} Asset Types</span>
        </div>

        <div className="glass-panel p-5 space-y-1">
          <span className="text-xs text-slate-400 font-semibold block">AI Rebalancing Engine</span>
          <h3 className="text-2xl font-extrabold text-amber-400">Active</h3>
          <span className="text-[11px] text-emerald-400 block">Synchronized with Central Agent ✅</span>
        </div>
      </div>

      {/* Main Grid: Holdings List & Asset Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table */}
        <div className="glass-panel p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Investment Holdings ({items.length})
            </h3>
            <span className="text-xs text-slate-400">Live Database Records</span>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="p-3 w-fit rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">No Investments Recorded Yet</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Add investments manually using the button above or command your AI Financial Agent: <em className="text-indigo-300">"I invested ₹50,000 in mutual funds"</em>.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="pb-3 pl-2">Asset Name</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Invested</th>
                    <th className="pb-3">Current Value</th>
                    <th className="pb-3">Gain / Loss</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {items.map((inv) => {
                    const gain = inv.current_value - inv.amount_invested;
                    const gainPct = inv.amount_invested > 0 ? ((gain / inv.amount_invested) * 100).toFixed(1) : 0;
                    const isProf = gain >= 0;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 pl-2 font-bold text-slate-100">{inv.asset_name}</td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {inv.asset_type}
                          </span>
                        </td>
                        <td className="py-3.5">{formatCurrency(inv.amount_invested)}</td>
                        <td className="py-3.5 font-semibold text-slate-100">{formatCurrency(inv.current_value)}</td>
                        <td className={`py-3.5 font-bold ${isProf ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProf ? '+' : ''}{formatCurrency(gain)} ({gainPct}%)
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <button
                            onClick={() => handleDeleteInvestment(inv.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Delete Investment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar: Asset Allocation & AI Insights */}
        <div className="space-y-6">
          {/* Asset Allocation Card */}
          <div className="glass-panel p-5 space-y-4">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <PieChart className="w-4 h-4 text-purple-400" />
              Asset Breakdown
            </h3>
            
            {Object.keys(allocation).length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No allocation data available.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {Object.entries(allocation).map(([type, val]) => {
                  const pct = pnl.total_current_value > 0 ? ((val / pnl.total_current_value) * 100).toFixed(1) : 0;
                  const color = AssetTypeColors[type] || '#6366F1';
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-300">{type}</span>
                        <span className="text-indigo-300">{formatCurrency(val)} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Strategic Recommendations Card */}
          <div className="glass-panel p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              AI Strategic Recommendations
            </h3>
            <div className="space-y-2 text-xs">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-slate-800/60 border border-indigo-500/20 text-slate-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <p className="leading-snug">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Investment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md p-6 space-y-4 border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                Add Investment Entry
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddInvestment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Asset / Fund Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nifty 50 Index Fund, HDFC Mutual Fund"
                  value={form.asset_name}
                  onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Asset Category</label>
                  <select
                    value={form.asset_type}
                    onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Mutual Funds">Mutual Funds</option>
                    <option value="Stocks">Stocks</option>
                    <option value="ETFs">ETFs</option>
                    <option value="Bonds">Bonds</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Risk Profile</label>
                  <select
                    value={form.risk_level}
                    onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Low">Low Risk</option>
                    <option value="Moderate">Moderate Risk</option>
                    <option value="High">High Risk</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Invested Amount (₹)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.amount_invested}
                    onChange={(e) => setForm({ ...form, amount_invested: e.target.value, current_value: form.current_value || e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Current Valuation (₹)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.current_value}
                    onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
