"use client";

import React from "react";

import {
  admin,
  type AdminAsset,
  type AssetCategory,
} from "@/lib/api-client";

type AssetMap = Record<AssetCategory, AdminAsset[]>;

const emptyAssets: AssetMap = { silhouettes: [], music: [] };

export function useAdminAssets() {
  const [assets, setAssets] = React.useState<AssetMap>(emptyAssets);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (category?: AssetCategory) => {
    setError(null);
    try {
      if (category) {
        const list = await admin.listAssets(category);
        setAssets((current) => ({ ...current, [category]: list }));
        return;
      }
      const [silhouettes, music] = await Promise.all([
        admin.listAssets("silhouettes"),
        admin.listAssets("music"),
      ]);
      setAssets({ silhouettes, music });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "公共资源加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = React.useCallback(
    async (
      category: AssetCategory,
      file: File,
      overwrite: boolean,
      onProgress?: (percent: number) => void,
    ) => {
      await admin.uploadAsset(category, file, overwrite, onProgress);
      await refresh(category);
    },
    [refresh],
  );

  const remove = React.useCallback(
    async (category: AssetCategory, name: string) => {
      await admin.deleteAsset(category, name);
      await refresh(category);
    },
    [refresh],
  );

  return { assets, loading, error, refresh, upload, remove };
}
