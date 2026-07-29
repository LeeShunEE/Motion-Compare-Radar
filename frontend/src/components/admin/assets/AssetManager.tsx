"use client";

import React from "react";
import { Download, FileAudio, Image, Trash2, Upload } from "lucide-react";

import { useAdminAssets } from "@/hooks/admin/useAdminAssets";
import {
  ApiError,
  assets as publicAssets,
  type AdminAsset,
  type AssetCategory,
} from "@/lib/api-client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const categoryDetails: Record<
  AssetCategory,
  { title: string; accept: string; icon: typeof Image }
> = {
  silhouettes: {
    title: "剪影",
    accept: ".png,.jpg,.jpeg,.gif,.svg,.webp",
    icon: Image,
  },
  music: {
    title: "音乐",
    accept: ".mp3,.wav,.ogg,.m4a,.aac,.flac",
    icon: FileAudio,
  },
};

function AssetRow({
  asset,
  onDelete,
}: {
  asset: AdminAsset;
  onDelete: () => void;
}) {
  return (
    <li className="grid gap-3 border-t border-cyan-100/10 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-100">{asset.name}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {formatBytes(asset.size_bytes)} · {new Date(asset.modified_at).toLocaleString()}
        </p>
      </div>
      <div className="flex gap-2">
        <a
          className="inline-flex size-9 items-center justify-center border border-cyan-200/20 text-cyan-200 hover:bg-cyan-200/10 focus-visible:outline-2 focus-visible:outline-cyan-300"
          href={publicAssets.url(asset.category, asset.name)}
          aria-label={`下载 ${asset.name}`}
        >
          <Download className="size-4" />
        </a>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center border border-red-300/20 text-red-300 hover:bg-red-300/10 focus-visible:outline-2 focus-visible:outline-red-300"
          aria-label={`删除 ${asset.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

export function AssetManager() {
  const { assets, loading, error, upload, remove } = useAdminAssets();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);

  const handleUpload = async (category: AssetCategory, file: File) => {
    setActionError(null);
    setProgress(0);
    try {
      await upload(category, file, false, setProgress);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === "asset_conflict" &&
        window.confirm(`“${file.name}” 已存在。确认覆盖现有公共资源？`)
      ) {
        await upload(category, file, true, setProgress);
      } else {
        setActionError(caught instanceof Error ? caught.message : "上传失败");
      }
    } finally {
      setProgress(null);
    }
  };

  const handleDelete = async (category: AssetCategory, name: string) => {
    if (!window.confirm(`确认删除公共资源“${name}”？此操作无法撤销。`)) return;
    try {
      await remove(category, name);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      {(error || actionError) && (
        <div role="alert" className="border border-red-300/30 bg-red-300/5 px-4 py-3 text-sm text-red-200">
          {actionError ?? error}
        </div>
      )}
      {progress !== null && (
        <div aria-label="上传进度" className="h-1 bg-slate-800">
          <div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {(Object.keys(categoryDetails) as AssetCategory[]).map((category) => {
          const details = categoryDetails[category];
          const Icon = details.icon;
          return (
            <section key={category} className="border border-cyan-100/10 bg-[#0d1b2e] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-cyan-300">
                    <Icon className="size-4" />
                    <h2 className="text-lg font-semibold text-slate-100">{details.title}</h2>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{details.accept.replaceAll(",", " · ")}</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-cyan-300/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10 focus-within:outline-2 focus-within:outline-cyan-300">
                  <Upload className="size-4" /> 上传
                  <input
                    className="sr-only"
                    type="file"
                    accept={details.accept}
                    aria-label={`上传${details.title}`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(category, file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {loading ? (
                <p className="py-8 text-sm text-slate-500">正在读取资源…</p>
              ) : assets[category].length === 0 ? (
                <p className="mt-5 border-t border-cyan-100/10 py-8 text-sm text-slate-500">尚未上传{details.title}资源。</p>
              ) : (
                <ul className="mt-5">
                  {assets[category].map((asset) => (
                    <AssetRow
                      key={asset.name}
                      asset={asset}
                      onDelete={() => void handleDelete(category, asset.name)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
