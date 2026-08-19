import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database.session import get_db
from backend.middleware.auth import get_current_user
from backend.models import (
    User, Income, Expense, Investment, Loan, HealthSecurity,
    Goal, Budget, CreditScore, ChatHistory, Document, CreditCard
)
from backend.schemas.all_schemas import ChatRequest, ChatResponse
from backend.business_logic.calculator import FinancialCalculator
from backend.ai.gemini_service import gemini_service
from backend.utils.logger import error_logger, ai_logger

router = APIRouter(prefix="/ai", tags=["AI Financial Agent"])

def extract_amount_from_text(msg: str) -> Optional[float]:
    """
    Extract monetary amounts from text supporting INR formats:
    - 5 lakh / 5 lakhs / 5 lac -> 500,000
    - 1.5 crore / 1.5 cr -> 15,000,000
    - 50k / 10k -> 50,000 / 10,000
    - ₹10,000 / 10000 / rs 10000 -> 10,000
    """
    msg_lower = (msg or "").lower()
    
    crore_match = re.search(r'([\d,]+(?:\.\d+)?)\s*(?:crores?|cr\b)', msg_lower)
    if crore_match:
        try:
            val = float(crore_match.group(1).replace(',', ''))
            return val * 10000000.0
        except ValueError:
            pass

    lakh_match = re.search(r'([\d,]+(?:\.\d+)?)\s*(?:lakhs?|lacs?|l\b)', msg_lower)
    if lakh_match:
        try:
            val = float(lakh_match.group(1).replace(',', ''))
            return val * 100000.0
        except ValueError:
            pass

    k_match = re.search(r'([\d,]+(?:\.\d+)?)\s*k\b', msg_lower)
    if k_match:
        try:
            val = float(k_match.group(1).replace(',', ''))
            return val * 1000.0
        except ValueError:
            pass

    std_match = re.search(r'(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)', msg_lower)
    if std_match:
        try:
            val = float(std_match.group(1).replace(',', ''))
            if val > 0:
                return val
        except ValueError:
            pass
            
    return None

class FinancialNLU:
    def __init__(self, intent: str, domain: str, entity_type: str, amount: Optional[float], is_partial: bool, reference: Optional[str], is_advice: bool):
        self.intent = intent          # READ, CREATE, UPDATE, DELETE, SUMMARY, GREETING, ADVICE, UNKNOWN
        self.domain = domain          # INVESTMENT, LOAN, EXPENSE, INCOME, CREDIT, CREDIT_SCORE, DASHBOARD, UNKNOWN
        self.entity_type = entity_type # MUTUAL_FUND, STOCKS, ETF, BONDS, FD, SALARY, FREELANCE, BUSINESS, RENT, GROCERIES, FOOD, TRANSPORT, SHOPPING, BILLS, EMI, CREDIT_CARD, ALL, UNKNOWN
        self.amount = amount          # float or None
        self.is_partial = is_partial  # True for "remove ₹20,000 from mutual funds"
        self.reference = reference    # THAT, THIS, LAST, PREVIOUS, SPECIFIC, None
        self.is_advice = is_advice    # True if user asks for advice/guidance

