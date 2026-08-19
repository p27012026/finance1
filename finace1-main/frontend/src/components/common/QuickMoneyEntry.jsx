import React, { useState } from 'react';
import axios from 'axios';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertCircle, Plus, Wallet } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';

const IN_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Interest',
  'Bonus',
  'Gift',
  'Refund',
  'Other'
];

const OUT_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills',
  'Rent',
  'EMI',
  'Education',
  'Medical',
  'Entertainment',
  'Investment',
  'Other'
];

const QuickMoneyEntry = ({ compact = false, onClose }) => {
  const [entryType, setEntryType] = useState('IN'); // 'IN' or 'OUT'
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Salary');
  const [details, setDetails] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { formatCurrency } = useCurrency();

  // Switch IN / OUT tabs and reset default category
  const handleTypeSwitch = (type) => {
    setEntryType(type);
    setCategory(type === 'IN' ? 'Salary' : 'Food');
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 1. Amount Validation
    if (!amount || amount.trim() === '') {
      setError('Please enter an amount.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      setError('Please enter a valid amount.');
      return;
    }

    if (numAmount <= 0) {
      setError('Amount must be greater than ₹0.');
      return;
    }

    // 2. Category Validation
    if (!category) {
      setError('Please select a category.');
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (entryType === 'IN') {
        // Map IN category to backend source format
        let sourceName = category;
        if (category === 'Freelance') sourceName = 'Freelancing';
        else if (category === 'Business') sourceName = 'Business Income';

        const payload = {
          title: details.trim() ? `${category} - ${details.trim()}` : `${category} Entry`,
          source: sourceName,
          amount: numAmount,
          frequency: 'Monthly',
          notes: details.trim() || null
        };

        await axios.post('/api/finance/income', payload, { headers });
      } else {
        // OUT Category
        const payload = {
          title: details.trim() ? `${category} - ${details.trim()}` : `${category} Entry`,
          category: category,
          amount: numAmount,
          notes: details.trim() || null
        };

        await axios.post('/api/finance/expense', payload, { headers });
      }

      // Format amount for success message
      const formattedVal = formatCurrency(numAmount);
      const successMsg = `✓ ${formattedVal} added to ${category}`;
      
      setSuccess(successMsg);
      setAmount('');
      setDetails('');

      // DISPATCH SYNC EVENT ONLY AFTER SUCCESSFUL DATABASE SAVE
      window.dispatchEvent(new CustomEvent('finance-data-updated'));

      if (onClose) {
        setTimeout(() => onClose(), 1500);
      }
    } catch (err) {
      console.error('Money Entry error:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Database save failed';
      setError(`Failed to save transaction: ${errDetail}`);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = entryType === 'IN' ? IN_CATEGORIES : OUT_CATEGORIES;

  return (
    <div className={`glass-panel ${compact ? 'p-4' : 'p-6'} space-y-4 animate-in fade-in duration-300`}>
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${entryType === 'IN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">Money Entry</h3>
            <p className="text-[11px] text-slate-400">Quickly record IN (Income) or OUT (Expense) cash flow</p>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Category Tabs: [ IN ] [ OUT ] */}
      <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
        <button
          type="button"
          onClick={() => handleTypeSwitch('IN')}
          className={`py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            entryType === 'IN'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25 ring-1 ring-emerald-400/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>IN (Money Received)</span>
        </button>

        <button
          type="button"
          onClick={() => handleTypeSwitch('OUT')}
          className={`py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            entryType === 'OUT'
              ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-500/25 ring-1 ring-rose-400/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>OUT (Money Spent)</span>
        </button>
      </div>

      {/* Entry Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Amount (₹) <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
              ₹
            </span>
            <input
              type="number"
              step="any"
              min="0.01"
              placeholder="e.g. 10000"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError('');
              }}
              className="w-full pl-8 pr-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              Formatted: <strong className="text-slate-200">{formatCurrency(parseFloat(amount))}</strong>
            </p>
          )}
        </div>

        {/* Category Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Category <span className="text-rose-400">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setError('');
            }}
            className="w-full px-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Details Field (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Details <span className="text-slate-500 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder={entryType === 'IN' ? 'e.g. August salary or bonus payout' : 'e.g. Monthly groceries or dinner'}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className={`w-full py-3 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
            entryType === 'IN'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 shadow-emerald-500/25'
              : 'bg-gradient-to-r from-rose-600 to-red-600 hover:opacity-90 shadow-rose-500/25'
          } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>{entryType === 'IN' ? 'ADD IN ENTRY' : 'ADD OUT ENTRY'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default QuickMoneyEntry;
