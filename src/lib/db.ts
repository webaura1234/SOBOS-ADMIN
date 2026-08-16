import { prisma } from "@/lib/prisma";

export function sbError(error: { message: string } | null, context: string): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

function modelDelegate(tableName: string) {
  const modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
  const delegate = (prisma as unknown as Record<string, unknown>)[modelName];
  if (!delegate) throw new Error(`Prisma model '${modelName}' not found`);
  return { modelName, delegate: delegate as any };
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function relationNameFromHead(head: string): string {
  const cleaned = head.replace(/!inner/gi, "").trim();
  const colon = cleaned.indexOf(":");
  const name = colon >= 0 ? cleaned.slice(0, colon).trim() : cleaned;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function wrapRelation(parsed: ReturnType<typeof parseSelect>) {
  if (!parsed) return true;
  if (parsed.include) return { include: parsed.include };
  if (parsed.select) {
    const values = Object.values(parsed.select);
    const onlyNestedRelations = values.length > 0 && values.every((value) => value !== true && typeof value === "object");
    if (onlyNestedRelations) return { include: parsed.select };
    return { select: parsed.select };
  }
  return true;
}

/** Parse PostgREST-style select strings into Prisma select/include. */
function parseSelect(selectClause?: string): { include?: Record<string, any>; select?: Record<string, any> } | undefined {
  if (!selectClause || selectClause === "*") return undefined;

  const parts = splitTopLevel(selectClause);
  const hasStar = parts.includes("*");
  const relations: Record<string, any> = {};
  const scalars: Record<string, true> = {};

  for (const part of parts) {
    if (part === "*") continue;
    const open = part.indexOf("(");
    if (open > 0 && part.endsWith(")")) {
      const head = part.slice(0, open).trim();
      const inner = part.slice(open + 1, -1).trim();
      relations[relationNameFromHead(head)] = wrapRelation(parseSelect(inner || "*"));
    } else {
      scalars[part.trim()] = true;
    }
  }

  if (hasStar) {
    if (Object.keys(relations).length === 0) return undefined;
    return { include: relations };
  }

  if (Object.keys(scalars).length === 0 && Object.keys(relations).length > 0) {
    return { include: relations };
  }

  const select = { ...scalars, ...relations };
  return Object.keys(select).length > 0 ? { select } : undefined;
}

function coerceValue(val: unknown) {
  if (typeof val === "string" && val.includes("-") && !Number.isNaN(Date.parse(val)) && (val.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(val))) {
    return new Date(val);
  }
  return val;
}

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  if (cursor[last] && typeof cursor[last] === "object" && value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    cursor[last] = { ...cursor[last], ...value };
  } else {
    cursor[last] = value;
  }
}

function containsFilter(pattern: string) {
  return { contains: String(pattern).replace(/^%/, "").replace(/%$/, ""), mode: "insensitive" as const };
}

function parseOrFilter(filter: string) {
  return splitTopLevel(filter)
    .map((token) => {
      const match = token.trim().match(/^([A-Za-z0-9_]+)\.([A-Za-z]+)\.(.*)$/);
      if (!match) return null;
      const [, field, op, raw] = match;
      if (op === "ilike" || op === "like") return { [field]: containsFilter(raw) };
      if (op === "eq") return { [field]: coerceValue(raw) };
      if (op === "neq") return { [field]: { not: coerceValue(raw) } };
      return null;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function uniqueWhere(payload: Record<string, any>, onConflict?: string) {
  if (payload?.id) return { id: payload.id };
  const fields = (onConflict ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  if (fields.length === 1) return { [fields[0]]: payload[fields[0]] };
  if (fields.length > 1) {
    return { [fields.join("_")]: Object.fromEntries(fields.map((field) => [field, payload[field]])) };
  }
  throw new Error("upsert requires an id or onConflict columns");
}

function applyParsed(queryArgs: Record<string, any>, parsed?: ReturnType<typeof parseSelect>) {
  if (!parsed) return;
  if (parsed.include) queryArgs.include = parsed.include;
  if (parsed.select) queryArgs.select = parsed.select;
}

class QueryBuilder {
  private modelName: string;
  private whereClause: Record<string, any> = {};
  private orClause: Record<string, any>[] = [];
  private orderByClause: Record<string, any>[] = [];
  private limitValue?: number;
  private skipValue?: number;
  private selectClause?: string;
  private countMode?: boolean;
  private headOnly?: boolean;

  constructor(tableName: string) {
    this.modelName = tableName;
  }

  select(selection?: string, opts?: { count?: string; head?: boolean }) {
    this.selectClause = selection;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  eq(field: string, val: any) {
    setPath(this.whereClause, field, val);
    return this;
  }

  neq(field: string, val: any) {
    setPath(this.whereClause, field, { not: val });
    return this;
  }

  gt(field: string, val: any) {
    setPath(this.whereClause, field, { gt: coerceValue(val) });
    return this;
  }

  gte(field: string, val: any) {
    setPath(this.whereClause, field, { gte: coerceValue(val) });
    return this;
  }

  lt(field: string, val: any) {
    setPath(this.whereClause, field, { lt: coerceValue(val) });
    return this;
  }

  lte(field: string, val: any) {
    setPath(this.whereClause, field, { lte: coerceValue(val) });
    return this;
  }

  in(field: string, vals: any[]) {
    setPath(this.whereClause, field, { in: vals });
    return this;
  }

  not(field: string, op: string, val: any) {
    if (op === "eq" || op === "is") setPath(this.whereClause, field, { not: val });
    return this;
  }

  ilike(field: string, pattern: string) {
    setPath(this.whereClause, field, containsFilter(pattern));
    return this;
  }

  or(filter: string) {
    this.orClause.push(...parseOrFilter(filter));
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const clean = field.trim();
    if (clean.includes("(") && clean.endsWith(")")) {
      const open = clean.indexOf("(");
      const head = clean.slice(0, open).trim();
      const inner = clean.slice(open + 1, -1).trim();
      const relation = relationNameFromHead(head);
      this.orderByClause.push({ [relation]: { [inner]: dir } });
    } else if (clean.includes(".")) {
      const parts = clean.split(".");
      let obj: Record<string, any> = { [parts[parts.length - 1]]: dir };
      for (let i = parts.length - 2; i >= 0; i--) {
        obj = { [relationNameFromHead(parts[i])]: obj };
      }
      this.orderByClause.push(obj);
    } else {
      this.orderByClause.push({ [clean]: dir });
    }
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

  private prismaWhere() {
    if (this.orClause.length === 0) return this.whereClause;
    return { ...this.whereClause, OR: this.orClause };
  }

  async execute() {
    const { modelName, delegate } = modelDelegate(this.modelName);
    try {
      const where = this.prismaWhere();

      if (this.headOnly && this.countMode) {
        const count = await delegate.count({ where });
        return { data: null, count, error: null };
      }

      const queryArgs: any = { where };
      if (this.orderByClause.length > 0) queryArgs.orderBy = this.orderByClause;
      if (this.limitValue !== undefined) queryArgs.take = this.limitValue;
      if (this.skipValue !== undefined) queryArgs.skip = this.skipValue;
      applyParsed(queryArgs, parseSelect(this.selectClause));

      const data = await delegate.findMany(queryArgs);
      const count = this.countMode ? await delegate.count({ where }) : null;
      return { data, count, error: null };
    } catch (err: any) {
      console.error(`Prisma adapter error (${modelName}):`, err);
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

  insert(payload: any) {
    return new WriteBuilder(this.modelName, "insert", payload);
  }

  update(payload: any) {
    return new WriteBuilder(this.modelName, "update", payload);
  }

  upsert(payload: any, opts?: { onConflict?: string }) {
    return new WriteBuilder(this.modelName, "upsert", payload, opts);
  }

  delete() {
    return new WriteBuilder(this.modelName, "delete", null);
  }
}

class WriteBuilder {
  private whereClause: Record<string, any> = {};
  private selectClause?: string;

  constructor(
    private tableName: string,
    private op: "insert" | "update" | "upsert" | "delete",
    private payload: any,
    private opts?: { onConflict?: string },
  ) {}

  eq(field: string, val: any) {
    setPath(this.whereClause, field, val);
    return this;
  }

  neq(field: string, val: any) {
    setPath(this.whereClause, field, { not: val });
    return this;
  }

  in(field: string, vals: any[]) {
    setPath(this.whereClause, field, { in: vals });
    return this;
  }

  select(selection?: string) {
    this.selectClause = selection;
    return this;
  }

  private parsed() {
    return parseSelect(this.selectClause);
  }

  async single() {
    const { modelName, delegate } = modelDelegate(this.tableName);
    try {
      const parsed = this.parsed();
      if (this.op === "insert") {
        if (Array.isArray(this.payload)) {
          await delegate.createMany({ data: this.payload });
          return { data: this.payload, error: null };
        }
        const args: any = { data: this.payload };
        applyParsed(args, parsed);
        const data = await delegate.create(args);
        return { data, error: null };
      }

      if (this.op === "upsert") {
        const { id: _id, ...updateData } = this.payload ?? {};
        void _id;
        const args: any = {
          where: uniqueWhere(this.payload, this.opts?.onConflict),
          create: this.payload,
          update: updateData,
        };
        applyParsed(args, parsed);
        const data = await delegate.upsert(args);
        return { data, error: null };
      }

      const record = await delegate.findFirst({ where: this.whereClause });
      if (!record) return { data: null, error: { message: "Record to update not found" } };
      await delegate.update({ where: { id: record.id }, data: this.payload });
      const readArgs: any = { where: { id: record.id } };
      applyParsed(readArgs, parsed);
      const data = await delegate.findUnique(readArgs);
      return { data, error: null };
    } catch (err: any) {
      console.error(`Prisma adapter error (${modelName}/${this.op}):`, err);
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }

  async execute() {
    const { modelName, delegate } = modelDelegate(this.tableName);
    try {
      if (this.op === "insert") {
        if (Array.isArray(this.payload)) {
          await delegate.createMany({ data: this.payload });
          return { data: this.payload, error: null };
        }
        const data = await delegate.create({ data: this.payload });
        return { data, error: null };
      }
      if (this.op === "upsert") {
        const { id: _id, ...updateData } = this.payload ?? {};
        void _id;
        const data = await delegate.upsert({
          where: uniqueWhere(this.payload, this.opts?.onConflict),
          create: this.payload,
          update: updateData,
        });
        return { data, error: null };
      }
      if (this.op === "delete") {
        const data = await delegate.deleteMany({ where: this.whereClause });
        return { data, error: null };
      }
      const data = await delegate.updateMany({ where: this.whereClause, data: this.payload });
      return { data, error: null };
    } catch (err: any) {
      console.error(`Prisma adapter error (${modelName}/${this.op}):`, err);
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function db(): any {
  return {
    from(tableName: string) {
      return new QueryBuilder(tableName);
    },
  };
}