def parse_nlu_intent_and_entities(msg: str, history: List[Dict[str, str]] = None) -> FinancialNLU:
    """
    Central AI Natural Language Understanding (NLU) Classifier.
    Fuzzy, typo-tolerant, synonym-aware, context-sensitive Intent & Entity Resolver.
    """
    msg_lower = (msg or "").strip().lower()
    amount = extract_amount_from_text(msg)

    # 1. Compile recent history text for context resolution
    recent_history_text = ""
    if history and len(history) > 0:
        recent_history_text = " ".join([h.get("message", "").lower() for h in history[-4:]])

    # 2. Reference Detection ("this", "that", "the last one", "previous", "just added")
    has_ref_that = any(kw in msg_lower for kw in ['that', 'this', 'it', 'the one'])
    has_ref_last = any(kw in msg_lower for kw in ['last', 'previous', 'just added', 'just created', 'recent', 'latest', 'earlier'])
    reference = "THAT" if has_ref_that else ("LAST" if has_ref_last else None)

    # 3. Check explicit ADVICE Intent
    advice_keywords = [
        'should i', 'can i', 'is it safe', 'are mutual funds safe', 'is mutual fund safe',
        'where to invest', 'how to invest', 'which investment', 'safer', 'safety', 'recommend',
        'guidance', 'advice', 'suggest', 'which is better', 'is it good', 'how can i save',
        'where and how', 'how to get a loan', 'how to make my'
    ]
    is_advice = any(ak in msg_lower for ak in advice_keywords)

    # 4. Check GREETING Intent
    if msg_lower in ['hi', 'hello', 'hey', 'hi there', 'greetings', 'who are you', 'help', 'start', 'good morning', 'good evening']:
        return FinancialNLU("GREETING", "DASHBOARD", "ALL", amount, False, reference, False)

    # 5. Check SUMMARY / OVERVIEW Intent
    summary_keywords = [
        'summary', 'financial summary', 'overall summary', 'my financial condition',
        'how am i doing financially', 'financial status', 'financial profile', 'my financial picture',
        'give me my financial summary', 'money coming in', 'how much am i spending',
        'how much debt', 'how much savings', 'how much money do i have'
    ]
    if any(sk in msg_lower for sk in summary_keywords) and not is_advice:
        return FinancialNLU("SUMMARY", "DASHBOARD", "ALL", amount, False, reference, False)

    # 6. Action Verb / Intent Extraction
    read_verbs = ['show', 'display', 'tell', 'give', 'what is', "what's", 'check', 'view', 'see', 'status', 'balance', 'amount', 'total', 'holding', 'holdings', 'value', 'how much', 'my', 'list']
    create_verbs = ['add', 'put', 'invest', 'invested', 'record', 'enter', 'include', 'bought', 'spent', 'received', 'got', 'took', 'taken', 'create']
    update_verbs = ['change', 'update', 'modify', 'edit', 'set', 'make it', 'adjust', 'increase', 'decrease', 'paid']
    delete_verbs = ['delete', 'remove', 'drop', 'cancel', 'undo', 'clear', 'take out', 'erase', 'get rid of', 'withdraw']

    has_delete = any(kw in msg_lower for kw in delete_verbs)
    has_update = any(kw in msg_lower for kw in update_verbs)
    has_create = any(kw in msg_lower for kw in create_verbs)
    has_read = any(kw in msg_lower for kw in read_verbs)

    # Determine primary intent
    if has_delete:
        intent = "DELETE"
    elif has_update and amount:
        intent = "UPDATE"
    elif has_create and amount:
        intent = "CREATE"
    elif is_advice:
        intent = "ADVICE"
    elif has_read or ("?" in msg_lower):
        intent = "READ"
    else:
        intent = "READ" if not amount else "CREATE"

    # 7. Entity Type & Domain Extraction with Typo Tolerance
    mf_kw = ['mutual fund', 'mutual funds', 'mutualfund', 'mutualfunds', 'mutrualfund', 'mutrualfunds', 'mutal fund', 'mutul fund', 'mutal funds', 'mf', 'm.f.', 'sip']
    stock_kw = ['stock', 'stocks', 'share', 'shares', 'equity', 'equities']
    etf_kw = ['etf', 'etfs', 'exchange traded fund', 'nifty 50 etf']
    bond_kw = ['bond', 'bonds', 'sgb', 'sovereign gold bond', 'corporate bond', 'govt bond']
    fd_kw = ['fd', 'fixed deposit', 'term deposit']

    is_mf = any(k in msg_lower for k in mf_kw)
    is_stock = any(k in msg_lower for k in stock_kw)
    is_etf = any(k in msg_lower for k in etf_kw)
    is_bond = any(k in msg_lower for k in bond_kw)
    is_fd = any(k in msg_lower for k in fd_kw)
    is_inv_general = any(k in msg_lower for k in ['invest', 'investment', 'investments', 'invesment', 'investement', 'portfolio', 'holding', 'holdings'])

    loan_kw = ['loan', 'loans', 'borrow', 'mortgage', 'emi', 'lender', 'debt', 'outstanding debt']
    inc_kw = ['salary', 'salaries', 'income', 'freelance', 'freelancing', 'business income', 'rental', 'earnings', 'paycheck', 'wage']
    exp_kw = ['expense', 'expenses', 'spent', 'spend', 'spending', 'spends', 'bought', 'grocery', 'groceries', 'food', 'bills', 'recharge', 'shopping', 'petrol', 'fuel', 'rent', 'dinner']
    cs_kw = ['credit score', 'cibil score', 'cibil', 'credit rating', 'my credit score', 'how is my credit score']
    credit_card_kw = ['credit card', 'card limit', 'credit limit', 'card balance']

    domain = "UNKNOWN"
    entity_type = "UNKNOWN"

    if any(k in msg_lower for k in cs_kw):
        domain = "CREDIT_SCORE"
        entity_type = "CREDIT_SCORE"
    elif any(k in msg_lower for k in credit_card_kw):
        domain = "CREDIT"
        entity_type = "CREDIT_CARD"
    elif is_mf:
        domain = "INVESTMENT"
        entity_type = "MUTUAL_FUND"
    elif is_stock:
        domain = "INVESTMENT"
        entity_type = "STOCKS"
    elif is_etf:
        domain = "INVESTMENT"
        entity_type = "ETF"
    elif is_bond:
        domain = "INVESTMENT"
        entity_type = "BONDS"
    elif is_fd:
        domain = "INVESTMENT"
        entity_type = "FD"
    elif is_inv_general:
        domain = "INVESTMENT"
        entity_type = "ALL"
    elif any(k in msg_lower for k in loan_kw):
        domain = "LOAN"
        entity_type = "ALL"
    elif any(k in msg_lower for k in inc_kw):
        domain = "INCOME"
        entity_type = "SALARY" if "salary" in msg_lower else "ALL"
    elif any(k in msg_lower for k in exp_kw):
        domain = "EXPENSE"
        entity_type = "GROCERIES" if "grocer" in msg_lower else ("FOOD" if "food" in msg_lower else "ALL")

    # Context Memory Resolution for Pronouns ("that", "this", "it", "last")
    if domain == "UNKNOWN" and reference and recent_history_text:
        if any(k in recent_history_text for k in mf_kw):
            domain = "INVESTMENT"
            entity_type = "MUTUAL_FUND"
        elif any(k in recent_history_text for k in stock_kw):
            domain = "INVESTMENT"
            entity_type = "STOCKS"
        elif any(k in recent_history_text for k in ['invest', 'investment']):
            domain = "INVESTMENT"
            entity_type = "ALL"
        elif any(k in recent_history_text for k in loan_kw):
            domain = "LOAN"
            entity_type = "ALL"
        elif any(k in recent_history_text for k in exp_kw):
            domain = "EXPENSE"
            entity_type = "ALL"
        elif any(k in recent_history_text for k in inc_kw):
            domain = "INCOME"
            entity_type = "ALL"

    is_partial = False
    if intent == "DELETE" and amount and domain == "INVESTMENT":
        if any(w in msg_lower for w in ['from', 'out of', 'withdraw', 'reduce', 'take out']):
            is_partial = True

    return FinancialNLU(intent, domain, entity_type, amount, is_partial, reference, is_advice)

