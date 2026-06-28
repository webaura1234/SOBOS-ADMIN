import { NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export async function GET() {
  const { data, error } = await db()
    .from("Location")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) sbError(error, "locations/GET");
  return NextResponse.json(data ?? []);
}
