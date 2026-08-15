import { prisma } from "@/lib/prisma";

export function sbError(error: { message: string } | null, context: string): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

class QueryBuilder {
  private modelName: string;
  private whereClause: Record<string, any> = {};
  private orderByClause: Record<string, "asc" | "desc">[] = [];
  private limitValue?: number;
  private skipValue?: number;
  private selectClause?: string;
  private countMode?: boolean;
  private headOnly?: boolean;

  constructor(tableName: string) {
    this.modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
  }

  select(selection?: string, opts?: { count?: string; head?: boolean }) {
    this.selectClause = selection;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  eq(field: string, val: any) {
    this.whereClause[field] = val;
    return this;
  }

  neq(field: string, val: any) {
    this.whereClause[field] = { not: val };
    return this;
  }

  gt(field: string, val: any) {
    this.whereClause[field] = { gt: val };
    return this;
  }

  gte(field: string, val: any) {
    const parsedVal = typeof val === "string" && !isNaN(Date.parse(val)) && val.includes("-") ? new Date(val) : val;
    this.whereClause[field] = { gte: parsedVal };
    return this;
  }

  lt(field: string, val: any) {
    this.whereClause[field] = { lt: val };
    return this;
  }

  lte(field: string, val: any) {
    const parsedVal = typeof val === "string" && !isNaN(Date.parse(val)) && val.includes("-") ? new Date(val) : val;
    this.whereClause[field] = { lte: parsedVal };
    return this;
  }

  in(field: string, vals: any[]) {
    this.whereClause[field] = { in: vals };
    return this;
  }

  not(field: string, op: string, val: any) {
    if (op === "eq") this.whereClause[field] = { not: val };
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }) {
    this.orderByClause.push({ [field]: opts?.ascending === false ? "desc" : "asc" });
    return this;
  }

  limit(n: number) {
    this.limitValue = n;
    return this;
  }

  range(from: number, to: number) {
    this.skipValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  async execute() {
    try {
      const delegate = (prisma as any)[this.modelName];
      if (!delegate) {
        throw new Error(`Prisma model '${this.modelName}' not found`);
      }

      if (this.headOnly && this.countMode) {
        const count = await delegate.count({ where: this.whereClause });
        return { data: null, count, error: null };
      }

      const include = this.parseInclude();
      const queryArgs: any = {
        where: this.whereClause,
      };

      if (this.orderByClause.length > 0) {
        queryArgs.orderBy = this.orderByClause;
      }
      if (this.limitValue !== undefined) {
        queryArgs.take = this.limitValue;
      }
      if (this.skipValue !== undefined) {
        queryArgs.skip = this.skipValue;
      }
      if (include) {
        queryArgs.include = include;
      }

      const data = await delegate.findMany(queryArgs);
      let count = null;
      if (this.countMode) {
        count = await delegate.count({ where: this.whereClause });
      }

      return { data, count, error: null };
    } catch (err: any) {
      console.error(`Prisma adapter error (${this.modelName}):`, err);
      return { data: null, count: null, error: { message: err?.message ?? String(err) } };
    }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async single() {
    const res = await this.limit(1).execute();
    if (res.error) return res;
    if (!res.data || res.data.length === 0) {
      return { data: null, count: null, error: { message: "Row not found" } };
    }
    return { data: res.data[0], count: null, error: null };
  }

  async maybeSingle() {
    const res = await this.limit(1).execute();
    if (res.error) return res;
    return { data: res.data?.[0] ?? null, count: null, error: null };
  }

  async insert(payload: any) {
    try {
      const delegate = (prisma as any)[this.modelName];
      if (Array.isArray(payload)) {
        await delegate.createMany({ data: payload });
        return { data: payload, error: null };
      } else {
        const data = await delegate.create({ data: payload });
        return { data, error: null };
      }
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }

  async update(payload: any) {
    const self = this;
    return {
      eq(field: string, val: any) {
        self.eq(field, val);
        return this;
      },
      select(sel?: string) {
        return this;
      },
      async single() {
        try {
          const delegate = (prisma as any)[self.modelName];
          const record = await delegate.findFirst({ where: self.whereClause });
          if (!record) return { data: null, error: { message: "Record to update not found" } };
          const data = await delegate.update({
            where: { id: record.id },
            data: payload,
          });
          return { data, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err?.message ?? String(err) } };
        }
      },
      then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
        const run = async () => {
          try {
            const delegate = (prisma as any)[self.modelName];
            const data = await delegate.updateMany({
              where: self.whereClause,
              data: payload,
            });
            return { data, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err?.message ?? String(err) } };
          }
        };
        return run().then(onfulfilled, onrejected);
      },
    };
  }

  async delete() {
    const self = this;
    return {
      eq(field: string, val: any) {
        self.eq(field, val);
        return this;
      },
      then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
        const run = async () => {
          try {
            const delegate = (prisma as any)[self.modelName];
            const data = await delegate.deleteMany({
              where: self.whereClause,
            });
            return { data, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err?.message ?? String(err) } };
          }
        };
        return run().then(onfulfilled, onrejected);
      },
    };
  }

  private parseInclude(): any {
    if (!this.selectClause || this.selectClause === "*") return undefined;
    const includes: Record<string, any> = {};

    if (this.selectClause.includes("Restaurant")) includes.restaurant = true;
    if (this.selectClause.includes("Location")) includes.location = true;
    if (this.selectClause.includes("Ingredient")) includes.ingredient = true;
    if (this.selectClause.includes("UserLocationRole")) {
      includes.locationRoles = {
        include: {
          location: true,
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      };
    }
    if (this.selectClause.includes("Role")) includes.role = true;
    if (this.selectClause.includes("Permission")) includes.permission = true;
    if (this.selectClause.includes("OrderItem") || this.selectClause.includes("items")) includes.items = true;
    if (this.selectClause.includes("Recipe")) includes.recipe = true;
    if (this.selectClause.includes("Stock")) includes.stock = true;

    return Object.keys(includes).length > 0 ? includes : undefined;
  }
}

export function db(): any {
  return {
    from(tableName: string) {
      return new QueryBuilder(tableName);
    },
  };
}
