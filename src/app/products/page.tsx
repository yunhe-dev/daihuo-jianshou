"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  LuArrowLeft,
  LuImage,
  LuPackage,
  LuPencil,
  LuPlus,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const categoryOptions = [
  { value: "beauty", label: "美妆护肤" },
  { value: "food", label: "食品零食" },
  { value: "home", label: "家居日用" },
  { value: "fashion", label: "服饰鞋包" },
  { value: "tech", label: "数码3C" },
  { value: "other", label: "其他" },
] as const;

const categoryColorMap: Record<string, string> = {
  beauty: "bg-pink-500/20 text-pink-400",
  food: "bg-amber-500/20 text-amber-400",
  home: "bg-blue-500/20 text-blue-400",
  fashion: "bg-purple-500/20 text-purple-400",
  tech: "bg-cyan-500/20 text-cyan-400",
  other: "bg-zinc-500/20 text-zinc-400",
};

const categoryLabelMap: Record<string, string> = Object.fromEntries(
  categoryOptions.map((opt) => [opt.value, opt.label])
);

type Product = {
  id: string;
  name: string;
  category: "beauty" | "food" | "home" | "fashion" | "tech" | "other";
  description?: string | null;
  images: string[];
  price?: string | null;
  targetAudience?: string | null;
  videoCount: number | null;
  createdAt?: string | null;
};

