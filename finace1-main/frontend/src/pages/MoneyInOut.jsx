import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCurrency } from '../context/CurrencyContext';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, Plus, Search, Filter,
  Trash2, Edit3, CheckCircle2, AlertCircle, Calendar, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, X
} from 'lucide-react';

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

const MoneyInOut = () => {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const { formatCurrency } = useCurrency();

  // Active Tab: 'ALL', 'IN', 'OUT'
  const [activeTab, setActiveTab] = useState('ALL');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');

  // Modal State for Add/Edit Transaction
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('IN'); // 'IN' or 'OUT'
  const [editingItem, setEditingItem] = useState(null); // null if adding, item object if editing

  // Form State
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Salary');
  const [formDetails, setFormDetails] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete Confirmation State
  const [deletingItem, setDeletingItem] = useState(null);

  useEffect(() => {
    fetchData();
    window.addEventListener('finance-data-updated', fetchData);
    return () => window.removeEventListener('finance-data-updated', fetchData);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [incRes, expRes] = await Promise.all([
        axios.get('/api/finance/income', { headers }),
        axios.get('/api/finance/expense', { headers })
      ]);

      setIncomes(incRes.data || []);
      setExpenses(expRes.data || []);
    } catch (err) {
      console.error('Failed to fetch Money IN/OUT data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open Add Modal
  const openAddModal = (type) => {
    setModalType(type);
    setEditingItem(null);
    setFormAmount('');
    setFormCategory(type === 'IN' ? 'Salary' : 'Food');
    setFormDetails('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormError('');
    setShowModal(true);
  };

  // Open Edit Modal
  const openEditModal = (item) => {
    const isIncome = item.type === 'IN';
    setModalType(item.type);
    setEditingItem(item);
    setFormAmount(item.amount.toString());
    setFormCategory(isIncome ? item.source || 'Salary' : item.category || 'Food');
    setFormDetails(item.notes || item.title || '');
    setFormDate(item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setFormError('');
    setShowModal(true);
  };

  // Submit Form (Add or Edit)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formAmount || formAmount.trim() === '') {
      setFormError('Please enter an amount.');
      return;
    }

    const numAmt = parseFloat(formAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setFormError('Amount must be greater than ₹0.');
      return;
    }

    if (!formCategory) {
      setFormError('Please select a category.');
      return;
    }

    setFormSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (editingItem) {
        // Edit existing transaction
        if (editingItem.type === 'IN') {
          const payload = {
            title: formDetails.trim() ? `${formCategory} - ${formDetails.trim()}` : `${formCategory} Entry`,
            source: formCategory,
            amount: numAmt,
            frequency: 'Monthly',
            notes: formDetails.trim() || null
          };
          await axios.put(`/api/finance/income/${editingItem.id}`, payload, { headers });
        } else {
          const payload = {
            title: formDetails.trim() ? `${formCategory} - ${formDetails.trim()}` : `${formCategory} Entry`,
            category: formCategory,
            amount: numAmt,
            notes: formDetails.trim() || null
          };
          await axios.put(`/api/finance/expense/${editingItem.id}`, payload, { headers });
        }
      } else {
        // Create new transaction
        if (modalType === 'IN') {
          let sourceName = formCategory;
          if (formCategory === 'Freelance') sourceName = 'Freelancing';
          else if (formCategory === 'Business') sourceName = 'Business Income';

          const payload = {
            title: formDetails.trim() ? `${formCategory} - ${formDetails.trim()}` : `${formCategory} Entry`,
            source: sourceName,
            amount: numAmt,
            frequency: 'Monthly',
            notes: formDetails.trim() || null
          };
          await axios.post('/api/finance/income', payload, { headers });
        } else {
          const payload = {
            title: formDetails.trim() ? `${formCategory} - ${formDetails.trim()}` : `${formCategory} Entry`,
            category: formCategory,
            amount: numAmt,
            notes: formDetails.trim() || null
          };
          await axios.post('/api/finance/expense', payload, { headers });
        }
      }

      setShowModal(false);
      
      // DISPATCH GLOBAL REFETCH EVENT ONLY ON CONFIRMED DB SUCCESS
      window.dispatchEvent(new CustomEvent('finance-data-updated'));
    } catch (err) {
      console.error('Transaction save error:', err);
      const detail = err.response?.data?.detail || err.message || 'Database operation failed';
      setFormError(`Failed to save: ${detail}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm and Delete Transaction
  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (deletingItem.type === 'IN') {
        await axios.delete(`/api/finance/income/${deletingItem.id}`, { headers });
      } else {
        await axios.delete(`/api/finance/expense/${deletingItem.id}`, { headers });
      }

      setDeletingItem(null);
      
      // DISPATCH GLOBAL REFETCH EVENT ONLY ON CONFIRMED DB SUCCESS
      window.dispatchEvent(new CustomEvent('finance-data-updated'));
    } catch (err) {
      console.error('Delete error:', err);
      alert(`Delete failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Calculate Totals from Live Database Data
  const totalIn = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalOut = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netCashFlow = totalIn - totalOut;

  // Combine and format all transactions into unified list
  const allTransactions = [
    ...incomes.map(i => ({
      id: i.id,
      type: 'IN',
      title: i.title,
      category: i.source,
      amount: i.amount,
      date: i.date || i.created_at,
      notes: i.notes,
      raw: i
    })),
    ...expenses.map(e => ({
      id: e.id,
      type: 'OUT',
      title: e.title,
      category: e.category,
      amount: e.amount,
      date: e.date || e.created_at,
      notes: e.notes,
      raw: e
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filtered List
  const filteredTransactions = allTransactions.filter(item => {
    // 1. Tab Filter
    if (activeTab === 'IN' && item.type !== 'IN') return false;
    if (activeTab === 'OUT' && item.type !== 'OUT') return false;

    // 2. Category Filter
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;

    // 3. Search Filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchCategory = (item.category || '').toLowerCase().includes(q);
      const matchNotes = (item.notes || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCategory && !matchNotes) return false;
    }

    // 4. Date Filter
    if (dateFilter !== 'ALL' && item.date) {
      const itemDate = new Date(item.date);
      const now = new Date();
      if (dateFilter === 'TODAY') {
        if (itemDate.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        if (itemDate < weekAgo) return false;
      } else if (dateFilter === 'THIS_MONTH') {
        if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
      }
    }

    return true;
  });

  const categoryOptions = modalType === 'IN' ? IN_CATEGORIES : OUT_CATEGORIES;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Header & Action Buttons */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
                💰 Money IN / OUT
              </h1>
              <p className="text-xs text-slate-400">
                Central cash flow management — track income, expenses, and transaction history
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openAddModal('IN')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Money IN</span>
          </button>

          <button
            onClick={() => openAddModal('OUT')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-bold text-xs shadow-lg shadow-rose-500/25 hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Money OUT</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total IN */}
        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Total Money IN</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-emerald-400">{formatCurrency(totalIn)}</h3>
            <p className="text-xs text-slate-400 mt-1">{incomes.length} Income Entries</p>
          </div>
        </div>

        {/* Card 2: Total OUT */}
        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Total Money OUT</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-rose-400">{formatCurrency(totalOut)}</h3>
            <p className="text-xs text-slate-400 mt-1">{expenses.length} Expense Entries</p>
          </div>
        </div>

        {/* Card 3: Net Cash Flow */}
        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Net Cash Flow</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className={`text-2xl font-extrabold ${netCashFlow >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
              {formatCurrency(netCashFlow)}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {totalIn > 0 ? `${((netCashFlow / totalIn) * 100).toFixed(1)}% Savings Rate` : '0% Savings Rate'}
            </p>
          </div>
        </div>

        {/* Card 4: Total Transactions */}
        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Total Transactions</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-slate-100">{allTransactions.length}</h3>
            <p className="text-xs text-slate-400 mt-1">Recorded in Database</p>
          </div>
        </div>
      </div>

      {/* Main Content Card: Tabs, Filters & Transaction Table */}
      <div className="glass-panel p-6 space-y-6">
        {/* Navigation Tabs & Search/Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/40 pb-4">
          {/* Tabs: All | Money IN | Money OUT */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Transactions ({allTransactions.length})
            </button>

            <button
              onClick={() => setActiveTab('IN')}
              className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'IN'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Money IN ({incomes.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('OUT')}
              className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'OUT'
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Money OUT ({expenses.length})</span>
            </button>
          </div>

          {/* Search Input & Filters */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Search Bar */}
            <div className="relative flex-1 md:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Category Filter Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {(activeTab === 'IN' ? IN_CATEGORIES : (activeTab === 'OUT' ? OUT_CATEGORIES : [...IN_CATEGORIES, ...OUT_CATEGORIES])).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Date Filter Dropdown */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="THIS_MONTH">This Month</option>
            </select>
          </div>
        </div>

        {/* Transaction History Table */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-indigo-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <Wallet className="w-10 h-10 mx-auto text-slate-600 opacity-50" />
            <p className="text-sm font-semibold">No transactions found.</p>
            <p className="text-xs text-slate-500">Click "+ Add Money IN" or "+ Add Money OUT" to record a new entry.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category & Title</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredTransactions.map((item) => {
                  const isIncome = item.type === 'IN';
                  return (
                    <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-800/40 transition-colors">
                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isIncome
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isIncome ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {isIncome ? 'IN' : 'OUT'}
                        </span>
                      </td>

                      {/* Title & Category */}
                      <td className="py-3.5 px-4 font-semibold text-slate-200">
                        <div>{item.category}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{item.title}</div>
                      </td>

                      {/* Details / Notes */}
                      <td className="py-3.5 px-4 text-slate-300">
                        {item.notes || <span className="text-slate-500 text-[11px] italic">—</span>}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>

                      {/* Amount */}
                      <td className={`py-3.5 px-4 text-right font-extrabold text-sm ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(item.amount)}
                      </td>

                      {/* Action Buttons: Edit / Delete */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel p-6 w-full max-w-lg space-y-4 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-2 border-b border-slate-700/40 pb-3">
              <div className={`p-2 rounded-xl ${modalType === 'IN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {modalType === 'IN' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
              </div>
              <h3 className="font-bold text-base text-slate-100">
                {editingItem ? 'Edit Transaction' : (modalType === 'IN' ? 'Add Money IN' : 'Add Money OUT')}
              </h3>
            </div>

            {/* Form Error */}
            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Amount Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Amount (₹) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="e.g. 50000"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>
              </div>

              {/* Category Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Category <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-semibold focus:outline-none cursor-pointer"
                >
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
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
                  placeholder={modalType === 'IN' ? 'e.g. August salary or bonus' : 'e.g. Monthly groceries'}
                  value={formDetails}
                  onChange={(e) => setFormDetails(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Date Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl text-slate-100 text-sm font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={formSubmitting}
                className={`w-full py-3 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  modalType === 'IN'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-500/25'
                } ${formSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {formSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <span>{editingItem ? 'UPDATE TRANSACTION' : (modalType === 'IN' ? 'ADD MONEY IN' : 'ADD MONEY OUT')}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel p-6 w-full max-w-md space-y-4 relative">
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400" />
              Confirm Deletion
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete this {deletingItem.type === 'IN' ? 'income' : 'expense'} transaction?
              <br />
              <strong className="text-slate-100">{deletingItem.category} — {formatCurrency(deletingItem.amount)}</strong>
              <br />
              This action will permanently remove the record from your SQLite database.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/25 cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoneyInOut;
