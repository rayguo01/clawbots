import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { ezbFetch, ensureAuthenticated } from "./ezbookkeeping-api.js";

// ── Tool names ────────────────────────────────────────────────

export const TOOL_NAMES = [
  "bookkeeping_add_expense",
  "bookkeeping_add_income",
  "bookkeeping_list",
  "bookkeeping_stats",
  "bookkeeping_categories",
  "bookkeeping_accounts",
  "bookkeeping_delete",
];

// ── Schemas ───────────────────────────────────────────────────

const AddTransactionSchema = Type.Object({
  amount: Type.Number({ description: "Amount in currency units (e.g. 15.5)." }),
  categoryName: Type.String({
    description:
      "Category name (e.g. '餐饮', '交通'). Use bookkeeping_categories to see available options.",
  }),
  comment: Type.Optional(Type.String({ description: "Note or description for this transaction." })),
  time: Type.Optional(
    Type.String({ description: "ISO 8601 datetime string. Defaults to current time if omitted." }),
  ),
  accountName: Type.Optional(
    Type.String({ description: "Account name. Uses default account if omitted." }),
  ),
  currency: Type.Optional(
    Type.String({
      description:
        "ISO 4217 currency code for the user's account (e.g. 'SGD', 'CNY', 'USD', 'EUR', 'JPY', 'MYR', 'THB'). " +
        "Only used on first transaction to set up the user's bookkeeping account. " +
        "Infer from user's timezone/locale: Asia/Singapore→SGD, Asia/Shanghai→CNY, America/New_York→USD, Europe/London→GBP, Asia/Tokyo→JPY, Asia/Kuala_Lumpur→MYR, Asia/Bangkok→THB.",
    }),
  ),
});

const ListTransactionsSchema = Type.Object({
  startDate: Type.Optional(
    Type.String({ description: "Start date (YYYY-MM-DD). Defaults to 30 days ago." }),
  ),
  endDate: Type.Optional(Type.String({ description: "End date (YYYY-MM-DD). Defaults to today." })),
  type: Type.Optional(
    Type.Number({
      description: "Transaction type: 0=All, 2=Income, 3=Expense. Defaults to 0.",
      minimum: 0,
      maximum: 4,
    }),
  ),
  keyword: Type.Optional(Type.String({ description: "Search keyword in comments." })),
  count: Type.Optional(
    Type.Number({
      description: "Number of results (1-50). Defaults to 25.",
      minimum: 1,
      maximum: 50,
    }),
  ),
});

const StatsSchema = Type.Object({
  startDate: Type.String({ description: "Start date (YYYY-MM-DD)." }),
  endDate: Type.String({ description: "End date (YYYY-MM-DD)." }),
});

const CategoriesSchema = Type.Object({
  type: Type.Optional(
    Type.Number({ description: "Category type: 0=All, 1=Income, 2=Expense. Defaults to 0." }),
  ),
});

const AccountsSchema = Type.Object({});

const DeleteSchema = Type.Object({
  transactionId: Type.String({ description: "The transaction ID to delete." }),
});

// ── Helpers ───────────────────────────────────────────────────

function toUnixSeconds(isoString?: string): number {
  if (!isoString) return Math.floor(Date.now() / 1000);
  return Math.floor(new Date(isoString).getTime() / 1000);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00").getTime() / 1000);
}

type EzbCategory = {
  id: string;
  name: string;
  type: number;
  subCategories?: EzbCategory[] | null;
};

/** Flatten nested category tree into a flat list. */
function flattenCategories(map: Record<string, EzbCategory[]>): EzbCategory[] {
  const result: EzbCategory[] = [];
  for (const cats of Object.values(map)) {
    for (const cat of cats) {
      result.push(cat);
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          result.push(sub);
        }
      }
    }
  }
  return result;
}

/** Find category by name — exact match first, then partial. */
function findCategory(categories: EzbCategory[], name: string, type?: number): EzbCategory | null {
  const filtered = type ? categories.filter((c) => c.type === type) : categories;
  // Exact match
  const exact = filtered.find((c) => c.name === name);
  if (exact) return exact;
  // Contains match
  const partial = filtered.find((c) => c.name.includes(name) || name.includes(c.name));
  return partial || null;
}

type EzbAccount = { id: string; name: string; category: number };

function findAccount(accounts: EzbAccount[], name: string): EzbAccount | null {
  const exact = accounts.find((a) => a.name === name);
  if (exact) return exact;
  const partial = accounts.find((a) => a.name.includes(name) || name.includes(a.name));
  return partial || null;
}

function getUtcOffset(): number {
  return -new Date().getTimezoneOffset();
}

// ── Tool factory ──────────────────────────────────────────────