type UploadImage = {
  id: string;
  url: string;
  file?: File;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("other");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [images, setImages] = useState<UploadImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrls = useMemo(
    () => images.filter((img) => img.file).map((img) => img.url),
    [images]
  );

  useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [previewUrls]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        throw new Error("商品列表加载失败");
      }
      const data = (await res.json()) as Product[];
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "商品列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const resetForm = useCallback(() => {
    setName("");
    setCategory("other");
    setDescription("");
    setPrice("");
    setTargetAudience("");
    setImages((prev) => {
      prev.forEach((img) => {
        if (img.file) URL.revokeObjectURL(img.url);
      });
      return [];
    });
    setEditingId(null);
    setIsFormOpen(false);
    setError(null);
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = 5 - images.length;
      if (remaining <= 0) return;

      const newImages = Array.from(files)
        .slice(0, remaining)
        .filter((file) => file.type.startsWith("image/"))
        .map((file) => ({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(file),
          file,
        }));

      setImages((prev) => [...prev, ...newImages]);
    },
    [images.length]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.file) URL.revokeObjectURL(target.url);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const startEdit = useCallback((product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category);
    setDescription(product.description || "");
    setPrice(product.price || "");
    setTargetAudience(product.targetAudience || "");
    setImages(
      (product.images || []).map((url) => ({
        id: crypto.randomUUID(),
        url,
      }))
    );
    setIsFormOpen(true);
    setError(null);
  }, []);

  const uploadNewFiles = useCallback(async (productId: string) => {
    const newFiles = images.filter((img) => img.file);
    if (newFiles.length === 0) {
      return [];
    }

    const formData = new FormData();
    newFiles.forEach((img) => {
      if (img.file) formData.append("files", img.file);
    });
    formData.append("projectId", productId);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "商品图片上传失败");
    }

    const data = (await res.json()) as { paths: string[] };
    return data.paths;
  }, [images]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    setError(null);
    const productId = editingId || crypto.randomUUID();

    try {
      const existingImages = images.filter((img) => !img.file).map((img) => img.url);
      const uploadedImages = await uploadNewFiles(productId);
      const payload = {
        id: productId,
        name: name.trim(),
        category,
        description: description.trim() || null,
        images: [...existingImages, ...uploadedImages],
        price: price.trim() || null,
        targetAudience: targetAudience.trim() || null,
      };

      const res = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "商品保存失败");
      }

      await loadProducts();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "商品保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [
    category,
    description,
    editingId,
    images,
    isSaving,
    loadProducts,
    name,
    price,
    resetForm,
    targetAudience,
    uploadNewFiles,
  ]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error("商品删除失败");
        }
        if (editingId === id) {
          resetForm();
        }
        await loadProducts();
      } catch (err) {
        setError(err instanceof Error ? err.message : "商品删除失败");
      }
    },
    [editingId, loadProducts, resetForm]
  );

  return (
    <div className="min-h-screen grid-bg">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">商品库</span>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <LuArrowLeft className="w-4 h-4" />
              <span className="ml-1.5">返回首页</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="brand-gradient-text">商品库</span>管理
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              集中管理你的商品信息，创建项目时可快速选用
            </p>
          </div>
          {!isFormOpen && (
            <Button
              className="brand-gradient text-white"
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
            >
              <LuPlus className="mr-1.5 h-4 w-4" />
              添加商品
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {isFormOpen && (
          <Card className="glass-card mb-8 ring-1 ring-primary/30">
            <CardContent className="space-y-5 p-5">
              <h3 className="text-sm font-semibold">{editingId ? "编辑商品" : "添加商品"}</h3>

              <div className="space-y-2">
                <Label htmlFor="productName" className="text-sm font-medium">
                  商品名称
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="productName"
                  placeholder="例如：小米手环8 NFC版"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border/50 bg-muted/30 focus:border-primary"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">商品品类</Label>
                <Select value={category} onValueChange={(val) => setCategory((val ?? "other") as Product["category"])}>
                  <SelectTrigger className="w-full border-border/50 bg-muted/30">
                    <SelectValue placeholder="选择商品品类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="text-sm font-medium">
                    卖点描述
                  </Label>
                  <span className="text-xs text-muted-foreground">选填</span>
                </div>
                <Textarea
                  id="description"
                  placeholder="描述商品的核心卖点、独特优势..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="resize-none border-border/50 bg-muted/30 focus:border-primary"
                />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Label className="text-sm font-medium">商品图片</Label>
                  <span className="text-xs text-muted-foreground">{images.length}/5 张</span>
                </div>

                {images.length < 5 && (
                  <div
                    className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/50 hover:bg-muted/20"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                        <LuImage className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          拖拽图片到这里，或 <span className="font-semibold brand-gradient-text">点击上传</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          支持 JPG / PNG / WebP，最多 5 张
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {images.length > 0 && (
                  <div className={`grid grid-cols-3 gap-3 sm:grid-cols-5 ${images.length < 5 ? "mt-4" : ""}`}>
                    {images.map((img) => (
                      <div
                        key={img.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-border/50 bg-muted/20"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="商品图片" className="h-full w-full object-cover" />
                        <button
                          onClick={() => removeImage(img.id)}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
                        >
                          <LuX className="h-3 w-3" />
                        </button>
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="price" className="text-sm font-medium">
                      价格信息
                    </Label>
                    <span className="text-xs text-muted-foreground">选填</span>
                  </div>
                  <Input
                    id="price"
                    placeholder="例如：¥199"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="border-border/50 bg-muted/30 focus:border-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="targetAudience" className="text-sm font-medium">
                      目标人群
                    </Label>
                    <span className="text-xs text-muted-foreground">选填</span>
                  </div>
                  <Input
                    id="targetAudience"
                    placeholder="例如：18-35岁女性"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="border-border/50 bg-muted/30 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  取消
                </Button>
                <Button
                  size="sm"
                  className="brand-gradient text-white"
                  onClick={() => void handleSave()}
                  disabled={!name.trim() || isSaving}
                >
                  {isSaving ? "保存中..." : editingId ? "保存修改" : "添加商品"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              正在加载商品...
            </CardContent>
          </Card>
        ) : products.length === 0 && !isFormOpen ? (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                <LuPackage className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mb-4 text-muted-foreground">还没有商品，添加你的第一个商品</p>
              <Button
                className="brand-gradient text-white"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(true);
                }}
              >
                <LuPlus className="mr-1.5 h-4 w-4" />
                添加商品
              </Button>
            </CardContent>
          </Card>
        ) : (
          products.length > 0 && (
            <div>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">全部商品</h2>
                <span className="text-sm text-muted-foreground">{products.length} 个商品</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <Card key={product.id} className="glass-card group cursor-pointer card-hover">
                    <CardContent className="p-0">
                      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted/30">
                        {product.images.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <LuImage className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="absolute left-2 top-2">
                          <Badge
                            className={`${
                              categoryColorMap[product.category] || categoryColorMap.other
                            } border-0 text-xs`}
                          >
                            {categoryLabelMap[product.category] || "其他"}
                          </Badge>
                        </div>
                        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(product);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-primary"
                          >
                            <LuPencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(product.id);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-red-500"
                          >
                            <LuTrash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                          {product.name}
                        </h3>
                        <div className="mt-2 flex items-center justify-between">
                          {product.price ? (
                            <span className="text-xs font-medium text-primary">{product.price}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">未设置价格</span>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {product.videoCount ?? 0} 个视频
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
