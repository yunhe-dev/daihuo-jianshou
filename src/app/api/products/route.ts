import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";

export async function GET() {
  try {
    const db = getDb();
    const result = await db.select().from(products).orderBy(desc(products.createdAt));
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取商品列表失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取商品列表失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "商品名称不能为空" }, { status: 400 });
    }

    const inserted = await db
      .insert(products)
      .values({
        id: body.id,
        name: body.name.trim(),
        category: body.category || "other",
        description: body.description || null,
        images: Array.isArray(body.images) ? body.images : [],
        price: body.price || null,
        targetAudience: body.targetAudience || null,
        videoCount: typeof body.videoCount === "number" ? body.videoCount : 0,
      })
      .returning();

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    console.error("创建商品失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建商品失败" },
      { status: 500 }
    );
  }
}
