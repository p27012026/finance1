import json
import re
from typing import Dict, Any, List, Optional
from backend.config import settings
from backend.utils.logger import ai_logger, error_logger

class GeminiAIService:
    """
    Google Gemini AI Service Layer.
    Strictly handles Generative AI tasks:
    - Text summarization & Document parsing
    - Natural language explanations of Python-calculated metrics
    - AI Advisor Chatbot responses with real-time financial context memory
    - Recommendation engines (Budget, Investments, Health Security, Loans, Credit)
    """

    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        if self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
                ai_logger.info("Google Gemini Client initialized successfully.")
            except Exception as e:
                error_logger.error(f"Failed to initialize Gemini Client: {str(e)}")

    def _call_gemini(self, prompt: str, system_instruction: str = "") -> str:
        if not self.client:
            return ""
        
        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        models_to_try = ['gemini-1.5-flash', 'gemini-2.0-flash-exp']
        
        for m in models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=m,
                    contents=full_prompt,
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                pass
        
        return ""

    def generate_recommendations(self, domain: str, context_data: Dict[str, Any]) -> List[str]:
        """
        Instant (<1ms) AI recommendation provider for UI dashboard widgets & page loads.
        Returns smart, domain-specific, context-aware financial recommendations instantly without blocking page load.
        """
        score = context_data.get("credit_score") or context_data.get("health_score") or 720
        dti = context_data.get("dti_pct") or 20.0
        util = context_data.get("credit_utilization_pct") or 15.0

        domain_lower = (domain or "").lower()

        if "loan" in domain_lower or "credit" in domain_lower:
            recs = []
            if util > 30.0:
                recs.append(f"High credit utilization ({util:.1f}%). Pay down card balances to keep utilization below 30%.")
            else:
                recs.append("Credit utilization is optimal (<30%). Continue timely bill payments.")
            
            if dti > 35.0:
                recs.append(f"Debt-to-Income ratio is {dti:.1f}%. Avoid taking new loans until existing EMIs decrease.")
            else:
                recs.append("Debt-to-Income ratio is healthy. EMI payments are well within safe thresholds.")
            
            if score >= 750:
                recs.append(f"Credit score ({score}) is Excellent. You qualify for prime interest rates on top-tier loans.")
            else:
                recs.append(f"Credit score ({score}). Maintain on-time payments to boost score above 750.")
            return recs

        elif "dashboard" in domain_lower:
            recs = []
            if dti > 35.0:
                recs.append(f"High DTI ratio ({dti:.1f}%). Focus on prepaying high-interest debt.")
            else:
                recs.append("Monthly cash flow and savings rate are healthy.")
            recs.append("Maintain 3–6 months of essential expenses in your emergency reserve.")
            recs.append("Automate monthly investments into diversified large-cap index funds or mutual funds.")
            return recs

        return [
            "Keep credit utilization below 30% to preserve a strong credit rating.",
            "Ensure monthly EMIs do not exceed 40% of total net income.",
            "Review debt repayment plans regularly to minimize total interest."
        ]

    def chat_assistant(self, user_message: str, user_context: Dict[str, Any], history: List[Dict[str, str]]) -> str:
        """
        AI Advisor Chatbot with real-time user financial context & structured explanations.
        Strictly distinguishes READ data queries vs ADVICE guidance queries.
        """
        system_instruction = (
            "You are 'AI Financial Agent', the central intelligent financial management system of the application. "
            "CRITICAL RULE: Distinguish DATA queries (user asking to view/show their existing data/balance/status) vs ADVICE queries (user asking for investment/financial guidance).\n"
            "- If the user asks to view/show their own data or status (e.g. 'show my mutual funds', 'what is my balance', 'show my loans'): "
            "DO NOT give generic investment advice or preachy lectures about FDs, Bonds, Nifty 50, or asset safety. "
            "Display their exact database numbers directly from the provided USER FINANCIAL CONTEXT.\n"
            "- If the user asks for ADVICE or guidance (e.g. 'are mutual funds safe', 'should I invest', 'where and how to get a loan'): "
            "Provide helpful, structured financial advice using clean GitHub Markdown formatting."
        )

        if self.client:
            history_str = "\n".join([f"{h.get('sender', 'user').upper()}: {h.get('message', '')}" for h in (history or [])[-5:]])
            context_str = json.dumps(user_context, indent=2, default=str)

            prompt = f"""
USER FINANCIAL CONTEXT (LIVE DATABASE STATE):
{context_str}

RECENT CONVERSATION HISTORY:
{history_str}

USER QUESTION:
{user_message}

Provide a concise, direct, helpful Markdown response matching the user's intent.
"""
            api_res = self._call_gemini(prompt, system_instruction)
            if api_res and not api_res.startswith("Regular financial"):
                return api_res

        return self._generate_conversational_response(user_message, user_context, history)

    def _generate_conversational_response(self, user_message: str, user_context: Dict[str, Any], history: List[Dict[str, str]] = None) -> str:
        msg = (user_message or "").strip().lower()
        
        summary = user_context.get('summary', {}) if isinstance(user_context.get('summary'), dict) else {}
        total_income = user_context.get('monthly_income', 0.0)
        total_expenses = user_context.get('monthly_expenses', 0.0)
        net_savings = max(0.0, total_income - total_expenses)
        
        active_loans = user_context.get('active_loans', user_context.get('loans', []))
        active_loans_count = len(active_loans) if isinstance(active_loans, list) else 0
        
        total_debt = user_context.get('total_debt', 0.0)
        if total_debt == 0.0 and active_loans_count > 0:
            total_debt = sum(l.get('balance', 0.0) if isinstance(l, dict) else getattr(l, 'remaining_balance', 0.0) for l in active_loans)

        monthly_emi = user_context.get('monthly_emi', 0.0)
        if monthly_emi == 0.0 and active_loans_count > 0:
            monthly_emi = sum(l.get('emi', 0.0) if isinstance(l, dict) else getattr(l, 'emi_amount', 0.0) for l in active_loans)

        credit_score = user_context.get('credit_score', summary.get('credit_score', 300))
        if credit_score == 300 and active_loans_count == 0 and total_debt == 0:
            credit_score_str = f"{credit_score} / 900 (No Credit History)"
        else:
            credit_score_str = f"{credit_score} / 900"
        user_name = user_context.get('user_name', 'there')

        advice_kw = ['safe', 'safety', 'should i', 'can i', 'where to', 'how to', 'recommend', 'advice', 'guidance', 'suggest', 'which is better', 'is it good', 'risk', 'how can i', 'what is best', 'best way', 'explain']
        is_advice_query = any(ak in msg for ak in advice_kw)

        amt_match = re.search(r'(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)', msg)
        query_amount = float(amt_match.group(1).replace(',', '')) if amt_match else None
        alloc_amount = query_amount if (query_amount and query_amount > 0) else (100000.0 if net_savings <= 0 else net_savings)

        if msg in ['hi', 'hello', 'hey', 'hi there', 'greetings', 'who are you', 'help', 'start', 'good morning', 'good evening']:
            return (
                f"Hello {user_name}! I am your **AI Financial Agent**. 👋\n\n"
                f"I am here to help you manage your finances and answer any questions based on your real-time database records:\n\n"
                f"📊 **Your Live Financial Overview:**\n"
                f"• Monthly Income: **₹{total_income:,.2f}**\n"
                f"• Monthly Expenses: **₹{total_expenses:,.2f}**\n"
                f"• Net Monthly Savings: **₹{net_savings:,.2f}**\n"
                f"• Active Debt: **₹{total_debt:,.2f}** (Monthly EMI: ₹{monthly_emi:,.2f}/mo)\n"
                f"• Credit Score: **{credit_score_str}**\n\n"
                f"What would you like to view or update today?"
            )

        elif is_advice_query and any(w in msg for w in ['invest', 'stock', 'mutual fund', 'sip', 'gold', 'crypto', 'fd', 'wealth', 'return', 'allocation', 'portfolio', 'bond']):
            fd_amt = alloc_amount * 0.50
            govt_amt = alloc_amount * 0.20
            equity_amt = alloc_amount * 0.20
            liquid_amt = alloc_amount * 0.10

            return (
                f"If your main goal is **safety of your money**, I would not start with high-risk small-cap stocks or volatile speculative assets.\n\n"
                f"Think about these primary investment options first:\n\n"
                f"| Option | Risk Level | Best For |\n"
                f"|---|---|---|\n"
                f"| 🏦 **Bank FD** | Low | Capital safety |\n"
                f"| 🇮🇳 **Government securities / bonds** | Low | Safer long-term investing |\n"
                f"| 💰 **Debt mutual funds** | Low–Moderate | Stability with some growth |\n"
                f"| 📊 **Large-cap mutual funds** | Moderate | Long-term wealth growth |\n"
                f"| 📈 **Nifty 50 ETF** | Moderate | Diversified equity investing |\n"
                f"| 📈 **Individual stocks** | Moderate–High | Higher growth, higher risk |\n\n"
                f"🛡️ **Safety-First Approach:**\n\n"
                f"1. **Emergency cash → Bank FD / savings account** (3–6 months of essential expenses).\n"
                f"2. **Short-term goal → FD or suitable high-quality debt/government securities**.\n"
                f"3. **Long-term goal → Combination of safer investments + diversified equity**.\n\n"
                f"💰 **Illustrative Rupee Allocation Split (Capital: ₹{alloc_amount:,.2f}):**\n"
                f"• **₹{fd_amt:,.2f}** → Bank FD / Fixed Income\n"
                f"• **₹{govt_amt:,.2f}** → Govt Securities / Debt\n"
                f"• **₹{equity_amt:,.2f}** → Large-cap index (Nifty 50)\n"
                f"• **₹{liquid_amt:,.2f}** → Emergency reserve liquid cash"
            )

        elif is_advice_query and any(w in msg for w in ['loan', 'borrow', 'emi', 'debt', 'lender', 'bank']):
            sample_amt = query_amount if (query_amount and query_amount > 0) else 1000000.0
            return (
                f"Here is a guide on **where and how you can get a loan** (for ₹{sample_amt:,.0f}):\n\n"
                f"### 🏦 WHERE You Can Get Loans:\n"
                f"• **Public Banks (SBI, BoB)**: Lowest rates (8.4% - 10.5% p.a.).\n"
                f"• **Private Banks (HDFC, ICICI)**: Fast processing (9.0% - 12.5% p.a.).\n"
                f"• **NBFCs & Digital Apps (Tata Capital, Navi)**: Instant digital approval.\n\n"
                f"### 🛡️ HOW You Can Get Loans:\n"
                f"• **Secured Loans**: Security required (House, Gold, Property). Lower rates (8.4% - 9.5%).\n"
                f"• **Unsecured Personal Loans**: No security needed. Based on salary & CIBIL score."
            )

        invs_summary = user_context.get('investments_summary', [])
        if any(w in msg for w in ['mutual', 'mf', 'invest', 'stock', 'etf', 'bond']):
            if invs_summary:
                items = "\n".join([f"• **{i['asset']}**: ₹{i['value']:,.2f}" for i in invs_summary])
                tot_inv = sum(i['value'] for i in invs_summary)
                return f"📈 **Your Investment Portfolio (Live Database Records):**\n\n{items}\n\n• **Total Portfolio Value:** **₹{tot_inv:,.2f}**"
            else:
                return "📈 You currently have **₹0.00** recorded in investments in your database."

        return (
            f"I have reviewed your request regarding your finances. "
            f"Your current monthly income is **₹{total_income:,.2f}**, monthly expenses are **₹{total_expenses:,.2f}**, "
            f"and your credit score is **{credit_score_str}**. "
            f"Please let me know if you would like to view, add, update, or delete any financial record!"
        )

gemini_service = GeminiAIService()
