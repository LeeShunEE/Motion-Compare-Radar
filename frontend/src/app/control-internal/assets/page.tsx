import { AssetManager } from "@/components/admin/assets/AssetManager";

export default function AdminAssetsPage() {
  return (
    <section aria-labelledby="asset-management-heading">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Public library</p>
      <h1 id="asset-management-heading" className="mt-3 text-3xl font-semibold tracking-tight">公共资源</h1>
      <p className="mb-7 mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        管理所有用户可见的剪影和背景音乐。更改会立即作用于前端选择器与渲染 worker。
      </p>
      <AssetManager />
    </section>
  );
}