def get_current_credit_score(current_user: User, db: Session) -> dict:
    """
    Sub-10ms READ-ONLY Retrieval Tool for Credit Score.
    Uses authoritative Python FinancialCalculator shared with Loans page.
    Directly queries database without triggering slow external API calls.
    """
    loans = db.query(Loan).filter(Loan.user_id == current_user.id).all()
    cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()

    total_loans_balance = sum(l.remaining_balance for l in loans)
    total_card_balance = sum(c.current_balance for c in cards)
    total_credit_limit = sum(c.credit_limit for c in cards)
    credit_utilization_pct = (total_card_balance / total_credit_limit * 100.0) if total_credit_limit > 0 else 0.0

    credit_eval = FinancialCalculator.calculate_dynamic_credit_score(loans, cards)
    score = credit_eval["score"]
    rating = credit_eval["rating"]

    return {
        "score": score,
        "rating": rating,
        "loans_count": len(loans),
        "cards_count": len(cards),
        "total_loan_balance": total_loans_balance,
        "total_card_balance": total_card_balance,
        "credit_utilization_pct": round(credit_utilization_pct, 1)
    }

def process_ai_agent_command(user_message: str, current_user: User, db: Session, user_context: dict, history: List[Dict[str, str]] = None) -> tuple[str, bool]:
    """
    Central AI Financial Agent Action & NLU Engine.
    Strictly performs real SQLite database operations using current_user.id.
    Handles context-aware add, update, read, and delete operations across all financial entities safely.
    Returns (reply_markdown, action_executed_boolean).
    """
    msg = (user_message or "").strip()
    msg_lower = msg.lower()
    nlu = parse_nlu_intent_and_entities(msg, history)
    amount = nlu.amount

    # 1. GREETING INTENT ("hi", "hello", "hey")
    if nlu.intent == "GREETING":
        incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
        expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
        investments = db.query(Investment).filter(Investment.user_id == current_user.id).all()
        active_loans = db.query(Loan).filter(Loan.user_id == current_user.id, Loan.status == "Active").all()
        cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()

        tot_inc = sum(i.amount for i in incomes) or 0.0
        tot_exp = sum(e.amount for e in expenses) or 0.0
        tot_inv = sum(inv.current_value for inv in investments) or 0.0
        tot_debt = sum(l.remaining_balance for l in active_loans) + sum(c.current_balance for c in cards)
        monthly_emi = sum(l.emi_amount for l in active_loans)
        net_savings = max(0.0, tot_inc - tot_exp)

        cs_data = get_current_credit_score(current_user, db)
        c_score = cs_data["score"]
        user_name = current_user.full_name or "there"

        reply = (
            f"Hello {user_name}! I am your **AI Financial Agent**. 👋\n\n"
            f"💰 **Financial Snapshot (Live Database Records):**\n\n"
            f"• **Monthly Income:** ₹{tot_inc:,.2f}\n"
            f"• **Monthly Expenses:** ₹{tot_exp:,.2f}\n"
            f"• **Net Monthly Savings:** ₹{net_savings:,.2f}\n"
            f"• **Active Debt:** ₹{tot_debt:,.2f} (EMI: ₹{monthly_emi:,.2f}/mo)\n"
            f"• **Credit Score:** {c_score} / 900\n"
            f"• **Investments:** ₹{tot_inv:,.2f}\n\n"
            f"💡 *What would you like to view, add, update, or delete today?*"
        )
        return reply, False

    # 2. SUMMARY INTENT ("financial summary", "how am i doing financially")
    if nlu.intent == "SUMMARY":
        incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
        expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
        investments = db.query(Investment).filter(Investment.user_id == current_user.id).all()
        active_loans = db.query(Loan).filter(Loan.user_id == current_user.id, Loan.status == "Active").all()
        
        tot_inc = sum(i.amount for i in incomes) or 0.0
        tot_exp = sum(e.amount for e in expenses) or 0.0
        tot_inv = sum(inv.current_value for inv in investments) or 0.0
        tot_loan = sum(l.remaining_balance for l in active_loans) or 0.0
        net_savings = max(0.0, tot_inc - tot_exp)

        cs_data = get_current_credit_score(current_user, db)
        c_score = cs_data["score"]

        reply = (
            f"📊 **Your Real-Time Central Financial Summary:**\n\n"
            f"• **Monthly Income:** ₹{tot_inc:,.2f}\n"
            f"• **Monthly Expenses:** ₹{tot_exp:,.2f}\n"
            f"• **Investments:** ₹{tot_inv:,.2f}\n"
            f"• **Outstanding Loans:** ₹{tot_loan:,.2f}\n"
            f"• **Credit Score:** {c_score} / 900\n"
            f"• **Savings (Net Cash Flow):** ₹{net_savings:,.2f}\n\n"
            f"💡 *All figures retrieved directly from your existing application modules.*"
        )
        return reply, False

    # 3. READ INTENT ("show my mutual fund status", "show my loans", "what is my credit score")
    if nlu.intent == "READ":
        # 3A. READ INVESTMENT DATA
        if nlu.domain == "INVESTMENT":
            query = db.query(Investment).filter(Investment.user_id == current_user.id)
            all_invs = query.all()

            if nlu.entity_type == "MUTUAL_FUND":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['mutual fund', 'mutualfund', 'mf', 'sip'])]
                entity_label = "Mutual Fund"
            elif nlu.entity_type == "STOCKS":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['stock', 'stocks', 'share', 'equity'])]
                entity_label = "Stock"
            elif nlu.entity_type == "ETF":
                matches = [i for i in all_invs if 'etf' in (i.asset_type + " " + i.asset_name).lower()]
                entity_label = "ETF"
            elif nlu.entity_type == "BONDS":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['bond', 'bonds', 'sgb'])]
                entity_label = "Bond"
            elif nlu.entity_type == "FD":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['fd', 'fixed deposit'])]
                entity_label = "Fixed Deposit"
            else:
                matches = list(all_invs)
                entity_label = "Investment"

            if not matches:
                return f"📈 You currently have **₹0.00** recorded in **{entity_label}** investments in your database.", False

            tot_val = sum(i.current_value for i in matches)
            tot_cost = sum(i.amount_invested for i in matches)
            items_str = "\n".join([f"• **{i.asset_name}** ({i.asset_type}): Invested ₹{i.amount_invested:,.2f} | Current Value: **₹{i.current_value:,.2f}**" for i in matches])

            return (
                f"📊 **Your {entity_label} Status (Live Database Records):**\n\n"
                f"{items_str}\n\n"
                f"• **Total Invested in {entity_label}:** ₹{tot_cost:,.2f}\n"
                f"• **Current {entity_label} Portfolio Value:** **₹{tot_val:,.2f}**\n"
                f"• **Total Holding Entries:** {len(matches)}"
            ), False

        # 3B. READ CREDIT SCORE DATA
        elif nlu.domain == "CREDIT_SCORE":
            cs_data = get_current_credit_score(current_user, db)
            score_val = cs_data["score"]
            rating = cs_data["rating"]

            return (
                f"💳 **Your Current Credit Score:**\n\n"
                f"• **Credit Score:** **{score_val} / 900**\n"
                f"• **Rating:** **{rating}**\n"
                f"• **Active Loans:** {cs_data['loans_count']}\n"
                f"• **Credit Cards:** {cs_data['cards_count']}\n"
                f"• **Credit Utilization:** {cs_data['credit_utilization_pct']}%\n\n"
                f"💡 *Read directly from the existing Loans & Credit module of your application.*"
            ), False

        # 3C. READ LOANS DATA
        elif nlu.domain == "LOAN":
            active_loans = db.query(Loan).filter(Loan.user_id == current_user.id, Loan.status == "Active").all()
            if active_loans:
                tot_bal = sum(l.remaining_balance for l in active_loans)
                tot_emi = sum(l.emi_amount for l in active_loans)
                items_str = "\n".join([f"• **{l.loan_name}** ({l.loan_type}): Balance ₹{l.remaining_balance:,.2f} | EMI: **₹{l.emi_amount:,.2f}/mo**" for l in active_loans])
                return (
                    f"🏦 **Your Outstanding Loans (Live Database Records):**\n\n"
                    f"{items_str}\n\n"
                    f"• **Total Remaining Loan Balance:** **₹{tot_bal:,.2f}**\n"
                    f"• **Total Monthly EMI:** **₹{tot_emi:,.2f}**"
                ), False
            else:
                return "🏦 You currently have **0 active loans** (₹0.00 outstanding) recorded in your database.", False

        # 3D. READ INCOME DATA
        elif nlu.domain == "INCOME":
            incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
            tot_inc = sum(i.amount for i in incomes) or 0.0
            if incomes:
                items_str = "\n".join([f"• **{i.title}** ({i.source}): ₹{i.amount:,.2f}" for i in incomes])
                return f"💵 **Your Current Income Profile (Database Record):**\n\n{items_str}\n\n• **Total Monthly Income:** **₹{tot_inc:,.2f}**", False
            else:
                return "💵 You currently have **₹0.00** recorded for monthly income in your database.", False

        # 3E. READ EXPENSE DATA
        elif nlu.domain == "EXPENSE":
            expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
            tot_exp = sum(e.amount for e in expenses) or 0.0
            if expenses:
                items_str = "\n".join([f"• **{e.title}** ({e.category}): ₹{e.amount:,.2f}" for e in expenses[-5:]])
                return f"🛒 **Your Total Monthly Expenses (Database Record):** **₹{tot_exp:,.2f}** across {len(expenses)} expense entries.\n\n**Recent Entries:**\n{items_str}", False
            else:
                return "🛒 You currently have **₹0.00** recorded in expenses in your database.", False

        # 3F. READ CREDIT CARD DATA
        elif nlu.domain == "CREDIT":
            cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()
            if cards:
                items_str = "\n".join([f"• **{c.card_name}**: Limit ₹{c.credit_limit:,.2f} | Balance: **₹{c.current_balance:,.2f}**" for c in cards])
                return f"💳 **Your Credit Card Accounts:**\n\n{items_str}", False
            else:
                return "💳 No credit card accounts recorded in your database.", False

    # 4. DELETE INTENT ("delete my mutual fund", "remove ₹20,000 from mutual funds", "remove that")
    if nlu.intent == "DELETE":
        if nlu.domain == "INVESTMENT":
            query = db.query(Investment).filter(Investment.user_id == current_user.id)
            all_invs = query.all()

            if not all_invs:
                return "📈 No investment records found in your database to delete.", False

            if nlu.entity_type == "MUTUAL_FUND":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['mutual fund', 'mutualfund', 'mf', 'sip'])]
                entity_label = "Mutual Fund"
            elif nlu.entity_type == "STOCKS":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['stock', 'stocks', 'share', 'equity'])]
                entity_label = "Stock"
            elif nlu.entity_type == "ETF":
                matches = [i for i in all_invs if 'etf' in (i.asset_type + " " + i.asset_name).lower()]
                entity_label = "ETF"
            elif nlu.entity_type == "BONDS":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['bond', 'bonds', 'sgb'])]
                entity_label = "Bond"
            elif nlu.entity_type == "FD":
                matches = [i for i in all_invs if any(kw in (i.asset_type + " " + i.asset_name).lower() for kw in ['fd', 'fixed deposit'])]
                entity_label = "Fixed Deposit"
            else:
                matches = list(all_invs)
                entity_label = "Investment"

            if not matches:
                amt_str = f" of ₹{amount:,.2f}" if amount else ""
                return f"📈 No matching {entity_label} record found in your database{amt_str} to delete.", False

            # Check Partial Amount Withdrawal (e.g., "remove ₹20,000 from mutual funds")
            if nlu.is_partial and amount and amount > 0:
                holding = sorted(matches, key=lambda x: x.id, reverse=True)[0]
                if holding.current_value > amount:
                    old_val = holding.current_value
                    holding.amount_invested = max(0.0, holding.amount_invested - amount)
                    holding.current_value = max(0.0, holding.current_value - amount)
                    db.commit()

                    rem_invs = db.query(Investment).filter(Investment.user_id == current_user.id).all()
                    tot_inv = sum(i.current_value for i in rem_invs)

                    return (
                        f"**Intent Detected:** Partial Investment Withdrawal\n"
                        f"**Action Executed:** `update_investment()`\n"
                        f"**Status:** Success ✅\n\n"
                        f"• Holding: **{holding.asset_name}**\n"
                        f"• Reduced Amount: ₹{old_val:,.2f} ➔ **₹{holding.current_value:,.2f}** (Withdrew ₹{amount:,.2f})\n"
                        f"• Updated Total Portfolio Value: **₹{tot_inv:,.2f}**\n\n"
                        f"**Investment Module & Dashboard Synchronized ✅**"
                    ), True

            if amount and amount > 0:
                matches_amt = [i for i in matches if i.amount_invested == amount or i.current_value == amount]
                if matches_amt:
                    matches = matches_amt

            if len(matches) == 1 or nlu.reference or "confirm" in msg_lower:
                target_inv = sorted(matches, key=lambda x: x.id, reverse=True)[0]
                inv_name = target_inv.asset_name
                inv_amt = target_inv.amount_invested

                db.delete(target_inv)
                db.commit()

                rem_invs = db.query(Investment).filter(Investment.user_id == current_user.id).all()
                tot_inv = sum(i.current_value for i in rem_invs)

                return (
                    f"**Intent Detected:** Delete Investment\n"
                    f"**Action Executed:** `delete_investment()`\n"
                    f"**Status:** Success ✅\n\n"
                    f"• Deleted Record: **{inv_name}** (₹{inv_amt:,.2f})\n"
                    f"• Updated Total Portfolio Value: **₹{tot_inv:,.2f}**\n\n"
                    f"**Investment Module & Dashboard Synchronized ✅**"
                ), True
            else:
                items_list = "\n".join([f"{idx+1}. **{i.asset_name}** — ₹{i.amount_invested:,.2f} ({i.asset_type})" for idx, i in enumerate(matches)])
                return (
                    f"⚠️ **Multiple Matching {entity_label} Records Found:**\n\n{items_list}\n\n"
                    f"Please reply with *\"Delete the one I just added\"* or specify which {entity_label} to remove."
                ), False

        elif nlu.domain == "LOAN":
            active_loans = db.query(Loan).filter(Loan.user_id == current_user.id).all()
            if not active_loans:
                return "🏦 No loan records found in your database to delete.", False

            matches = list(active_loans)
            if amount and amount > 0:
                matches = [l for l in matches if l.total_amount == amount or l.remaining_balance == amount]

            if not matches:
                amt_str = f" of ₹{amount:,.2f}" if amount else ""
                return f"🏦 No matching loan record found in your database{amt_str} to delete.", False

            if len(matches) == 1 or nlu.reference or "confirm" in msg_lower:
                target_loan = sorted(matches, key=lambda x: x.id, reverse=True)[0]
                loan_name = target_loan.loan_name
                loan_amt = target_loan.total_amount
                db.delete(target_loan)
                db.commit()

                return (
                    f"**Intent Detected:** Delete Loan Account\n"
                    f"**Action Executed:** `delete_loan()`\n"
                    f"**Status:** Success ✅\n\n"
                    f"• Deleted Account: **{loan_name}** (₹{loan_amt:,.2f})\n\n"
                    f"**Loan Module & Dashboard Synchronized ✅**"
                ), True

        elif nlu.domain == "EXPENSE":
            expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
            if not expenses:
                return "🛒 No expense records found in your database to delete.", False

            matches = list(expenses)
            if amount and amount > 0:
                matches = [e for e in matches if e.amount == amount]

            if not matches:
                amt_str = f" of ₹{amount:,.2f}" if amount else ""
                return f"🛒 No matching expense record found in your database{amt_str} to delete.", False

            target_exp = sorted(matches, key=lambda x: x.id, reverse=True)[0]
            exp_amt = target_exp.amount
            exp_title = target_exp.title

            db.delete(target_exp)
            db.commit()

            return (
                f"**Intent Detected:** Delete Expense\n"
                f"**Action Executed:** `delete_expense()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Removed Expense: **₹{exp_amt:,.2f}** ({exp_title})\n\n"
                f"**Dashboard Synchronized ✅**"
            ), True

        elif nlu.domain == "INCOME":
            incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
            if not incomes:
                return "💵 No income records found in your database to delete.", False

            matches = list(incomes)
            if amount and amount > 0:
                matches = [i for i in matches if i.amount == amount]

            if not matches:
                amt_str = f" of ₹{amount:,.2f}" if amount else ""
                return f"💵 No matching income record found in your database{amt_str} to delete.", False

            target_inc = sorted(matches, key=lambda x: x.id, reverse=True)[0]
            inc_amt = target_inc.amount
            inc_title = target_inc.title

            db.delete(target_inc)
            db.commit()

            return (
                f"**Intent Detected:** Delete Income Record\n"
                f"**Action Executed:** `delete_income()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Removed Income: **₹{inc_amt:,.2f}** ({inc_title})\n\n"
                f"**Dashboard Synchronized ✅**"
            ), True

    # 5. CREATE INTENT ("add ₹50,000 to mutual funds", "add ₹2,000 groceries")
    if nlu.intent == "CREATE" and amount and amount > 0:
        if nlu.domain == "INVESTMENT":
            asset_type = "Mutual Funds" if nlu.entity_type == "MUTUAL_FUND" else \
                         "Stocks" if nlu.entity_type == "STOCKS" else \
                         "ETFs" if nlu.entity_type == "ETF" else \
                         "Bonds" if nlu.entity_type == "BONDS" else \
                         "FD" if nlu.entity_type == "FD" else "Mutual Funds"

            asset_name = f"{asset_type} Investment"
            new_inv = Investment(
                user_id=current_user.id,
                asset_name=asset_name,
                asset_type=asset_type,
                amount_invested=amount,
                current_value=amount,
                risk_level="Moderate"
            )
            db.add(new_inv)
            db.commit()

            all_inv = db.query(Investment).filter(Investment.user_id == current_user.id).all()
            tot_inv = sum(i.current_value for i in all_inv)

            return (
                f"**Intent Detected:** Add Investment\n"
                f"**Action Executed:** `add_investment()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Investment Recorded: **₹{amount:,.2f}**\n"
                f"• Asset Category: **{asset_type}**\n"
                f"• Total Portfolio Value: **₹{tot_inv:,.2f}**\n\n"
                f"**Investment Module & Dashboard Synchronized ✅**"
            ), True

        elif nlu.domain == "LOAN":
            loan_type = "Personal Loan"
            rate = 10.5
            tenure = 36
            emi_res = FinancialCalculator.calculate_emi(amount, rate, tenure)
            emi_val = emi_res['emi']

            new_loan = Loan(
                user_id=current_user.id,
                loan_name=f"New {loan_type}",
                loan_type=loan_type,
                total_amount=amount,
                remaining_balance=amount,
                interest_rate=rate,
                emi_amount=emi_val,
                tenure_months=tenure,
                status="Active"
            )
            db.add(new_loan)
            db.commit()

            return (
                f"**Intent Detected:** Add New Loan Account\n"
                f"**Action Executed:** `add_loan()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Loan Type: **{loan_type}**\n"
                f"• Principal Amount Added: **₹{amount:,.2f}**\n"
                f"• Estimated Monthly EMI: **₹{emi_val:,.2f}** ({rate}% for {tenure} months)\n\n"
                f"**Loan Module & Dashboard Synchronized ✅**"
            ), True

        elif nlu.domain == "EXPENSE":
            cat = "Groceries" if nlu.entity_type == "GROCERIES" else ("Food" if nlu.entity_type == "FOOD" else "Miscellaneous")
            new_exp = Expense(user_id=current_user.id, title=f"{cat} Expense", category=cat, amount=amount, date=datetime.utcnow())
            db.add(new_exp)
            db.commit()

            expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
            tot_exp = sum(e.amount for e in expenses)

            return (
                f"**Intent Detected:** Add Expense\n"
                f"**Action Executed:** `add_expense()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Amount Recorded: **₹{amount:,.2f}** ({cat})\n"
                f"• Total Monthly Expenses: **₹{tot_exp:,.2f}**\n\n"
                f"**Dashboard Synchronized ✅**"
            ), True

        elif nlu.domain == "INCOME":
            sal = db.query(Income).filter(Income.user_id == current_user.id, Income.source == "Salary").first()
            if sal:
                if any(w in msg_lower for w in ['add', 'increase', 'extra', 'added']):
                    sal.amount += amount
                else:
                    sal.amount = amount
            else:
                db.add(Income(user_id=current_user.id, title="Monthly Salary", source="Salary", amount=amount, frequency="Monthly"))
            db.commit()

            incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
            tot_inc = sum(i.amount for i in incomes)

            return (
                f"**Intent Detected:** Set Salary / Income\n"
                f"**Action Executed:** `update_income()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Updated Salary: **₹{amount:,.2f}/month**\n"
                f"• Total Monthly Income: **₹{tot_inc:,.2f}**\n\n"
                f"**All Modules & Dashboard Synchronized ✅**"
            ), True

    # 6. UPDATE INTENT ("change my mutual fund investment to ₹60,000")
    if nlu.intent == "UPDATE" and amount and amount > 0:
        if nlu.domain == "INVESTMENT":
            invs = db.query(Investment).filter(Investment.user_id == current_user.id).order_by(Investment.id.desc()).all()
            if invs:
                target_inv = invs[0]
                old_amt = target_inv.amount_invested
                target_inv.amount_invested = amount
                target_inv.current_value = amount
                db.commit()

                return (
                    f"**Intent Detected:** Update Investment Amount\n"
                    f"**Action Executed:** `update_investment()`\n"
                    f"**Status:** Success ✅\n\n"
                    f"• Investment: **{target_inv.asset_name}**\n"
                    f"• Updated Amount: ₹{old_amt:,.2f} ➔ **₹{amount:,.2f}**\n\n"
                    f"**Investment Module & Dashboard Synchronized ✅**"
                ), True

        elif nlu.domain == "LOAN":
            loans = db.query(Loan).filter(Loan.user_id == current_user.id, Loan.status == "Active").order_by(Loan.id.desc()).all()
            if loans:
                target_loan = loans[0]
                old_amt = target_loan.total_amount
                target_loan.total_amount = amount
                target_loan.remaining_balance = amount
                db.commit()

                return (
                    f"**Intent Detected:** Update Loan Principal Amount\n"
                    f"**Action Executed:** `update_loan()`\n"
                    f"**Status:** Success ✅\n\n"
                    f"• Loan Account: **{target_loan.loan_name}**\n"
                    f"• Updated Principal: ₹{old_amt:,.2f} ➔ **₹{amount:,.2f}**\n\n"
                    f"**Loan Module & Dashboard Synchronized ✅**"
                ), True

        elif nlu.domain == "INCOME":
            incomes = db.query(Income).filter(Income.user_id == current_user.id).order_by(Income.id.desc()).all()
            if incomes:
                target_inc = incomes[0]
                old_amt = target_inc.amount
                target_inc.amount = amount
            else:
                target_inc = Income(user_id=current_user.id, title="Monthly Salary", source="Salary", amount=amount, frequency="Monthly")
                db.add(target_inc)
            db.commit()

            return (
                f"**Intent Detected:** Update Salary / Income\n"
                f"**Action Executed:** `update_income()`\n"
                f"**Status:** Success ✅\n\n"
                f"• Updated Amount to: **₹{amount:,.2f}**\n\n"
                f"**Dashboard & All Modules Synchronized ✅**"
            ), True

    return "", False