export function createBookkeepingTools(sessionKey: string): AnyAgentTool[] {
  /** Resolve account ID: by name or default. */
  async function resolveAccountId(accountName?: string, currency?: string): Promise<string> {
    if (accountName) {
      const data = await ezbFetch(sessionKey, "/api/v1/accounts/list.json", { currency });
      const accounts = data.result as EzbAccount[];
      const found = findAccount(accounts, accountName);
      if (found) return found.id;
      throw new Error(
        `Account "${accountName}" not found. Available: ${accounts.map((a) => a.name).join(", ")}`,
      );
    }
    const cred = await ensureAuthenticated(sessionKey, currency);
    return cred.defaultAccountId;
  }

  /** Resolve category ID by name. */
  async function resolveCategoryId(categoryName: string, type: number): Promise<string> {
    const data = await ezbFetch(
      sessionKey,
      `/api/v1/transaction/categories/list.json?type=${type}`,
    );
    const all = flattenCategories(data.result as Record<string, EzbCategory[]>);
    const found = findCategory(all, categoryName, type);
    if (found) return found.id;

    const names = all.map((c) => c.name);
    throw new Error(
      `Category "${categoryName}" not found for type ${type === 2 ? "expense" : "income"}. ` +
        `Available: ${names.join(", ")}. Use bookkeeping_categories to see all options.`,
    );
  }

  // ── Add expense ───────────────────────────────────────────

  const addExpense: AnyAgentTool = {
    label: "Bookkeeping: Add Expense",
    name: "bookkeeping_add_expense",
    description:
      "Record an expense transaction. The user says something like '午饭花了15块' or 'spent 30 on taxi'. " +
      "On first use, pass 'currency' based on user's timezone/locale (e.g. SGD for Singapore, CNY for China).",
    parameters: AddTransactionSchema,
    execute: async (_toolCallId, args) => {
      const { amount, categoryName, comment, time, accountName, currency } = args as {
        amount: number;
        categoryName: string;
        comment?: string;
        time?: string;
        accountName?: string;
        currency?: string;
      };
      const categoryId = await resolveCategoryId(categoryName, 2);
      const accountId = await resolveAccountId(accountName, currency);

      const data = await ezbFetch(sessionKey, "/api/v1/transactions/add.json", {
        method: "POST",
        body: JSON.stringify({
          type: 3, // Expense
          categoryId,
          time: toUnixSeconds(time),
          utcOffset: getUtcOffset(),
          sourceAccountId: accountId,
          sourceAmount: toCents(amount),
          comment: comment || "",
        }),
        utcOffset: getUtcOffset(),
        currency,
      });
      const tx = data.result;
      return jsonResult({
        success: true,
        transaction: {
          id: tx.id,
          type: "expense",
          amount,
          comment: tx.comment,
          time: tx.time,
        },
      });
    },
  };

  // ── Add income ────────────────────────────────────────────

  const addIncome: AnyAgentTool = {
    label: "Bookkeeping: Add Income",
    name: "bookkeeping_add_income",
    description:
      "Record an income transaction. The user says something like '收到工资8000' or 'received 500 bonus'. " +
      "On first use, pass 'currency' based on user's timezone/locale (e.g. SGD for Singapore, CNY for China).",
    parameters: AddTransactionSchema,
    execute: async (_toolCallId, args) => {
      const { amount, categoryName, comment, time, accountName, currency } = args as {
        amount: number;
        categoryName: string;
        comment?: string;
        time?: string;
        accountName?: string;
        currency?: string;
      };
      const categoryId = await resolveCategoryId(categoryName, 1);
      const accountId = await resolveAccountId(accountName, currency);

      const data = await ezbFetch(sessionKey, "/api/v1/transactions/add.json", {
        method: "POST",
        body: JSON.stringify({
          type: 2, // Income
          categoryId,
          time: toUnixSeconds(time),
          utcOffset: getUtcOffset(),
          sourceAccountId: accountId,
          sourceAmount: toCents(amount),
          comment: comment || "",
        }),
        utcOffset: getUtcOffset(),
        currency,
      });
      const tx = data.result;
      return jsonResult({
        success: true,
        transaction: {
          id: tx.id,
          type: "income",
          amount,
          comment: tx.comment,
          time: tx.time,
        },
      });
    },
  };

  // ── List transactions ─────────────────────────────────────

  const listTransactions: AnyAgentTool = {
    label: "Bookkeeping: List Transactions",
    name: "bookkeeping_list",
    description:
      "List recent transactions. Can filter by date range, type, or keyword. Use for queries like '最近的开销' or 'show spending this week'.",
    parameters: ListTransactionsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as {
        startDate?: string;
        endDate?: string;
        type?: number;
        keyword?: string;
        count?: number;
      };
      const count = params.count || 25;
      const qs = new URLSearchParams();
      qs.set("count", String(count));
      if (params.type) qs.set("type", String(params.type));
      if (params.keyword) qs.set("keyword", params.keyword);
      if (params.startDate) qs.set("min_time", String(dateToUnix(params.startDate)));
      if (params.endDate) {
        // End of the end date
        qs.set("max_time", String(dateToUnix(params.endDate) + 86400));
      }
      qs.set("trim_account", "true");
      qs.set("trim_tag", "true");

      const data = await ezbFetch(sessionKey, `/api/v1/transactions/list.json?${qs.toString()}`);
      const result = data.result as { items: any[]; totalCount?: number };
      const items = (result.items || []).map((tx: any) => ({
        id: tx.id,
        type:
          tx.type === 2
            ? "income"
            : tx.type === 3
              ? "expense"
              : tx.type === 4
                ? "transfer"
                : "other",
        amount: (tx.sourceAmount || 0) / 100,
        category: tx.category?.name || tx.categoryId,
        comment: tx.comment,
        time: tx.time,
        account: tx.sourceAccount?.name || tx.sourceAccountId,
      }));
      return jsonResult({ transactions: items, count: items.length });
    },
  };

  // ── Statistics ─────────────────────────────────────────────

  const stats: AnyAgentTool = {
    label: "Bookkeeping: Statistics",
    name: "bookkeeping_stats",
    description:
      "Get spending/income statistics for a date range. Use for queries like '这个月花了多少钱' or 'monthly spending summary'.",
    parameters: StatsSchema,
    execute: async (_toolCallId, args) => {
      const { startDate, endDate } = args as { startDate: string; endDate: string };
      const qs = new URLSearchParams();
      qs.set("start_time", String(dateToUnix(startDate)));
      qs.set("end_time", String(dateToUnix(endDate) + 86400));

      const data = await ezbFetch(
        sessionKey,
        `/api/v1/transactions/statistics.json?${qs.toString()}`,
      );
      const result = data.result as {
        startTime: number;
        endTime: number;
        items: Array<{ categoryId: string; accountId: string; amount: number }>;
      };

      // Also fetch categories to resolve names
      const catData = await ezbFetch(sessionKey, "/api/v1/transaction/categories/list.json");
      const allCats = flattenCategories(catData.result as Record<string, EzbCategory[]>);
      const catMap = new Map(allCats.map((c) => [c.id, c]));

      let totalExpense = 0;
      let totalIncome = 0;
      const byCategory: Array<{ category: string; type: string; amount: number }> = [];

      for (const item of result.items) {
        const cat = catMap.get(item.categoryId);
        const amountYuan = Math.abs(item.amount) / 100;
        const typeName = cat?.type === 1 ? "income" : cat?.type === 2 ? "expense" : "other";
        if (cat?.type === 2) totalExpense += amountYuan;
        if (cat?.type === 1) totalIncome += amountYuan;
        byCategory.push({
          category: cat?.name || item.categoryId,
          type: typeName,
          amount: amountYuan,
        });
      }

      return jsonResult({
        period: { startDate, endDate },
        totalExpense,
        totalIncome,
        balance: totalIncome - totalExpense,
        byCategory,
      });
    },
  };

  // ── List categories ───────────────────────────────────────

  const listCategories: AnyAgentTool = {
    label: "Bookkeeping: List Categories",
    name: "bookkeeping_categories",
    description:
      "List available transaction categories. Useful when the user asks what categories exist or when a category name doesn't match.",
    parameters: CategoriesSchema,
    execute: async (_toolCallId, args) => {
      const { type } = args as { type?: number };
      const qs = type ? `?type=${type}` : "";
      const data = await ezbFetch(sessionKey, `/api/v1/transaction/categories/list.json${qs}`);
      const all = flattenCategories(data.result as Record<string, EzbCategory[]>);
      const categories = all.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type === 1 ? "income" : c.type === 2 ? "expense" : "transfer",
      }));
      return jsonResult({ categories, count: categories.length });
    },
  };

  // ── List accounts ─────────────────────────────────────────

  const listAccounts: AnyAgentTool = {
    label: "Bookkeeping: List Accounts",
    name: "bookkeeping_accounts",
    description: "List all bookkeeping accounts (e.g. cash, bank card).",
    parameters: AccountsSchema,
    execute: async () => {
      const data = await ezbFetch(sessionKey, "/api/v1/accounts/list.json");
      const accounts = (data.result as any[]).map((a: any) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        balance: (a.balance || 0) / 100,
        currency: a.currency,
        hidden: a.hidden,
      }));
      return jsonResult({ accounts, count: accounts.length });
    },
  };

  // ── Delete transaction ────────────────────────────────────

  const deleteTransaction: AnyAgentTool = {
    label: "Bookkeeping: Delete Transaction",
    name: "bookkeeping_delete",
    description: "Delete a transaction by its ID. Use bookkeeping_list first to find the ID.",
    parameters: DeleteSchema,
    execute: async (_toolCallId, args) => {
      const { transactionId } = args as { transactionId: string };
      await ezbFetch(sessionKey, "/api/v1/transactions/delete.json", {
        method: "POST",
        body: JSON.stringify({ id: transactionId }),
      });
      return jsonResult({ deleted: true, transactionId });
    },
  };

  return [
    addExpense,
    addIncome,
    listTransactions,
    stats,
    listCategories,
    listAccounts,
    deleteTransaction,
  ];
}