@router.post("/chat", response_model=ChatResponse)
def chat_with_agent(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Central AI Financial Agent Chat Endpoint.
    Strictly reads and writes live SQLite database records for authenticated current_user.
    """
    try:
        incomes = db.query(Income).filter(Income.user_id == current_user.id).all()
        expenses = db.query(Expense).filter(Expense.user_id == current_user.id).all()
        investments = db.query(Investment).filter(Investment.user_id == current_user.id).all()
        active_loans = db.query(Loan).filter(Loan.user_id == current_user.id, Loan.status == "Active").all()
        cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()

        tot_inc = sum(i.amount for i in incomes) or 0.0
        tot_exp = sum(e.amount for e in expenses) or 0.0
        tot_debt = sum(l.remaining_balance for l in active_loans) + sum(c.current_balance for c in cards)
        monthly_emi = sum(l.emi_amount for l in active_loans)
        
        cs_data = get_current_credit_score(current_user, db)
        c_score = cs_data["score"]

        user_context = {
            "user_name": current_user.full_name or current_user.email,
            "monthly_income": tot_inc,
            "monthly_expenses": tot_exp,
            "net_savings": max(0.0, tot_inc - tot_exp),
            "total_debt": tot_debt,
            "monthly_emi": monthly_emi,
            "credit_score": c_score,
            "investments_summary": [{"asset": i.asset_name, "value": i.current_value} for i in investments],
            "active_loans": [{"loan": l.loan_name, "balance": l.remaining_balance, "emi": l.emi_amount} for l in active_loans]
        }

        history_records = db.query(ChatHistory).filter(
            ChatHistory.user_id == current_user.id,
            ChatHistory.session_id == req.session_id
        ).order_by(ChatHistory.timestamp.asc()).all()

        history = [{"sender": h.sender, "message": h.message} for h in history_records[-6:]]

        # 1. Process Command via Action & NLU Engine
        tool_reply, action_done = process_ai_agent_command(req.message, current_user, db, user_context, history)

        if tool_reply:
            ai_reply = tool_reply
        else:
            # Fallback to LLM / Gemini Service with real DB context
            ai_reply = gemini_service.chat_assistant(req.message, user_context, history)

        # Record User Chat in DB
        db.add(ChatHistory(
            user_id=current_user.id,
            session_id=req.session_id,
            sender="user",
            message=req.message,
            context_used_json=user_context
        ))

        # Record AI Chat in DB
        db.add(ChatHistory(
            user_id=current_user.id,
            session_id=req.session_id,
            sender="ai",
            message=ai_reply,
            context_used_json=user_context
        ))
        db.commit()

        return ChatResponse(
            sender="ai",
            message=ai_reply,
            action_executed=action_done,
            timestamp=datetime.utcnow()
        )

    except Exception as e:
        error_logger.error(f"Error in AI Financial Agent: {str(e)}")
        db.rollback()
        return ChatResponse(
            sender="ai",
            message=f"I couldn't process your financial request because a database operation error occurred. Your existing records have not been changed. Details: {str(e)}",
            action_executed=False,
            timestamp=datetime.utcnow()
        )

@router.get("/chat/history")
def get_chat_history(
    session_id: str = "default",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id,
        ChatHistory.session_id == session_id
    ).order_by(ChatHistory.timestamp.asc()).all()

@router.get("/sessions")
def get_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chats = db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.timestamp.asc()).all()

    sessions_map = {}
    for c in chats:
        sid = c.session_id or "default"
        clean_msg = (c.message or "").strip().replace("\n", " ")
        is_user = c.sender == "user"

        if sid not in sessions_map:
            title = (clean_msg[:35] + "...") if len(clean_msg) > 35 else clean_msg if (is_user and clean_msg) else "Financial Conversation"
            sessions_map[sid] = {
                "session_id": sid,
                "title": title if title else "Financial Conversation",
                "has_user_title": is_user and bool(clean_msg),
                "last_updated": c.timestamp,
                "message_count": 1
            }
        else:
            sessions_map[sid]["message_count"] += 1
            sessions_map[sid]["last_updated"] = c.timestamp
            if is_user and clean_msg and not sessions_map[sid]["has_user_title"]:
                sessions_map[sid]["title"] = (clean_msg[:35] + "...") if len(clean_msg) > 35 else clean_msg
                sessions_map[sid]["has_user_title"] = True

    session_list = list(sessions_map.values())
    session_list.sort(key=lambda s: s["last_updated"], reverse=True)
    return session_list

@router.delete("/session/{session_id}")
def delete_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id,
        ChatHistory.session_id == session_id
    ).delete()
    db.commit()
    return {"message": f"Session {session_id} deleted successfully"}

@router.delete("/clear-all-sessions")
def clear_all_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(ChatHistory).filter(ChatHistory.user_id == current_user.id).delete()
    db.commit()
    return {"message": "All chat history cleared successfully"}
